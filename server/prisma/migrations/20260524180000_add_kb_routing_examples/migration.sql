-- 知识库路由样例：供智能选库 LLM 参考的「问题 → 应选库」示例
ALTER TABLE "KnowledgeBase" ADD COLUMN "routing_examples" JSONB;
