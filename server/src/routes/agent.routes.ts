// Agent API routes — chat, analysis, planning
import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import type { AgentDataStore } from "../services/agent.service";
import { DEFAULT_KB_ROUTING_SYSTEM_PROMPT } from "../services/kb-routing-prompt";
import { chat, chatStream, analyzeRequirement, askAboutRequirement, estimateReleaseEffort, suggestReleaseSchedule, analyzeReqDependencies, generateTestCases } from "../services/agent.service";

export function createAgentRoutes(store: AgentDataStore) {
  const app = new Hono();

  // Chat
  app.post("/chat", async (c) => {
    const body = await c.req.json();
    const userId = c.get("userId") as number;
    const result = await chat(userId, body, store);
    return c.json(result);
  });

  // Chat SSE stream
  app.post("/chat/stream", async (c) => {
    const body = await c.req.json();
    const userId = c.get("userId") as number;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chatStream(userId, body, store)) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }
        } catch (err) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", content: (err as Error).message })}\n\n`)
          );
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  // Conversations
  app.get("/conversations", async (c) => {
    const userId = c.get("userId") as number;
    const conversations = await store.getConversations(userId);
    return c.json(conversations);
  });

  app.get("/conversations/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const userId = c.get("userId") as number;
    const convs = await store.getConversations(userId);
    if (!convs.some((cv: { id: number }) => cv.id === id)) {
      return c.json({ error: "无权访问该会话" }, 403);
    }
    const messages = await store.getConversationMessages(id);
    return c.json(messages);
  });

  app.put("/conversations/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const userId = c.get("userId") as number;
    const convs = await store.getConversations(userId);
    if (!convs.some((cv: { id: number }) => cv.id === id)) {
      return c.json({ error: "无权修改该会话" }, 403);
    }
    const body = await c.req.json();
    await store.updateConversation(id, body);
    return c.json({ ok: true });
  });

  app.delete("/conversations/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const userId = c.get("userId") as number;
    const convs = await store.getConversations(userId);
    if (!convs.some((cv: { id: number }) => cv.id === id)) {
      return c.json({ error: "无权删除该会话" }, 403);
    }
    await store.deleteConversation(id);
    return c.json({ ok: true });
  });

  // Requirement analysis
  app.post("/req/:reqId/analyze", async (c) => {
    try {
      const reqId = parseInt(c.req.param("reqId"));
      const reqData = await store.getRequirementDetail(reqId);
      const result = await analyzeRequirement(reqId, reqData, store);
      return c.json(result);
    } catch (err) {
      console.error(`[agent/analyze] reqId=${c.req.param("reqId")} failed:`, (err as Error).message);
      return c.json({ error: (err as Error).message || 'AI 分析失败' }, 500);
    }
  });

  // Generate test cases for a requirement
  app.post("/req/:reqId/generate-test-cases", async (c) => {
    try {
      const reqId = parseInt(c.req.param("reqId"));
      const result = await generateTestCases(reqId, store);
      return c.json({ testCases: result });
    } catch (err) {
      console.error(`[agent/generate-test-cases] reqId=${c.req.param("reqId")} failed:`, (err as Error).message);
      return c.json({ error: (err as Error).message || 'AI 生成测试用例失败' }, 500);
    }
  });

  // Draft requirement analysis (analyze before creating — no reqId needed)
  app.post("/analyze-draft", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.title?.trim()) return c.json({ error: "标题不能为空" }, 400);
      const reqData = {
        title: body.title.trim(),
        description: body.description || '',
        module: body.module || undefined,
        terminals: body.terminals || undefined,
        relatedTables: body.relatedTables || undefined,
      };
      const result = await analyzeRequirement(0, reqData, store);
      return c.json(result);
    } catch (err) {
      console.error(`[agent/analyze-draft] failed:`, (err as Error).message);
      return c.json({ error: (err as Error).message || 'AI 分析失败' }, 500);
    }
  });

  // Generate design solution from requirement description
  app.post("/generate-design", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.title?.trim()) return c.json({ error: "标题不能为空" }, 400);
      if (!body.description?.trim()) return c.json({ error: "需求描述不能为空" }, 400);

      const { getLLM } = await import("../services/llm.service");
      const { resolveSkillPrompt } = await import("../services/skill.service");
      const llm = getLLM();

      // Resolve skill for this task
      let systemPrompt: string;
      const skill = await resolveSkillPrompt("generateDesign", {
        title: body.title.trim(),
        description: body.description.trim(),
        background: body.background ? `- 背景：${body.background.trim()}` : "",
        module: body.module || "未指定",
      });

      if (skill) {
        systemPrompt = skill.systemPrompt;
        console.log(`[generate-design] Using skill: ${skill.name}`);
      } else {
        // Fallback
        systemPrompt = `你是 WMOS 仓储管理系统的架构师。根据用户提供的需求描述，生成一份结构化的技术设计方案。
要求：
1. 使用中文
2. 方案要具体、可操作
3. 方案应包含：概述、架构设计、数据模型变更、接口设计、业务流程、风险点`;
      }

      // Build context from description
      const context = `${body.background ? `需求背景：${body.background.trim()}\n` : ''}${body.module ? `所属模块：${body.module}\n` : ''}`;
      const userMessage = systemPrompt.includes("{{context}}")
        ? context.trim()
        : `需求标题：${body.title.trim()}\n需求描述：${body.description.trim()}\n${context}\n请根据以上信息，生成一份详细的技术设计方案。`;

      const res = await llm.chat({
        systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        temperature: 0.7,
        maxTokens: 4096,
      });

      return c.json({ designSolution: res.content });
    } catch (err) {
      console.error(`[agent/generate-design] failed:`, (err as Error).message);
      return c.json({ error: (err as Error).message || 'AI 生成失败' }, 500);
    }
  });

  app.post("/req/:reqId/ask", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const { question } = await c.req.json();
    const answer = await askAboutRequirement(reqId, question, store);
    return c.json({ answer });
  });

  app.get("/req/:reqId/insights", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const insights = await store.getInsights(reqId);
    return c.json(insights);
  });

  // Release planning
  app.post("/releases/:id/estimate", async (c) => {
    const releaseId = parseInt(c.req.param("id"));
    const estimate = await estimateReleaseEffort(releaseId, store);
    return c.json(estimate);
  });

  app.post("/releases/:id/suggest", async (c) => {
    const releaseId = parseInt(c.req.param("id"));
    const suggestions = await suggestReleaseSchedule(releaseId, store);
    return c.json(suggestions);
  });

  app.post("/planning/dependencies", async (c) => {
    const { reqIds } = await c.req.json();
    const deps = await analyzeReqDependencies(reqIds, store);
    return c.json(deps);
  });

  // Agent config
  app.get("/config", async (c) => {
    const { getPublicConfig } = await import("../services/agent-config.service");
    return c.json(getPublicConfig());
  });

  app.get("/config/kb-routing-prompt-default", async (c) => {
    return c.json({ default: DEFAULT_KB_ROUTING_SYSTEM_PROMPT });
  });

  app.post("/config/optimize-kb-routing-prompt", requireRole("ADMIN"), async (c) => {
    const body = (await c.req.json()) as { currentPrompt?: string | null };
    const { optimizeKbRoutingSystemPrompt } = await import(
      "../services/kb-routing-optimize.service"
    );
    const bases = await store.listKnowledgeBasesForRouting();
    const optimized = await optimizeKbRoutingSystemPrompt(
      body.currentPrompt,
      bases.filter((b) => b.enabled)
    );
    return c.json({ optimized });
  });

  app.get("/config/system-prompt-defaults", async (c) => {
    const { DEFAULT_SYSTEM_PROMPTS } = await import("../services/system-prompt-defaults");
    return c.json({ defaults: DEFAULT_SYSTEM_PROMPTS });
  });

  app.post("/config/optimize-system-prompt", requireRole("ADMIN"), async (c) => {
    const body = (await c.req.json()) as {
      key?: string;
      currentPrompt?: string | null;
    };
    const { optimizeSystemPrompt } = await import("../services/chat-prompt-optimize.service");
    const { DEFAULT_SYSTEM_PROMPTS } = await import("../services/system-prompt-defaults");
    const key = body.key as keyof typeof DEFAULT_SYSTEM_PROMPTS;
    if (!key || !(key in DEFAULT_SYSTEM_PROMPTS)) {
      return c.json({ error: "无效的提示词 key" }, 400);
    }
    const optimized = await optimizeSystemPrompt(key, body.currentPrompt);
    return c.json({ optimized });
  });

  app.put("/config", async (c) => {
    const body = await c.req.json();
    const role = c.get("role");
    if (body.kbRoutingSystemPrompt !== undefined && role !== "ADMIN") {
      return c.json({ error: "仅管理员可修改知识库路由提示词" }, 403);
    }
    if (body.systemPrompts !== undefined && role !== "ADMIN") {
      return c.json({ error: "仅管理员可修改对话系统提示词" }, 403);
    }
    const { updateConfig } = await import("../services/agent-config.service");
    const updated = updateConfig(body);
    return c.json(updated);
  });

  app.post("/config/test-connection", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    const { createLLMProvider } = await import("agent");
    const { resolveBaseUrl } = await import("../services/agent-config.service");

    try {
      // Build LLM config from request body
      const providerType = body.llmProvider === "custom" ? "openai" : (body.llmProvider || "openai");
      const baseUrl = body.llmBaseUrl || resolveBaseUrl({
        llmProvider: body.llmProvider,
        llmBaseUrl: body.llmBaseUrl,
      } as Parameters<typeof resolveBaseUrl>[0]);

      const llm = createLLMProvider({
        provider: providerType,
        model: body.llmModel || "gpt-3.5-turbo",
        apiKey: body.llmApiKey || "",
        baseUrl,
        maxTokens: 20,
        temperature: 0,
      });

      await llm.chat({
        systemPrompt: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Reply with just OK" }],
        maxTokens: 20,
      });
      return c.json({ ok: true, message: "连接成功" });
    } catch (err) {
      // Return 200 so the frontend http interceptor doesn't throw
      return c.json({ ok: false, message: (err as Error).message });
    }
  });

  return app;
}
