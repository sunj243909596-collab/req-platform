// Agent service — orchestrates LLM + RAG + Analysis for the server
import type {
  ChatMessage, ChatRequest, ChatResponse, ConversationInfo,
  AnalysisResult, FeasibilityAssessment, SolutionPreview,
  KnowledgeBaseStatus, AgentConfig,
} from "shared-types";

import {
  buildKnowledgeContext, buildTableGroundingBlock, extractGroundedTableNames,
  ConversationManager, findSimilarRequirements, detectDuplicates,
  assessFeasibility, generateSolution, estimateEffort,
  suggestSchedule, analyzeDependencies,
} from "agent";
import type { SimilarReqResult } from "agent";
import { readConfig } from "./agent-config.service";
import { resolveSystemPrompt, getConfigSystemPromptOverrides } from "./system-prompt-resolver";
import {
  smartSearch,
  buildRagRetrievalMeta,
  type RagSearchOptions,
} from "./rag-search.service";
import { embedQueryText, getEmbedder } from "./embedder.service";
import { readDocumentText } from "./document-text.service";
import { expandSearchQueries } from "agent";
import { getLLM } from "./llm.service";
import { resolveSkillPrompt } from "./skill.service";

const convManager = new ConversationManager(getLLM());

// ==================== Chat ====================

export async function chat(
  userId: number,
  req: ChatRequest,
  store: AgentDataStore
): Promise<ChatResponse> {
  const llm = getLLM();
  const cfg = readConfig();

  // Get or create conversation
  let conversationId = req.conversationId;
  if (!conversationId) {
    const conv = await store.createConversation({
      userId,
      contextType: "chat",
    });
    conversationId = conv.id;
  }

  // Load existing messages
  const messages = await store.getConversationMessages(conversationId);

  const systemPrompt = resolveSystemPrompt("chat", undefined, cfg);
  const ctx = await convManager.buildContext(messages, systemPrompt);
  ctx.messages.push({ role: "user", content: req.message });

  // Call LLM
  const result = await llm.chat({
    systemPrompt,
    messages: ctx.messages,
    temperature: 0.7,
  });

  // Save messages
  await store.addMessage(conversationId, "user", req.message);
  const aiMsg = await store.addMessage(conversationId, "assistant", result.content);

  return {
    conversationId,
    message: { role: "assistant", content: result.content },
    tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
  };
}

export async function* chatStream(
  userId: number,
  req: ChatRequest,
  store: AgentDataStore
): AsyncIterable<{ type: string; content: string }> {
  const llm = getLLM();
  const cfg = readConfig();
  const rag = cfg.rag;

  let conversationId = req.conversationId;
  if (!conversationId) {
    // Auto-title from first message (first 30 chars)
    const title = req.message.replace(/\s+/g, ' ').trim().slice(0, 30);
    const conv = await store.createConversation({ userId, contextType: "chat", title });
    conversationId = conv.id;
  }

  // Yield start IMMEDIATELY so the client has conversationId even if later steps fail.
  // This prevents duplicate conversations in the onError fallback path.
  yield { type: "start", content: JSON.stringify({ conversationId }) };

  const messages = await store.getConversationMessages(conversationId);

  const systemPrompt = resolveSystemPrompt("chat", undefined, cfg);
  const ctx = await convManager.buildContext(messages, systemPrompt);

  const searchOpts: RagSearchOptions = { topK: rag.topK };
  if (cfg.rag.hydeEnabled) {
    searchOpts.extraQueries = await buildHydeQueries(req.message);
  }

  const { chunks: kbChunks, routing, rerankMethod } = await smartSearch(req.message, store, embedQueryText, searchOpts);
  const ragMeta = buildRagRetrievalMeta(kbChunks, routing, rerankMethod);

  const groundedTables = extractGroundedTableNames(kbChunks);
  let kbContext = buildKnowledgeContext(kbChunks, rag.contextMaxTokens);
  if (routing && kbContext) {
    const rerankNote = rerankMethod === "llm" ? "；重排：LLM 语义" : "";
    kbContext =
      `【检索范围】${routing.labels.join("、")}（${routing.reason}；路由：${routing.method}${rerankNote}）\n\n` +
      kbContext;
  }
  const tableBlock = buildTableGroundingBlock(groundedTables);

  // 空召回时显式注入"0 片段"信号，避免 LLM 在缺少证据时编造事实（修复 RAG 幻觉）
  const emptyRetrievalNotice =
    kbChunks.length === 0
      ? `\n\n## 检索结果\n本次知识库检索 **0 条片段**。\n根据反幻觉硬性约束第 9 条：禁止给出任何事实性回答（数字、表名、字段、流程、状态码），只能告知用户"本次知识库未检索到相关片段，无法回答此问题，建议改用更具体的关键词或直接查询数据库"。`
      : "";

  const fullPrompt = kbContext
    ? `${systemPrompt}\n\n${tableBlock}\n\n相关知识库内容：\n${kbContext}`
    : `${systemPrompt}\n\n${tableBlock}${emptyRetrievalNotice}`;

  yield { type: "rag", content: JSON.stringify(ragMeta) };

  await store.addMessage(conversationId, "user", req.message);

  let fullContent = "";
  let thinkingContent = "";
  for await (const chunk of llm.chatStream({
    systemPrompt: fullPrompt,
    messages: [...ctx.messages, { role: "user", content: req.message }],
    temperature: rag.chatTemperature,
  })) {
    if (chunk.type === "thinking") {
      thinkingContent += chunk.content;
      yield { type: "thinking", content: chunk.content };
    } else if (chunk.type === "text") {
      fullContent += chunk.content;
      yield { type: "text", content: chunk.content };
    }
  }

  await store.addMessage(conversationId, "assistant", fullContent, { rag: ragMeta, thinking: thinkingContent || undefined });
  yield { type: "done", content: "" };
}

// ==================== Analysis ====================

export async function analyzeRequirement(
  reqId: number,
  reqData: { title: string; description?: string; module?: string; terminals?: string[]; relatedTables?: string },
  store: AgentDataStore
): Promise<AnalysisResult> {
  const llm = getLLM();
  const cfg = readConfig();
  const promptOverrides = getConfigSystemPromptOverrides(cfg) || {};
  const rag = cfg.rag;

  // Resolve Skill for analyzeRequirement — if assigned, use its prompt instead of built-in
  try {
    const skill = await resolveSkillPrompt("analyzeRequirement", {
      title: reqData.title,
      description: reqData.description || "",
      background: reqData.module ? `- 模块：${reqData.module}` : "",
      module: reqData.module || "未指定",
    });
    if (skill) {
      promptOverrides.requirementAnalysis = skill.systemPrompt;
      console.log(`[analyzeRequirement] Using skill: ${skill.name}`);
    }
  } catch { /* fall through to built-in prompts */ }

  // Search knowledge base — vector-first (graceful fallback)
  let kbChunks: any[] = [];
  try {
    const searchResult = await smartSearch(
      `${reqData.title} ${reqData.description || ""}`,
      store,
      embedQueryText,
      { topK: rag.topK }
    );
    kbChunks = searchResult.chunks || [];
  } catch (err) {
    console.warn(`[analyzeRequirement] KB search failed: ${(err as Error).message}`);
  }

  // Find similar requirements (graceful fallback)
  let similarReqs: any[] = [];
  try {
    const existingReqs = await store.getAllRequirementEmbeddings();
    similarReqs = await findSimilarRequirements(getEmbedder(), reqData, existingReqs, 10);
  } catch (err) {
    console.warn(`[analyzeRequirement] Similar req search failed: ${(err as Error).message}`);
  }
  const duplicates = detectDuplicates(similarReqs);

  // Feasibility
  let feasibility: FeasibilityAssessment | null = null;
  try {
    feasibility = await assessFeasibility(llm, reqData, kbChunks, promptOverrides);
  } catch { /* skip if LLM fails */ }

  // Solution
  let solution = null;
  const highSimilarity = similarReqs.filter(r => r.similarity > 0.7).slice(0, 3);
  try {
    solution = await generateSolution(llm, reqData, kbChunks, highSimilarity, promptOverrides);
  } catch { /* skip */ }

  // Store insights (skip for draft mode: reqId === 0)
  if (reqId > 0) {
    try {
      await store.saveInsight(reqId, "auto_analysis", {
        similarRequirements: similarReqs,
        potentialDuplicates: duplicates,
        feasibility,
        solution,
      }, llm ? "claude-sonnet-4-20250514" : "unknown");
    } catch (err) {
      console.warn(`[analyzeRequirement] Save insight failed: ${(err as Error).message}`);
    }
  }

  // Save requirement embedding for future similarity search (skip for draft mode)
  if (reqId > 0) {
    try {
      const queryText = `${reqData.title}\n${reqData.description || ""}`;
      const vec = await embedQueryText(queryText);
      if (vec?.length) {
        await store.saveRequirementEmbedding(reqId, vec);
      }
    } catch { /* non-critical */ }
  }

  return {
    similarRequirements: similarReqs.map(r => ({
      reqId: r.reqId,
      reqNo: r.reqNo,
      title: r.title,
      priority: r.priority,
      similarity: r.similarity,
      status: r.status,
    })),
    potentialDuplicates: duplicates,
    feasibility,
    solution,
  };
}

// ==================== Planning ====================

export async function estimateReleaseEffort(
  releaseId: number,
  store: AgentDataStore
) {
  const llm = getLLM();
  const cfg = readConfig();
  const promptOverrides = getConfigSystemPromptOverrides(cfg) || {};
  const reqs = await store.getReleaseRequirements(releaseId);
  const release = await store.getReleaseInfo(releaseId);

  // Resolve Skill for release effort estimation
  try {
    const skill = await resolveSkillPrompt("estimateReleaseEffort", {
      title: release.releaseName,
      description: release.description || "",
      module: reqs.map(r => r.module).filter(Boolean).join(", "),
    });
    if (skill) {
      promptOverrides.releasePlanning = skill.systemPrompt;
      console.log(`[estimateReleaseEffort] Using skill: ${skill.name}`);
    }
  } catch { /* fall through to built-in prompts */ }

  return estimateEffort(llm, {
    title: release.releaseName,
    description: release.description,
    priority: "P1",
    module: reqs.map(r => r.module).filter(Boolean).join(", "),
    requirementCount: reqs.length,
  }, undefined, promptOverrides);
}

export async function suggestReleaseSchedule(releaseId: number, store: AgentDataStore) {
  const llm = getLLM();
  const cfg = readConfig();
  const promptOverrides = getConfigSystemPromptOverrides(cfg) || {};
  const reqs = await store.getReleaseRequirements(releaseId);
  const release = await store.getReleaseInfo(releaseId);

  // Resolve Skill for release scheduling
  try {
    const skill = await resolveSkillPrompt("suggestReleaseSchedule", {
      title: release.releaseName,
      description: release.description || "",
    });
    if (skill) {
      // Only override if not already overridden by estimateReleaseEffort
      if (!promptOverrides.releasePlanning) {
        promptOverrides.releasePlanning = skill.systemPrompt;
      }
      console.log(`[suggestReleaseSchedule] Using skill: ${skill.name}`);
    }
  } catch { /* fall through to built-in prompts */ }

  return suggestSchedule(
    llm,
    {
      releaseName: release.releaseName,
      requirements: reqs,
      targetDate: release.plannedDate,
    },
    promptOverrides
  );
}

export async function analyzeReqDependencies(reqIds: number[], store: AgentDataStore) {
  const llm = getLLM();
  const cfg = readConfig();
  const promptOverrides = getConfigSystemPromptOverrides(cfg);
  const reqs = await store.getRequirementsByIds(reqIds);
  return analyzeDependencies(llm, reqs, promptOverrides);
}

// ==================== Context-aware Q&A ====================

export async function askAboutRequirement(
  reqId: number,
  question: string,
  store: AgentDataStore
): Promise<string> {
  const llm = getLLM();
  const cfg = readConfig();
  const req = await store.getRequirementDetail(reqId);

  const reqContext = `
当前需求信息：
- 编号：${req.reqNo}
- 标题：${req.title}
- 类型：${req.reqType}
- 优先级：${req.priority}
- 模块：${req.module || "未指定"}
- 状态：${req.status}
- 描述：${req.description || "无"}
- 涉及表：${req.relatedTables || "未指定"}
- GSP影响：${req.gspImpact || "待评估"}`;

  const { chunks: kbChunks, routing } = await smartSearch(
    `${req.title} ${question}`,
    store,
    embedQueryText,
    { topK: cfg.rag.topK }
  );
  const groundedTables = extractGroundedTableNames(kbChunks);
  let kbContext = buildKnowledgeContext(kbChunks, cfg.rag.contextMaxTokens);
  if (routing && kbContext) {
    kbContext =
      `【检索范围】${routing.labels.join("、")}（${routing.reason}）\n\n` + kbContext;
  }
  const tableBlock = buildTableGroundingBlock(groundedTables);
  const systemPrompt = resolveSystemPrompt(
    "requirementAssistant",
    `${reqContext}\n\n${tableBlock}\n\n${kbContext}`,
    cfg
  );

  const result = await llm.chat({
    systemPrompt,
    messages: [{ role: "user", content: question }],
    temperature: 0.5,
  });

  return result.content;
}

// ==================== Knowledge Base management ====================

/** HyDE：生成简短假设性文档片段用于辅助检索 */
async function buildHydeQueries(question: string): Promise<string[]> {
  const base = expandSearchQueries(question, 2);
  try {
    const llm = getLLM();
    const result = await llm.chat({
      systemPrompt:
        "你是 WMOS 仓储系统文档助手。根据用户问题，写一段可能出现在内部设计文档中的简短说明（200字内），不要加标题。",
      messages: [{ role: "user", content: question }],
      temperature: 0.3,
      maxTokens: 300,
    });
    const hypo = result.content.trim().slice(0, 500);
    if (hypo) return [...new Set([...base, hypo])];
  } catch {
    // ignore
  }
  return base;
}

export type SyncProgressCallback = (p: {
  done: number;
  total: number;
  file?: string;
}) => void;

export type KbSyncMeta = {
  basePath: string;
  docType?: string | null;
};

/** 按知识库类型分发同步：REQUIREMENT_LIST 走 DB 重建，其余走目录扫描。 */
export async function dispatchKbSync(
  kbId: number,
  kb: KbSyncMeta,
  store: AgentDataStore,
  onProgress?: SyncProgressCallback
): Promise<{ documents: number; chunks: number; mode: "directory" | "requirement_rebuild" }> {
  const { KB_DOC_TYPES } = await import("./knowledge-base-types");

  if (kb.docType === KB_DOC_TYPES.REQUIREMENT_LIST) {
    onProgress?.({ done: 0, total: 1, file: "需求与发版数据" });
    const { rebuildRequirementKb } = await import("./requirement-indexer.service");
    const result = await rebuildRequirementKb();
    onProgress?.({ done: 1, total: 1 });
    return {
      documents: result.indexed,
      chunks: result.indexed,
      mode: "requirement_rebuild",
    };
  }

  const result = await syncKnowledgeBase(kbId, kb.basePath, store, onProgress);
  return { ...result, mode: "directory" };
}

export async function syncKnowledgeBase(
  kbId: number,
  basePath: string,
  store: AgentDataStore,
  onProgress?: SyncProgressCallback
): Promise<{ documents: number; chunks: number }> {
  const { scanDirectory, computeDelta } = await import("agent");
  const { chunkDocument } = await import("agent");
  const llm = getLLM();
  const rag = readConfig().rag;

  // Ensure upload directory exists
  const fs = await import("fs");
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true });
  }

  // Scan
  const files = scanDirectory(basePath);

  // Get existing document hashes
  const existing = await store.getKnowledgeDocumentHashes(kbId);
  const delta = computeDelta(files, existing);

  const toProcess = delta.filter((f) => f.status !== "unchanged" && f.status !== "deleted");
  const total = toProcess.length;
  let done = 0;
  let totalDocs = 0;
  let totalChunks = 0;

  for (const file of delta) {
    if (file.status === "unchanged") continue;
    if (file.status === "deleted") {
      await store.deleteKnowledgeDocument(kbId, file.relativePath);
      continue;
    }

    const content = await readDocumentText(file.filePath, file.fileName);
    if (!content.trim()) {
      done++;
      onProgress?.({ done, total, file: file.relativePath });
      continue;
    }
    const chunks = chunkDocument(
      file.fileName,
      content,
      rag.chunkMaxCharsMd,
      rag.chunkOverlapMd ?? 200
    );

    // Embed — per-batch independent try/catch (fix BUG-004)
    // Old behavior: single embedTexts call failed → all chunks NULL (silent fallback)
    // New behavior: each batch is independent; failed batch logs error but doesn't kill the rest
    const BATCH_SIZE = 10;
    const texts = chunks.map(c => c.content);
    const embeddings: (number[] | null)[] = new Array(chunks.length).fill(null);
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      try {
        const batchResult = await getEmbedder().embedTexts(batchTexts);
        for (let j = 0; j < batchResult.length; j++) {
          embeddings[i + j] = batchResult[j];
        }
        console.log(`[syncKnowledgeBase] batch ${i}-${i + batchTexts.length}/${chunks.length} ok (file=${file.relativePath})`);
      } catch (embedErr) {
        console.error(
          `[syncKnowledgeBase] batch ${i}-${i + batchTexts.length}/${chunks.length} FAILED for ${file.relativePath}: ${(embedErr as Error).message}. Storing NULL for this batch.`
        );
        // 该批保持 null，其他批不受影响
      }
    }

    // Store
    const docId = await store.upsertKnowledgeDocument(kbId, {
      fileName: file.fileName,
      filePath: file.filePath,
      relativePath: file.relativePath,
      fileSize: file.fileSize,
      fileHash: file.fileHash,
      mimeType: file.mimeType,
      docType: file.docType,
      chunkCount: chunks.length,
    });

    await store.upsertKnowledgeChunks(docId, chunks.map((c, i) => ({
      chunkIndex: i,
      content: c.content,
      contentTokens: Math.ceil(c.content.length / 3), // rough estimate
      embedding: embeddings[i] ?? null,
      metadata: c.metadata,
    })));

    totalDocs++;
    totalChunks += chunks.length;
    done++;
    onProgress?.({ done, total, file: file.relativePath });
  }

  // Update last synced time
  await store.updateKnowledgeBaseSyncTime(kbId);

  return { documents: totalDocs, chunks: totalChunks };
}

// ==================== Test Case Generation ====================

export interface TestCaseStep {
  step: number;
  action: string;
  expected: string;
}

export interface GeneratedTestCase {
  caseNo: string;
  title: string;
  precondition?: string;
  steps: TestCaseStep[];
  priority: string;
}

export async function generateTestCases(
  reqId: number,
  store: AgentDataStore
): Promise<GeneratedTestCase[]> {
  const llm = getLLM();
  const cfg = readConfig();
  const req = await store.getRequirementDetail(reqId);

  // Check existing test cases for this requirement
  const { PrismaClient: PrismaClientLocal } = await import("@prisma/client");
  const checkDb = new PrismaClientLocal();
  const existingCases = await checkDb.testCase.findMany({
    where: { reqId },
    select: { title: true, caseNo: true, priority: true },
    orderBy: { caseNo: "asc" },
  });
  const isSupplement = existingCases.length > 0;
  await checkDb.$disconnect();

  // Resolve Skill for test case generation
  let skillPrompt = "";
  try {
    const skill = await resolveSkillPrompt("generateTestCases", {
      title: req.title,
      description: req.description || "",
      background: req.module ? `- 模块：${req.module}` : "",
      module: req.module || "未指定",
      tables: req.relatedTables || "未指定",
    });
    if (skill) {
      skillPrompt = skill.systemPrompt;
      console.log(`[generateTestCases] Using skill: ${skill.name}`);
    }
  } catch { /* fall through to built-in prompt */ }

  // RAG search for relevant knowledge
  let kbContext = "";
  try {
    const { chunks: kbChunks } = await smartSearch(
      `${req.title} 测试用例`,
      store, embedQueryText,
      { topK: cfg.rag.topK }
    );
    if (kbChunks.length > 0) {
      kbContext = buildKnowledgeContext(kbChunks, cfg.rag.contextMaxTokens);
    }
  } catch (err) {
    console.warn(`[generateTestCases] KB search failed: ${(err as Error).message}`);
  }

  // Build existing cases context for supplement mode
  let existingContext = "";
  if (isSupplement) {
    existingContext = `\n## 已有测试用例（请补充未被覆盖的场景）\n${
      existingCases.map(c => `- ${c.caseNo}: ${c.title} [${c.priority}]`).join("\n")
    }\n\n请生成 **已有用例未覆盖** 的测试场景：异常流程、边界条件、权限校验、并发、性能等。不要生成与已有用例标题相似的用例。`;
  }

  // Fallback prompt if no skill assigned
  if (!skillPrompt.trim()) {
    skillPrompt = `你是 WMOS 仓储管理系统的测试工程师。根据需求描述生成结构化测试用例。

需求标题：${req.title}
需求描述：${req.description || "无"}
所属模块：${req.module || "未指定"}
涉及表：${req.relatedTables || "未指定"}
${kbContext ? `\n相关知识库内容：\n${kbContext}` : ""}
${existingContext}

要求：${isSupplement ? "重点补充异常流程、边界条件、权限校验、并发场景" : "覆盖正常流程、边界条件、异常情况、权限校验"}。每条用例含 caseNo、title、precondition、steps[{step, action, expected}]、priority。
返回 JSON 数组，不要其他文字。`;
  } else {
    skillPrompt = skillPrompt
      .replace("{{context}}", `${kbContext ? `\n相关知识库内容：\n${kbContext}` : ""}${existingContext}`);
  }

  // Call LLM
  const userMsg = isSupplement
    ? `请为需求"${req.title}"补充已有 ${existingCases.length} 条用例未覆盖的测试场景`
    : `请为需求"${req.title}"生成测试用例`;
  const result = await llm.chat({
    systemPrompt: skillPrompt,
    messages: [{ role: "user", content: userMsg }],
    temperature: 0.3,
    maxTokens: 4096,
  });

  // Parse JSON from response (robust: fix common LLM JSON errors)
  let testCases: GeneratedTestCase[] = [];
  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("未找到 JSON 数组");
    let jsonStr = jsonMatch[0];
    // Fix common LLM JSON issues: trailing comma before ] or }, unescaped control chars in strings
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1"); // trailing commas
    jsonStr = jsonStr.replace(/(\{|\,)\s*(\w+)\s*:/g, '$1"$2":'); // unquoted keys
    // Fix unescaped double quotes inside string values (aggressive: assume valid outer quotes)
    try {
      testCases = JSON.parse(jsonStr) as GeneratedTestCase[];
    } catch (_) {
      // Last resort: try line-by-line extraction
      console.warn("[generateTestCases] Primary parse failed, trying fallback extraction");
      const titles = [...jsonStr.matchAll(/"title"\s*:\s*"([^"]+)"/g)];
      const preconds = [...jsonStr.matchAll(/"precondition"\s*:\s*"([^"]*)"/g)];
      const priorities = [...jsonStr.matchAll(/"priority"\s*:\s*"([^"]+)"/g)];
      testCases = titles.map((_, i) => ({
        caseNo: "",
        title: titles[i]?.[1] || `Test ${i + 1}`,
        precondition: preconds[i]?.[1] || undefined,
        steps: [{ step: 1, action: "待补充", expected: "待补充" }],
        priority: priorities[i]?.[1] || "P2",
      }));
    }
  } catch (err) {
    console.error(`[generateTestCases] JSON parse failed: ${(err as Error).message}`);
    throw new Error("AI 生成的测试用例格式异常，请重试");
  }

  if (!testCases.length) {
    throw new Error(isSupplement ? "AI 未能生成新的补充用例，当前用例已较完整" : "AI 未能生成测试用例，请调整需求描述后重试");
  }

  // Save to database via Prisma
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const actor = "AI";

  // Deduplicate by title
  const allExisting = await db.testCase.findMany({ where: { reqId }, select: { title: true } });
  const titleSet = new Set(allExisting.map(t => t.title.toLowerCase()));
  const uniqueCases = testCases.filter(tc => !titleSet.has(tc.title.toLowerCase()));

  if (uniqueCases.length === 0) {
    await db.$disconnect();
    throw new Error("AI 生成的用例均已存在，当前用例已较完整");
  }

  const existingCount = allExisting.length;
  const saved = [];
  for (let i = 0; i < uniqueCases.length; i++) {
    const tc = uniqueCases[i];
    const seqNum = existingCount + i + 1;
    const caseNo = `TC-${String(seqNum).padStart(3, "0")}`;
    const created = await db.testCase.create({
      data: {
        reqId,
        caseNo,
        title: tc.title,
        precondition: tc.precondition || null,
        steps: tc.steps as any,
        priority: tc.priority || "P2",
        source: "AI",
        createdBy: actor,
      },
    });
    saved.push(created);
  }

  await db.$disconnect();

  return saved.map((tc) => ({
    caseNo: tc.caseNo,
    title: tc.title,
    precondition: tc.precondition || undefined,
    steps: tc.steps as unknown as TestCaseStep[],
    priority: tc.priority,
  }));
}

// ==================== Data Store Interface ====================

/**
 * Interface for the server-side data store.
 * The actual implementation uses Prisma to interact with PostgreSQL.
 */
export interface AgentDataStore {
  // Conversations
  createConversation(data: { userId: number; title?: string; contextType: string; contextId?: number }): Promise<{ id: number }>;
  getConversationMessages(conversationId: number): Promise<ChatMessage[]>;
  addMessage(
    conversationId: number,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<{ id: number }>;

  // Knowledge Base
  listKnowledgeBasesForRouting(): Promise<import("./kb-router.service").KbRoutingCandidate[]>;
  getDefaultKnowledgeBaseId(): Promise<number>;
  searchKnowledgeBase(
    query: string,
    topK: number,
    kbId: number,
    filter?: import("./rag-search.service").RagDocumentFilter
  ): Promise<{ content: string; fileName: string; section?: string; similarity: number; relativePath?: string; docType?: string }[]>;
  searchByVector(
    embedding: number[],
    topK: number,
    kbId: number,
    filter?: import("./rag-search.service").RagDocumentFilter
  ): Promise<{ content: string; fileName: string; section?: string; similarity: number; chunkId: number; documentId: number; relativePath?: string; docType?: string }[]>;
  getKnowledgeDocumentByPath(relativePath: string): Promise<{ filePath: string; fileName: string; relativePath: string } | null>;
  getKnowledgeDocumentHashes(kbId: number): Promise<Map<string, string>>;
  deleteKnowledgeDocument(kbId: number, relativePath: string): Promise<void>;
  upsertKnowledgeDocument(kbId: number, data: { fileName: string; filePath: string; relativePath: string; fileSize: number; fileHash: string; mimeType: string; docType: string; chunkCount: number }): Promise<number>;
  upsertKnowledgeChunks(docId: number, chunks: { chunkIndex: number; content: string; contentTokens: number; embedding: number[] | null; metadata: Record<string, unknown> }[]): Promise<void>;
  updateKnowledgeBaseSyncTime(kbId: number): Promise<void>;

  // Requirements
  getRequirementDetail(reqId: number): Promise<{ reqNo: string; title: string; reqType: string; priority: string; module?: string; status: string; description?: string; relatedTables?: string; gspImpact?: string }>;
  getAllRequirementEmbeddings(): Promise<{ id: number; reqNo: string; title: string; priority: string; status: string; embedding: number[] | null }[]>;

  // Releases
  getReleaseInfo(releaseId: number): Promise<{ releaseName: string; description?: string; plannedDate?: string }>;
  getReleaseRequirements(releaseId: number): Promise<{ id: number; reqNo: string; title: string; priority: string; status: string; module?: string }[]>;
  getRequirementsByIds(ids: number[]): Promise<{ reqNo: string; title: string; description?: string }[]>;

  // Insights
  saveInsight(reqId: number, type: string, data: unknown, model: string): Promise<void>;
  getInsights(reqId: number): Promise<{ id: number; insightType: string; structuredData: unknown; content: string | null; model: string; createdAt: Date }[]>;
  saveRequirementEmbedding(reqId: number, embedding: number[]): Promise<void>;

  // Conversation management
  getConversations(userId: number): Promise<{ id: number; title: string | null; contextType: string; contextId: number | null; messageCount: number; updatedAt: string }[]>;
  updateConversation(id: number, data: { title?: string; isArchived?: boolean }): Promise<void>;
  deleteConversation(id: number): Promise<void>;

  // Knowledge Base CRUD (used by knowledge.routes)
  listKnowledgeBases(): Promise<{ id: number; name: string; displayName: string; description: string | null; routingExamples: unknown; sourceType: string; documentCount: number; chunkCount: number; lastSyncedAt: string | null; enabled: boolean }[]>;
  createKnowledgeBase(data: { name: string; displayName: string; description?: string; basePath: string; sourceType?: string; docType?: string; routingExamples?: unknown; enabled?: boolean }): Promise<{ id: number; name: string; displayName: string }>;
  updateKnowledgeBase(id: number, data: { displayName?: string; description?: string; basePath?: string; sourceType?: string; docType?: string; enabled?: boolean; routingExamples?: unknown | null }): Promise<void>;
  deleteKnowledgeBase(id: number): Promise<void>;
  getKnowledgeBase(id: number): Promise<{ id: number; name: string; displayName: string; basePath: string; sourceType: string; docType: string | null; enabled: boolean; lastSyncedAt: Date | null; [key: string]: unknown } | null>;
  getKnowledgeBaseStatus(id: number): Promise<{ id: number; name: string; sourceType: string; documentCount: number; chunkCount: number; lastSyncedAt: string | null; enabled: boolean }>;
}
