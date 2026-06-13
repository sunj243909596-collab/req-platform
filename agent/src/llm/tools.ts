// Function-calling tool definitions for the Agent
// These tools allow the LLM to autonomously query the knowledge base and platform data

import type { ToolDef } from "./client";

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "search_knowledge_base",
    description: "搜索 WMOS 知识库，获取相关文档内容。用于回答技术问题、查找表结构、了解业务流程。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索查询，使用自然语言描述" },
        knowledge_base_ids: {
          type: "array",
          items: { type: "number" },
          description: "可选，限制搜索范围到指定的知识库ID列表",
        },
        top_k: { type: "number", description: "返回结果数，默认5", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "search_similar_requirements",
    description: "在需求管理平台中查找与当前需求相似的历史需求。用于去重、参考已有实现。",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "需求标题" },
        description: { type: "string", description: "需求描述" },
        top_k: { type: "number", description: "返回结果数，默认5", default: 5 },
      },
      required: ["title"],
    },
  },
  {
    name: "lookup_table_structure",
    description: "查询 WMOS 数据库表结构，获取表的字段定义和说明。",
    input_schema: {
      type: "object",
      properties: {
        table_name: { type: "string", description: "Oracle/PG 表名，如 ASN, LPN, ITEM 等" },
      },
      required: ["table_name"],
    },
  },
  {
    name: "search_requirement_comments",
    description: "搜索历史需求的评论和讨论内容，了解某个功能的历史背景和决策过程。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" },
        limit: { type: "number", description: "返回条数限制，默认10", default: 10 },
      },
      required: ["query"],
    },
  },
];

/** Server-side tool executor — called when the LLM triggers a tool call */
export interface ToolExecutor {
  search_knowledge_base: (params: { query: string; knowledge_base_ids?: number[]; top_k?: number }) => Promise<string>;
  search_similar_requirements: (params: { title: string; description?: string; top_k?: number }) => Promise<string>;
  lookup_table_structure: (params: { table_name: string }) => Promise<string>;
  search_requirement_comments: (params: { query: string; limit?: number }) => Promise<string>;
}
