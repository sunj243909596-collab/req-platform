-- =============================================================================
-- Req Platform — PostgreSQL DDL
-- =============================================================================
-- 本文件由 server/prisma/schema.prisma 同步生成，与 Prisma migrate 保持一致。
-- 适用 PostgreSQL 15 + pgvector 扩展（与 docker-compose.yml 中
-- pgvector/pgvector:0.8.0-pg15 镜像配套）。
--
-- 使用方式：
--   psql "$DATABASE_URL" -f server/prisma/schema.sql
--
-- 说明：
--   1. 主键统一使用 GENERATED ALWAYS AS IDENTITY（PG 10+ 推荐的现代写法，
--      不再需要手动 CREATE SEQUENCE）。
--   2. 时间字段使用 TIMESTAMPTZ（带时区），默认 NOW()。
--   3. JSON 字段使用 JSONB（带索引优化能力）。
--   4. 向量字段（pgvector）维度：1024，与 Claude embedding 对齐。
--   5. 建表顺序严格按外键依赖分层，跨层依赖会导致 ERROR。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. 扩展
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- 模糊检索（如有需要可建 GIN 索引）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- 通用 UUID 生成

-- =============================================================================
-- Layer 1: 无外键依赖的"根"表
-- =============================================================================

-- ---------- Role ----------
CREATE TABLE "role" (
  id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          VARCHAR(64)   NOT NULL UNIQUE,           -- ADMIN, 测试主管 ...
  display_name  TEXT          NOT NULL,                  -- 显示名
  description   TEXT          NULL,
  is_system     BOOLEAN       NOT NULL DEFAULT FALSE,    -- 系统内置角色不可删除
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE  "role"            IS '角色定义（RBAC），ADMIN 为系统内置不可删除';
COMMENT ON COLUMN "role".is_system   IS 'true=系统内置不可删除，false=用户自定义';

-- ---------- Group ----------
CREATE TABLE "group" (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_name   VARCHAR(128)  NOT NULL UNIQUE,
  description  TEXT          NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE "group" IS '组（用于字段隔离、工作流归属）';

-- ---------- RequirementType ----------
CREATE TABLE requirement_type (
  id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          VARCHAR(32)   NOT NULL UNIQUE,
  display_name  TEXT          NOT NULL,
  color         VARCHAR(16)   NOT NULL DEFAULT '#6b7280',
  prefix        VARCHAR(16)   NOT NULL DEFAULT '',
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
  current_seq   INTEGER       NOT NULL DEFAULT 0,    -- 已废弃，保留列兼容；计数见 requirement_seq_counter
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_requirement_type_enabled_sort ON requirement_type(enabled, sort_order);
COMMENT ON TABLE  requirement_type           IS '需求类型（Bug/Feature/Task 等）';
COMMENT ON COLUMN requirement_type.current_seq IS '已废弃，保留兼容；真实计数在 requirement_seq_counter';

-- ---------- Release ----------
CREATE TABLE release (
  id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_no    VARCHAR(64)   NOT NULL,
  release_name  TEXT          NOT NULL,
  status        VARCHAR(16)   NOT NULL DEFAULT 'PLANNED',  -- PLANNED, IN_DEV, IN_REVIEW, RELEASED, CLOSED, CANCELLED
  group_name    VARCHAR(128)  NOT NULL,
  owner         VARCHAR(64)   NULL,
  planned_date  TIMESTAMPTZ   NULL,
  actual_date   TIMESTAMPTZ   NULL,
  description   TEXT          NULL,
  is_deleted    BOOLEAN       NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ   NULL,
  deleted_by    VARCHAR(64)   NULL,
  version       INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_release_status   ON release(status);
CREATE INDEX idx_release_group    ON release(group_name);
CREATE INDEX idx_release_deleted  ON release(is_deleted);
COMMENT ON TABLE release IS '发版计划';

-- =============================================================================
-- Layer 2: 依赖 Layer 1
-- =============================================================================

-- ---------- User ----------
CREATE TABLE "user" (
  id             INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username       VARCHAR(64)   NOT NULL UNIQUE,
  password_hash  TEXT          NOT NULL,
  display_name   TEXT          NOT NULL,
  role           VARCHAR(32)   NOT NULL DEFAULT 'MEMBER',  -- denormalized role name
  role_id        INTEGER       NULL REFERENCES "role"(id) ON DELETE SET NULL,
  group_name     TEXT          NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_role_id ON "user"(role_id);
COMMENT ON TABLE  "user"           IS '平台用户';
COMMENT ON COLUMN "user".role       IS '冗余字段：角色名（用于快速读取，权威值见 role_id → role.name）';

-- ---------- RequirementCategory ----------
CREATE TABLE requirement_category (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(128)  NOT NULL,
  code        VARCHAR(32)   NULL,
  req_type_id INTEGER       NULL REFERENCES requirement_type(id) ON DELETE SET NULL,
  parent_id   INTEGER       NULL REFERENCES requirement_category(id),
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  enabled     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_requirement_category_parent  ON requirement_category(parent_id);
CREATE INDEX idx_requirement_category_reqtype ON requirement_category(req_type_id);
COMMENT ON TABLE requirement_category IS '需求分类（支持树形结构）';

-- ---------- WorkflowDefinition ----------
CREATE TABLE workflow_definition (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         VARCHAR(128)  NOT NULL,
  description  TEXT          NULL,
  enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
  group_id     INTEGER       NOT NULL REFERENCES "group"(id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflow_def_group_enabled ON workflow_definition(group_id, enabled);
COMMENT ON TABLE workflow_definition IS '工作流定义';

-- ---------- KnowledgeBase ----------
CREATE TABLE knowledge_base (
  id                INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              VARCHAR(64)   NOT NULL UNIQUE,
  display_name      TEXT          NOT NULL,
  description       TEXT          NULL,
  routing_examples  JSONB         NULL,
  base_path         TEXT          NOT NULL,
  source_type       VARCHAR(16)   NOT NULL DEFAULT 'directory',  -- directory | upload
  doc_type          VARCHAR(16)   NULL,
  enabled           BOOLEAN       NOT NULL DEFAULT TRUE,
  last_synced_at    TIMESTAMPTZ   NULL,
  version           INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE knowledge_base IS '知识库（多库）';

-- =============================================================================
-- Layer 3: 依赖 Layer 1 + 2
-- =============================================================================

-- ---------- Notification ----------
CREATE TABLE notification (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER       NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type        VARCHAR(32)   NOT NULL,    -- ASSIGNED, STATUS_CHANGED, COMMENTED, MENTIONED, REVIEW_SUBMITTED, REVIEW_RESULT
  req_id      INTEGER       NULL,
  content     TEXT          NOT NULL,
  is_read     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notification_user_id     ON notification(user_id);
CREATE INDEX idx_notification_user_unread ON notification(user_id, is_read) WHERE is_read = FALSE;
COMMENT ON TABLE notification IS '站内通知';

-- ---------- RequirementSeqCounter ----------
CREATE TABLE requirement_seq_counter (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id  INTEGER       NOT NULL REFERENCES requirement_category(id) ON DELETE CASCADE,
  req_type_id  INTEGER       NOT NULL REFERENCES requirement_type(id)    ON DELETE CASCADE,
  current_seq  INTEGER       NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_seq_counter_cat_type  ON requirement_seq_counter(category_id, req_type_id);
CREATE INDEX        idx_seq_counter_req_type  ON requirement_seq_counter(req_type_id);
COMMENT ON TABLE requirement_seq_counter IS '按「分类+类型」独立计数的序列号桶';

-- ---------- RequirementNumberRule ----------
CREATE TABLE requirement_number_rule (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enabled     BOOLEAN       NOT NULL DEFAULT FALSE,
  prefix      VARCHAR(16)   NOT NULL DEFAULT 'REQ',
  req_type_id INTEGER       NOT NULL REFERENCES requirement_type(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_number_rule_req_type ON requirement_number_rule(req_type_id);
COMMENT ON TABLE requirement_number_rule IS '需求编号生成规则（按类型）';

-- ---------- CustomField ----------
CREATE TABLE custom_field (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id     INTEGER       NULL REFERENCES "group"(id),   -- nullable → 全局共用字段
  field_name   VARCHAR(64)   NOT NULL,
  field_key    VARCHAR(64)   NOT NULL,
  field_type   VARCHAR(32)   NOT NULL,    -- TEXT, TEXTAREA, NUMBER, DATE, SELECT, MULTI_SELECT, CHECKBOX
  options      JSONB         NULL,
  required     BOOLEAN       NOT NULL DEFAULT FALSE,
  sort_order   INTEGER       NOT NULL DEFAULT 0,
  placeholder  TEXT          NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_custom_field_group ON custom_field(group_id);
COMMENT ON TABLE custom_field IS '自定义字段定义';

-- ---------- WorkflowStatus ----------
CREATE TABLE workflow_status (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id INTEGER       NOT NULL REFERENCES workflow_definition(id) ON DELETE CASCADE,
  name        VARCHAR(64)   NOT NULL,
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  is_start    BOOLEAN       NOT NULL DEFAULT FALSE,
  is_end      BOOLEAN       NOT NULL DEFAULT FALSE,
  color       VARCHAR(16)   NULL
);
CREATE INDEX idx_workflow_status_workflow ON workflow_status(workflow_id);
COMMENT ON TABLE workflow_status IS '工作流状态定义';

-- ---------- WorkflowTransition ----------
CREATE TABLE workflow_transition (
  id             INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id    INTEGER       NOT NULL REFERENCES workflow_definition(id) ON DELETE CASCADE,
  from_status_id INTEGER       NOT NULL,
  to_status_id   INTEGER       NOT NULL,
  enabled        BOOLEAN       NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX uq_workflow_transition    ON workflow_transition(workflow_id, from_status_id, to_status_id);
CREATE INDEX        idx_workflow_transition_wf ON workflow_transition(workflow_id);
COMMENT ON TABLE workflow_transition IS '工作流状态流转规则';

-- ---------- KnowledgeDocument ----------
CREATE TABLE knowledge_document (
  id                INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  knowledge_base_id INTEGER       NOT NULL REFERENCES knowledge_base(id),
  file_name         TEXT          NOT NULL,
  file_path         TEXT          NOT NULL,
  relative_path     TEXT          NOT NULL,
  file_size         INTEGER       NOT NULL,
  file_hash         VARCHAR(128)  NOT NULL,
  mime_type         VARCHAR(128)  NULL,
  doc_type          VARCHAR(16)   NULL,
  chunk_count       INTEGER       NOT NULL DEFAULT 0,
  indexed_at        TIMESTAMPTZ   NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_kb_doc_kb   ON knowledge_document(knowledge_base_id);
CREATE INDEX idx_kb_doc_hash ON knowledge_document(file_hash);
COMMENT ON TABLE knowledge_document IS '知识库文档';

-- ---------- Conversation ----------
CREATE TABLE conversation (
  id             INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title          TEXT          NULL,
  user_id        INTEGER       NOT NULL,
  context_type   VARCHAR(32)   NOT NULL DEFAULT 'chat',
  context_id     INTEGER       NULL,
  context_model  VARCHAR(64)   NULL,
  message_count  INTEGER       NOT NULL DEFAULT 0,
  total_tokens   INTEGER       NOT NULL DEFAULT 0,
  is_archived    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversation_user ON conversation(user_id);
COMMENT ON TABLE conversation IS 'AI 对话会话';

-- =============================================================================
-- Layer 4: 依赖 Layer 1+2+3（核心业务实体）
-- =============================================================================

-- ---------- Requirement ----------
CREATE TABLE requirement (
  id                INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_no            VARCHAR(64)     NOT NULL UNIQUE,
  req_type_id       INTEGER         NULL REFERENCES requirement_type(id)    ON DELETE SET NULL,
  category_id       INTEGER         NULL REFERENCES requirement_category(id),
  title             TEXT            NOT NULL,
  module            VARCHAR(64)     NULL,
  priority          VARCHAR(8)      NOT NULL DEFAULT 'P2',   -- P0/P1/P2/P3
  status            VARCHAR(32)     NOT NULL DEFAULT '待评审',
  assignee          VARCHAR(64)     NULL,
  reporter          VARCHAR(64)     NULL,
  target_date       TIMESTAMPTZ     NULL,
  terminals         JSONB           NULL,
  tags              JSONB           NULL,
  gsp_impact        VARCHAR(32)     NULL DEFAULT '待评估',  -- 通用项目可改名为 risk_level
  related_tables    TEXT            NULL,
  group_name        VARCHAR(128)    NOT NULL,
  background        TEXT            NULL,
  description       TEXT            NULL,
  design_solution   TEXT            NULL,
  embedding         vector(1024)    NULL,                  -- pgvector embedding
  is_deleted        BOOLEAN         NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ     NULL,
  deleted_by        VARCHAR(64)     NULL,
  release_id        INTEGER         NULL REFERENCES release(id),
  version           INTEGER         NOT NULL DEFAULT 0,    -- 乐观锁
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_requirement_req_type  ON requirement(req_type_id);
CREATE INDEX idx_requirement_category   ON requirement(category_id);
CREATE INDEX idx_requirement_release    ON requirement(release_id);
CREATE INDEX idx_requirement_status     ON requirement(status);
CREATE INDEX idx_requirement_assignee   ON requirement(assignee);
CREATE INDEX idx_requirement_deleted    ON requirement(is_deleted);
COMMENT ON TABLE  requirement               IS '需求单（核心实体）';
COMMENT ON COLUMN requirement.embedding     IS 'pgvector embedding，维度 1024';

-- ---------- SubTask ----------
CREATE TABLE sub_task (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id      INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  task_no     VARCHAR(32)   NOT NULL,
  title       TEXT          NOT NULL,
  description TEXT          NULL,
  assignee    VARCHAR(64)   NULL,
  status      VARCHAR(32)   NOT NULL DEFAULT '待开发',
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sub_task_req ON sub_task(req_id);
COMMENT ON TABLE sub_task IS '需求子任务';

-- ---------- ReqRelation ----------
CREATE TABLE req_relation (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_req_id INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  to_req_id   INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  rel_type    VARCHAR(32)   NOT NULL,    -- PARENT_CHILD, BLOCKS, DEPENDS_ON, DUPLICATES, RELATED
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_req_relation_from ON req_relation(from_req_id);
CREATE INDEX idx_req_relation_to   ON req_relation(to_req_id);
COMMENT ON TABLE req_relation IS '需求间关联关系';

-- ---------- ReqCustomValue ----------
CREATE TABLE req_custom_value (
  id       INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id   INTEGER       NOT NULL REFERENCES requirement(id)  ON DELETE CASCADE,
  field_id INTEGER       NOT NULL REFERENCES custom_field(id) ON DELETE CASCADE,
  value    TEXT          NULL
);
CREATE INDEX idx_req_custom_value_req   ON req_custom_value(req_id);
CREATE INDEX idx_req_custom_value_field ON req_custom_value(field_id);
COMMENT ON TABLE req_custom_value IS '需求自定义字段值';

-- ---------- ReleaseReview ----------
CREATE TABLE release_review (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_id  INTEGER       NOT NULL REFERENCES release(id) ON DELETE CASCADE,
  reviewer    VARCHAR(64)   NOT NULL,
  action      VARCHAR(16)   NOT NULL,    -- SUBMITTED, APPROVED, REJECTED
  comment     TEXT          NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_release_review_release ON release_review(release_id);
COMMENT ON TABLE release_review IS '发版评审记录';

-- ---------- TestCase ----------
CREATE TABLE test_case (
  id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id        INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  case_no       VARCHAR(64)   NOT NULL,
  title         TEXT          NOT NULL,
  precondition  TEXT          NULL,
  steps         JSONB         NOT NULL,    -- [{ "step": 1, "action": "...", "expected": "..." }]
  priority      VARCHAR(8)    NOT NULL DEFAULT 'P2',
  source        VARCHAR(16)   NOT NULL DEFAULT 'manual',  -- "AI" | "manual"
  created_by    VARCHAR(64)   NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_test_case_req ON test_case(req_id);
COMMENT ON TABLE test_case IS '测试用例';

-- ---------- RegressionSuite ----------
CREATE TABLE regression_suite (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id       INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  name         VARCHAR(128)  NOT NULL,
  description  TEXT          NULL,
  created_by   VARCHAR(64)   NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_regression_suite_req ON regression_suite(req_id);
COMMENT ON TABLE regression_suite IS '回归测试套件';

-- ---------- KnowledgeChunk ----------
CREATE TABLE knowledge_chunk (
  id              INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id     INTEGER       NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
  chunk_index     INTEGER       NOT NULL,
  content         TEXT          NOT NULL,
  content_tokens  INTEGER       NULL,
  embedding       vector(1024)  NULL,
  metadata        JSONB         NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_kb_chunk_doc ON knowledge_chunk(document_id);
COMMENT ON TABLE knowledge_chunk IS '知识库 chunk（pgvector 嵌入）';

-- ---------- ConversationMessage ----------
CREATE TABLE conversation_message (
  id              INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id INTEGER       NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role            VARCHAR(16)   NOT NULL,
  content         TEXT          NOT NULL,
  tokens          INTEGER       NULL,
  metadata        JSONB         NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conv_msg_conv_time ON conversation_message(conversation_id, created_at);
COMMENT ON TABLE conversation_message IS 'AI 对话消息';

-- ---------- AiSkill ----------
CREATE TABLE ai_skill (
  id             INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           VARCHAR(64)   NOT NULL UNIQUE,            -- 技能唯一标识符（如 wm-architect）
  display_name   TEXT          NOT NULL,                   -- 显示名称
  description    TEXT          NULL,
  system_prompt  TEXT          NOT NULL,                   -- 支持 {{变量}} 占位符
  category       VARCHAR(32)   NOT NULL DEFAULT 'general', -- design / analysis / chat / rag / custom
  enabled        BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order     INTEGER       NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ai_skill IS 'AI Skill 定义（用户可自定义的系统提示词）';

-- ---------- SkillAssignment ----------
CREATE TABLE skill_assignment (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_key   VARCHAR(64)   NOT NULL UNIQUE,     -- generateDesign / analyzeRequirement / chat / ragSearch
  skill_id   INTEGER       NOT NULL REFERENCES ai_skill(id),
  enabled    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_skill_assignment_skill ON skill_assignment(skill_id);
COMMENT ON TABLE skill_assignment IS 'AI 调用映射（哪个任务用哪个 Skill）';

-- ---------- OperationManual ----------
CREATE TABLE operation_manual (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        VARCHAR(256)  NOT NULL,
  content      TEXT          NULL,                         -- Markdown 内容（article 类型）
  type         VARCHAR(16)   NOT NULL DEFAULT 'article',   -- article | document | link
  category     VARCHAR(32)   NOT NULL DEFAULT 'SOP',       -- SOP | FAQ | 操作指南 | 系统说明 | 其他
  tags         JSONB         NULL,                         -- ["tag1", "tag2"]
  external_url TEXT          NULL,                         -- link 类型专用
  file_path    TEXT          NULL,                         -- document 类型专用
  file_name    TEXT          NULL,                         -- 原始文件名
  file_size    INTEGER       NULL,                         -- 字节
  mime_type    VARCHAR(128)  NULL,
  sort_order   INTEGER       NOT NULL DEFAULT 0,
  created_by   VARCHAR(64)   NOT NULL,
  updated_by   VARCHAR(64)   NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_op_manual_type     ON operation_manual(type);
CREATE INDEX idx_op_manual_category ON operation_manual(category);
CREATE INDEX idx_op_manual_sort     ON operation_manual(sort_order);
COMMENT ON TABLE operation_manual IS '操作手册（统一承载知识文章、文档、链接）';

-- ---------- ManualCategory ----------
CREATE TABLE manual_category (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(64)   NOT NULL UNIQUE,
  sort_order INTEGER       NOT NULL DEFAULT 0,
  created_by VARCHAR(64)   NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_manual_category_sort ON manual_category(sort_order);
COMMENT ON TABLE manual_category IS '操作手册分类';

-- ---------- SystemConfig ----------
CREATE TABLE system_config (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config_key   VARCHAR(128)  NOT NULL UNIQUE,
  config_value JSONB         NOT NULL,
  description  TEXT          NULL,
  updated_by   VARCHAR(64)   NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE system_config IS '系统配置（key-value 存储平台级参数）';

-- ---------- TeamLearning ----------
CREATE TABLE team_learning (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      VARCHAR(256)  NOT NULL,
  content    TEXT          NULL,
  category   VARCHAR(32)   NOT NULL,    -- 最佳实践 / 踩坑记录 / 团队偏好 / 架构决策
  tags       JSONB         NULL,
  author     VARCHAR(64)   NOT NULL,
  confidence INTEGER       NOT NULL DEFAULT 7,    -- 1-10
  source     VARCHAR(16)   NOT NULL DEFAULT 'manual',  -- manual / observed
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_team_learning_category ON team_learning(category);
CREATE INDEX idx_team_learning_author   ON team_learning(author);
COMMENT ON TABLE team_learning IS '团队学习记录';

-- ---------- AgentTask ----------
CREATE TABLE agent_task (
  id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_type     VARCHAR(64)   NOT NULL,
  status        VARCHAR(16)   NOT NULL DEFAULT 'pending',
  params        JSONB         NULL,
  result        JSONB         NULL,
  error_message TEXT          NULL,
  started_at    TIMESTAMPTZ   NULL,
  completed_at  TIMESTAMPTZ   NULL,
  created_by    INTEGER       NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_task_status      ON agent_task(status);
CREATE INDEX idx_agent_task_type_status ON agent_task(task_type, status);
COMMENT ON TABLE agent_task IS 'Agent 异步任务';

-- ---------- RequirementView ----------
CREATE TABLE requirement_view (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER       NOT NULL,
  name       VARCHAR(128)  NOT NULL,
  filters    JSONB         NOT NULL,    -- { reqType?, priority?, status?, assignee?, module?, search? }
  sort_by    VARCHAR(32)   NULL DEFAULT 'updatedAt',
  sort_order VARCHAR(8)    NULL DEFAULT 'desc',
  is_default BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_req_view_user_name ON requirement_view(user_id, name);
CREATE INDEX        idx_req_view_user      ON requirement_view(user_id);
COMMENT ON TABLE requirement_view IS '需求视图（用户保存的筛选器）';

-- ---------- ReqAgentInsight ----------
CREATE TABLE req_agent_insight (
  id              INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id          INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  insight_type    VARCHAR(32)   NOT NULL,
  content         TEXT          NULL,
  structured_data JSONB         NULL,
  model           VARCHAR(64)   NOT NULL,
  tokens_used     INTEGER       NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_req_insight_req_type ON req_agent_insight(req_id, insight_type);
COMMENT ON TABLE req_agent_insight IS '需求 Agent 洞察';

-- ---------- AnalysisCache ----------
CREATE TABLE analysis_cache (
  id             INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id         INTEGER       NULL REFERENCES requirement(id) ON DELETE SET NULL,
  analysis_type  VARCHAR(32)   NOT NULL,
  input_hash     VARCHAR(128)  NOT NULL,
  result         JSONB         NOT NULL,
  model          VARCHAR(64)   NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  tokens_used    INTEGER       NULL,
  latency_ms     INTEGER       NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ   NULL
);
CREATE INDEX idx_analysis_cache_req_type ON analysis_cache(req_id, analysis_type);
CREATE INDEX idx_analysis_cache_hash     ON analysis_cache(input_hash);
COMMENT ON TABLE analysis_cache IS 'AI 分析结果缓存';

-- =============================================================================
-- Layer 5: 依赖 Layer 4（叶节点表）
-- =============================================================================

-- ---------- Attachment ----------
CREATE TABLE attachment (
  id          INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id      INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  file_name   TEXT          NOT NULL,
  file_path   TEXT          NOT NULL,
  file_size   INTEGER       NULL,
  mime_type   VARCHAR(128)  NULL,
  uploaded_by VARCHAR(64)   NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachment_req ON attachment(req_id);
COMMENT ON TABLE attachment IS '需求附件';

-- ---------- Document ----------
CREATE TABLE document (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id     INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  doc_name   TEXT          NOT NULL,
  doc_path   TEXT          NULL,
  doc_type   VARCHAR(16)   NULL,    -- BRD, FSD, PRD, OTHER
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_document_req ON document(req_id);
COMMENT ON TABLE document IS '需求关联文档';

-- ---------- Comment ----------
CREATE TABLE comment (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id     INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  author     VARCHAR(64)   NOT NULL,
  content    TEXT          NOT NULL,
  is_mention BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comment_req ON comment(req_id);
COMMENT ON TABLE comment IS '需求评论';

-- ---------- ActivityLog ----------
CREATE TABLE activity_log (
  id         INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id     INTEGER       NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  actor      VARCHAR(64)   NOT NULL,
  action     VARCHAR(32)   NOT NULL,    -- CREATED, UPDATED, STATUS_CHANGED, ASSIGNED, COMMENTED, DELETED, RESTORED
  field_name VARCHAR(64)   NULL,
  old_value  TEXT          NULL,
  new_value  TEXT          NULL,
  detail     JSONB         NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_log_req      ON activity_log(req_id);
CREATE INDEX idx_activity_log_req_time ON activity_log(req_id, created_at DESC);
COMMENT ON TABLE activity_log IS '需求操作活动日志';

-- ---------- TestRun ----------
CREATE TABLE test_run (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_case_id INTEGER       NOT NULL REFERENCES test_case(id) ON DELETE CASCADE,
  status       VARCHAR(16)   NOT NULL DEFAULT 'pending',   -- pending | passed | failed | blocked
  result       TEXT          NULL,                        -- 测试结果文本备注
  screenshots  JSONB         NULL,                        -- ["uploads/test-runs/{runId}/screen1.png", ...]
  created_by   VARCHAR(64)   NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_test_run_case ON test_run(test_case_id);
COMMENT ON TABLE test_run IS '测试用例执行记录';

-- ---------- RegressionSuiteItem ----------
CREATE TABLE regression_suite_item (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suite_id     INTEGER       NOT NULL REFERENCES regression_suite(id) ON DELETE CASCADE,
  test_case_id INTEGER       NOT NULL REFERENCES test_case(id)        ON DELETE CASCADE,
  sort_order   INTEGER       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX uq_suite_item_suite_case ON regression_suite_item(suite_id, test_case_id);
COMMENT ON TABLE regression_suite_item IS '回归套件包含的测试用例';

-- ---------- RegressionRun ----------
CREATE TABLE regression_run (
  id            INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suite_id      INTEGER       NOT NULL REFERENCES regression_suite(id) ON DELETE CASCADE,
  total_count   INTEGER       NOT NULL DEFAULT 0,
  pass_count    INTEGER       NOT NULL DEFAULT 0,
  fail_count    INTEGER       NOT NULL DEFAULT 0,
  blocked_count INTEGER       NOT NULL DEFAULT 0,
  status        VARCHAR(16)   NOT NULL DEFAULT 'running',  -- running | completed
  created_by    VARCHAR(64)   NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_regression_run_suite ON regression_run(suite_id);
COMMENT ON TABLE regression_run IS '回归测试运行批次';

-- ---------- RegressionRunItem ----------
CREATE TABLE regression_run_item (
  id           INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id       INTEGER       NOT NULL REFERENCES regression_run(id) ON DELETE CASCADE,
  test_case_id INTEGER       NOT NULL REFERENCES test_case(id),
  status       VARCHAR(16)   NOT NULL DEFAULT 'pending',  -- pending | passed | failed | blocked
  result       TEXT          NULL,
  screenshots  JSONB         NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_regression_run_item_run ON regression_run_item(run_id);
COMMENT ON TABLE regression_run_item IS '回归运行单条用例结果';

-- =============================================================================
-- End of schema.sql
-- =============================================================================
