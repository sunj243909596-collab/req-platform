import { prisma } from "../lib/prisma";


// ===================== Types =====================

export interface SkillInput {
  name: string;
  displayName: string;
  description?: string;
  systemPrompt: string;
  category?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface SkillAssignmentInput {
  taskKey: string;
  skillId: number;
  enabled?: boolean;
}

// ===================== AiSkill CRUD =====================

export async function listSkills() {
  return prisma.aiSkill.findMany({
    orderBy: { sortOrder: "asc" },
    include: { assignments: { select: { taskKey: true } } },
  });
}

export async function getSkill(id: number) {
  return prisma.aiSkill.findUnique({
    where: { id },
    include: { assignments: true },
  });
}

export async function createSkill(input: SkillInput) {
  if (!input.name?.trim()) throw new Error("技能名称不能为空");
  if (!input.displayName?.trim()) throw new Error("显示名称不能为空");
  if (!input.systemPrompt?.trim()) throw new Error("系统提示词不能为空");

  const existing = await prisma.aiSkill.findUnique({ where: { name: input.name } });
  if (existing) throw new Error(`技能名称 "${input.name}" 已存在`);

  return prisma.aiSkill.create({
    data: {
      name: input.name.trim(),
      displayName: input.displayName.trim(),
      description: input.description || null,
      systemPrompt: input.systemPrompt.trim(),
      category: input.category || "general",
      enabled: input.enabled !== false,
      sortOrder: input.sortOrder || 0,
    },
  });
}

export async function updateSkill(id: number, input: Partial<SkillInput>) {
  const existing = await prisma.aiSkill.findUnique({ where: { id } });
  if (!existing) throw new Error("技能不存在");

  if (input.name && input.name !== existing.name) {
    const dup = await prisma.aiSkill.findUnique({ where: { name: input.name } });
    if (dup) throw new Error(`技能名称 "${input.name}" 已存在`);
  }

  return prisma.aiSkill.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.systemPrompt ? { systemPrompt: input.systemPrompt.trim() } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteSkill(id: number) {
  const existing = await prisma.aiSkill.findUnique({ where: { id } });
  if (!existing) throw new Error("技能不存在");

  // Remove assignments first
  await prisma.skillAssignment.deleteMany({ where: { skillId: id } });
  await prisma.aiSkill.delete({ where: { id } });
}

export async function toggleSkill(id: number) {
  const existing = await prisma.aiSkill.findUnique({ where: { id } });
  if (!existing) throw new Error("技能不存在");
  return prisma.aiSkill.update({
    where: { id },
    data: { enabled: !existing.enabled },
  });
}

// ===================== SkillAssignment CRUD =====================

export async function listAssignments() {
  return prisma.skillAssignment.findMany({
    include: { skill: { select: { id: true, name: true, displayName: true } } },
    orderBy: { taskKey: "asc" },
  });
}

export async function upsertAssignment(input: SkillAssignmentInput) {
  return prisma.skillAssignment.upsert({
    where: { taskKey: input.taskKey },
    update: {
      skillId: input.skillId,
      enabled: input.enabled !== false,
    },
    create: {
      taskKey: input.taskKey,
      skillId: input.skillId,
      enabled: input.enabled !== false,
    },
  });
}

export async function deleteAssignment(id: number) {
  await prisma.skillAssignment.delete({ where: { id } });
}

// ===================== Skill Resolution =====================

export interface ResolvedSkill {
  skillId: number;
  name: string;
  displayName: string;
  systemPrompt: string;
  category: string;
}

/**
 * Resolve which skill to use for a given taskKey.
 * Returns the resolved skill or null if no assignment exists.
 */
export async function resolveSkill(taskKey: string): Promise<ResolvedSkill | null> {
  const assignment = await prisma.skillAssignment.findUnique({
    where: { taskKey },
    include: { skill: true },
  });

  if (!assignment?.enabled || !assignment.skill?.enabled) return null;

  const s = assignment.skill;
  return {
    skillId: s.id,
    name: s.name,
    displayName: s.displayName,
    systemPrompt: s.systemPrompt,
    category: s.category,
  };
}

/**
 * Process a system prompt template by replacing variables.
 * Supported placeholders:
 *   {{context}} - the full user context / question
 *   {{title}} - requirement title
 *   {{description}} - requirement description
 *   {{background}} - requirement background
 *   {{module}} - requirement module
 *   {{tables}} - related tables
 *   {{kbContext}} - RAG knowledge base context (injected separately, not replaced here)
 */
export function fillSkillPrompt(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.replaceAll(placeholder, value || "");
  }
  return result;
}

/**
 * Resolve a skill and fill its prompt template with variables.
 * Returns null if no skill is assigned for this taskKey.
 */
export async function resolveSkillPrompt(
  taskKey: string,
  variables: Record<string, string | undefined>
): Promise<ResolvedSkill | null> {
  const skill = await resolveSkill(taskKey);
  if (!skill) return null;
  skill.systemPrompt = fillSkillPrompt(skill.systemPrompt, variables);
  return skill;
}

// ===================== Seed Defaults =====================

const DEFAULT_SKILLS: SkillInput[] = [
  {
    name: "wm-architect",
    displayName: "WMOS 架构师",
    description: "根据需求描述生成结构化的技术设计方案",
    systemPrompt: `你是 WMOS 仓储管理系统的架构师。根据用户提供的需求描述，生成一份结构化的技术设计方案。

## 当前需求
- 标题：{{title}}
- 描述：{{description}}
{{background}}

要求：
1. 使用中文
2. 方案要具体、可操作
3. 如果涉及数据库表设计，要指出可能涉及的表
4. 如果涉及接口设计，要说明需要新增或修改的接口
5. 如果涉及业务流程，要说明关键的流程步骤
6. 方案应包含：概述、架构设计、数据模型变更、接口设计、业务流程、风险点`,
    category: "design",
    sortOrder: 1,
  },
  {
    name: "wm-analyst",
    displayName: "需求分析师",
    description: "分析需求的可行性、查找相似需求和重复项",
    systemPrompt: `你是 WMOS 仓储管理系统的需求分析师。请对当前需求进行全面分析。

## 当前需求
- 标题：{{title}}
- 描述：{{description}}
{{background}}
- 模块：{{module}}

请分析：
1. 可行性评估（含风险点和预估工时）
2. 需要的数据库表变更
3. 需要的接口变更
4. 需要注意的GSP合规要点
5. 建议的实现方案

输出使用中文，方案具体可操作。`,
    category: "analysis",
    sortOrder: 2,
  },
  {
    name: "wm-assistant",
    displayName: "WMOS 智能助手",
    description: "通用 WMOS 对话问答助手",
    systemPrompt: `你是 WMOS 仓储管理系统的智能助手，帮助用户解答关于仓储系统、业务流程、技术方案的问题。

你可以参考知识库中的产品文档（PRD/BRD/FSD/数据模型设计）和系统文档。
引用知识库内容时使用统一的来源标注格式。

{{context}}`,
    category: "chat",
    sortOrder: 3,
  },
  {
    name: "wm-rag",
    displayName: "RAG 检索增强",
    description: "知识库检索增强回答",
    systemPrompt: `你是 WMOS 仓储管理系统的知识库助手。根据检索到的知识库内容，回答用户的问题。

{{context}}

要求：
1. 严格基于知识库提供的内容作答
2. 如果知识库中没有相关信息，请明确说明
3. 引用具体文档和段落
4. 使用中文`,
    category: "rag",
    sortOrder: 4,
  },
  {
    name: "wm-planner",
    displayName: "发版规划师",
    description: "发版工时预估和排期建议",
    systemPrompt: `你是 WMOS 仓储管理系统的发版规划助手。帮助分析需求列表，提供工时预估和排期建议。

## 当前发版
- 名称：{{title}}
- 描述：{{description}}
{{module}}

分析维度：
1. **工作量预估** — 基于需求复杂度和历史数据
2. **依赖分析** — 需求之间的依赖关系和执行顺序
3. **风险识别** — GSP合规风险、技术难点、资源冲突
4. **排期优化** — 建议最优的执行顺序和时间安排

使用中文，输出具体可操作的建议。`,
    category: "planning",
    sortOrder: 5,
  },
  {
    name: "wm-tester",
    displayName: "测试工程师",
    description: "根据需求描述和知识库生成结构化测试用例",
    systemPrompt: `你是 WMOS 仓储管理系统的测试工程师。根据需求描述、知识库中的设计文档和相似需求的测试用例，生成结构化测试用例。

## 当前需求
- 标题：{{title}}
- 描述：{{description}}
{{background}}
- 模块：{{module}}
- 涉及表：{{tables}}

{{context}}

## 要求
1. 严格基于需求描述和知识库内容生成测试用例，禁止编造不存在功能
2. 覆盖正常流程、边界条件、异常情况、权限校验
3. 每条测试用例包含：用例编号(TC-XXX)、标题、前置条件、测试步骤(含预期结果)、优先级(P0/P1/P2/P3)
4. 使用中文
5. 返回 JSON 数组格式：

\`\`\`json
[
  {
    "caseNo": "TC-001",
    "title": "验证入库单创建功能",
    "precondition": "用户已登录，具有入库权限",
    "steps": [
      {"step": 1, "action": "点击新建入库单按钮", "expected": "弹出入库单创建页面"},
      {"step": 2, "action": "填写必填项：供应商、仓库、SKU、数量", "expected": "表单校验通过"}
    ],
    "priority": "P1"
  }
]
\`\`\`

只输出 JSON 数组，不要包含其他文字说明。`,
    category: "testing",
    sortOrder: 6,
  },
];

const DEFAULT_ASSIGNMENTS: { taskKey: string; skillName: string }[] = [
  { taskKey: "generateDesign", skillName: "wm-architect" },
  { taskKey: "analyzeRequirement", skillName: "wm-analyst" },
  { taskKey: "chat", skillName: "wm-assistant" },
  { taskKey: "ragSearch", skillName: "wm-rag" },
  { taskKey: "estimateReleaseEffort", skillName: "wm-planner" },
  { taskKey: "suggestReleaseSchedule", skillName: "wm-planner" },
  { taskKey: "generateTestCases", skillName: "wm-tester" },
];

/**
 * Seed default skills and assignments if they don't exist.
 * Safe to call multiple times — skips if already seeded.
 */
export async function seedDefaultSkills() {
  for (const input of DEFAULT_SKILLS) {
    const existing = await prisma.aiSkill.findUnique({ where: { name: input.name } });
    if (!existing) {
      console.log(`[seed] Creating skill: ${input.name}`);
      await prisma.aiSkill.create({
        data: {
          name: input.name,
          displayName: input.displayName,
          description: input.description,
          systemPrompt: input.systemPrompt,
          category: input.category,
          sortOrder: input.sortOrder,
        },
      });
    }
  }

  for (const assignment of DEFAULT_ASSIGNMENTS) {
    const existing = await prisma.skillAssignment.findUnique({
      where: { taskKey: assignment.taskKey },
    });
    if (!existing) {
      const skill = await prisma.aiSkill.findUnique({ where: { name: assignment.skillName } });
      if (skill) {
        console.log(`[seed] Creating assignment: ${assignment.taskKey} → ${assignment.skillName}`);
        await prisma.skillAssignment.create({
          data: { taskKey: assignment.taskKey, skillId: skill.id },
        });
      }
    }
  }
}
