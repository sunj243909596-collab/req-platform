-- =============================================================================
-- Req Platform — PostgreSQL 15 DDL (snapshot)
-- =============================================================================
-- 本文件是数据库 schema 的快照视图，与 server/prisma/schema.prisma 保持一致。
-- 数据来源：server/prisma/schema.prisma (48 models)
-- 重建方法：bash server/scripts/regenerate-schema-sql.sh
--   （内部调用 prisma migrate diff --from-empty --to-schema-datamodel）
--
-- 使用方式（冷启动快速初始化）：
--   psql "$DATABASE_URL" -f server/prisma/schema.sql
--
-- 完整迁移历史请参考 server/prisma/migrations/ 目录（17 个 migration 链）。
-- Migrations 与 schema.sql 的差异检查：
--   bash scripts/check-schema-sync.sh
--
-- 说明：
--   1. 主键统一使用 SERIAL（PG 默认与 prisma-client-js 兼容）。
--   2. 时间字段使用 TIMESTAMP(3)（毫秒精度，与 Prisma 默认一致）。
--   3. JSON 字段使用 JSONB。
--   4. 向量字段（pgvector）维度：1024，与 Claude embedding 对齐。
--   5. CREATE TABLE 顺序任意：所有 FK 通过 ALTER TABLE ... ADD CONSTRAINT 添加。
--   6. 需提前启用扩展：vector / pg_trgm / uuid-ossp（见下文）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector (向量检索)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- 模糊检索 (GIN 索引)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID 生成

-- -----------------------------------------------------------------------------
-- Tables (48 from schema.prisma)
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "role_id" INTEGER,
    "groupName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "groupName" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "prefix" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "current_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementSeqCounter" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "req_type_id" INTEGER NOT NULL,
    "current_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementSeqCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementNumberRule" (
    "id" SERIAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "prefix" TEXT NOT NULL DEFAULT 'REQ',
    "req_type_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementNumberRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "req_type_id" INTEGER,
    "parent_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" SERIAL NOT NULL,
    "reqNo" TEXT NOT NULL,
    "req_type_id" INTEGER,
    "category_id" INTEGER,
    "title" TEXT NOT NULL,
    "module" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "status" TEXT NOT NULL DEFAULT '待评审',
    "assignee" TEXT,
    "reporter" TEXT,
    "target_date" TIMESTAMP(3),
    "terminals" JSONB,
    "tags" JSONB,
    "gsp_impact" TEXT DEFAULT '待评估',
    "related_tables" TEXT,
    "group_name" TEXT NOT NULL,
    "background" TEXT,
    "description" TEXT,
    "design_solution" TEXT,
    "embedding" vector(1024),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "release_id" INTEGER,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubTask" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "task_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee" TEXT,
    "status" TEXT NOT NULL DEFAULT '待开发',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqRelation" (
    "id" SERIAL NOT NULL,
    "from_req_id" INTEGER NOT NULL,
    "to_req_id" INTEGER NOT NULL,
    "rel_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReqRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER,
    "field_name" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "placeholder" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqCustomValue" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "field_id" INTEGER NOT NULL,
    "value" TEXT,

    CONSTRAINT "ReqCustomValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" SERIAL NOT NULL,
    "version_no" TEXT NOT NULL,
    "release_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "group_name" TEXT NOT NULL,
    "owner" TEXT,
    "planned_date" TIMESTAMP(3),
    "actual_date" TIMESTAMP(3),
    "description" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseReview" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "reviewer" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "doc_name" TEXT NOT NULL,
    "doc_path" TEXT,
    "doc_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_mention" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "case_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "precondition" TEXT,
    "steps" JSONB NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P2',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" SERIAL NOT NULL,
    "test_case_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "screenshots" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionSuite" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegressionSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionSuiteItem" (
    "id" SERIAL NOT NULL,
    "suite_id" INTEGER NOT NULL,
    "test_case_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RegressionSuiteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionRun" (
    "id" SERIAL NOT NULL,
    "suite_id" INTEGER NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "pass_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegressionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionRunItem" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "test_case_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "screenshots" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegressionRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "req_id" INTEGER,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "group_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStatus" (
    "id" SERIAL NOT NULL,
    "workflow_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_start" BOOLEAN NOT NULL DEFAULT false,
    "is_end" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,

    CONSTRAINT "WorkflowStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" SERIAL NOT NULL,
    "workflow_id" INTEGER NOT NULL,
    "from_status_id" INTEGER NOT NULL,
    "to_status_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "routing_examples" JSONB,
    "base_path" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'directory',
    "doc_type" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" SERIAL NOT NULL,
    "knowledge_base_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "relative_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "mime_type" TEXT,
    "doc_type" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "indexed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" SERIAL NOT NULL,
    "document_id" INTEGER NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_tokens" INTEGER,
    "embedding" vector(1024),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "user_id" INTEGER NOT NULL,
    "context_type" TEXT NOT NULL DEFAULT 'chat',
    "context_id" INTEGER,
    "context_model" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisCache" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER,
    "analysis_type" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "tokens_used" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "AnalysisCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" SERIAL NOT NULL,
    "task_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "params" JSONB,
    "result" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementView" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "sort_by" TEXT DEFAULT 'updatedAt',
    "sort_order" TEXT DEFAULT 'desc',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqAgentInsight" (
    "id" SERIAL NOT NULL,
    "req_id" INTEGER NOT NULL,
    "insight_type" TEXT NOT NULL,
    "content" TEXT,
    "structured_data" JSONB,
    "model" TEXT NOT NULL,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReqAgentInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamLearning" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "category" TEXT NOT NULL,
    "tags" JSONB,
    "author" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 7,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamLearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSkill" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "system_prompt" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillAssignment" (
    "id" SERIAL NOT NULL,
    "task_key" TEXT NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationManual" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "type" TEXT NOT NULL DEFAULT 'article',
    "category" TEXT NOT NULL DEFAULT 'SOP',
    "tags" JSONB,
    "external_url" TEXT,
    "file_path" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationManual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" SERIAL NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionResource" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parent_code" TEXT,
    "display_name" TEXT NOT NULL,
    "path" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "resource_code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "bind_role" TEXT,
    "bind_group_name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionGroupItem" (
    "permission_group_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "PermissionGroupItem_pkey" PRIMARY KEY ("permission_group_id","permission_id")
);

-- CreateTable
CREATE TABLE "UserPermissionGroup" (
    "user_id" INTEGER NOT NULL,
    "permission_group_id" INTEGER NOT NULL,

    CONSTRAINT "UserPermissionGroup_pkey" PRIMARY KEY ("user_id","permission_group_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Group_groupName_key" ON "Group"("groupName");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementType_code_key" ON "RequirementType"("code");

-- CreateIndex
CREATE INDEX "RequirementType_enabled_sort_order_idx" ON "RequirementType"("enabled", "sort_order");

-- CreateIndex
CREATE INDEX "RequirementSeqCounter_req_type_id_idx" ON "RequirementSeqCounter"("req_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementSeqCounter_category_id_req_type_id_key" ON "RequirementSeqCounter"("category_id", "req_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementNumberRule_req_type_id_key" ON "RequirementNumberRule"("req_type_id");

-- CreateIndex
CREATE INDEX "RequirementCategory_parent_id_idx" ON "RequirementCategory"("parent_id");

-- CreateIndex
CREATE INDEX "RequirementCategory_req_type_id_idx" ON "RequirementCategory"("req_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_reqNo_key" ON "Requirement"("reqNo");

-- CreateIndex
CREATE INDEX "Requirement_req_type_id_idx" ON "Requirement"("req_type_id");

-- CreateIndex
CREATE INDEX "TestCase_req_id_idx" ON "TestCase"("req_id");

-- CreateIndex
CREATE INDEX "TestRun_test_case_id_idx" ON "TestRun"("test_case_id");

-- CreateIndex
CREATE INDEX "RegressionSuite_req_id_idx" ON "RegressionSuite"("req_id");

-- CreateIndex
CREATE UNIQUE INDEX "RegressionSuiteItem_suite_id_test_case_id_key" ON "RegressionSuiteItem"("suite_id", "test_case_id");

-- CreateIndex
CREATE INDEX "RegressionRun_suite_id_idx" ON "RegressionRun"("suite_id");

-- CreateIndex
CREATE INDEX "RegressionRunItem_run_id_idx" ON "RegressionRunItem"("run_id");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_group_id_enabled_idx" ON "WorkflowDefinition"("group_id", "enabled");

-- CreateIndex
CREATE INDEX "WorkflowStatus_workflow_id_idx" ON "WorkflowStatus"("workflow_id");

-- CreateIndex
CREATE INDEX "WorkflowTransition_workflow_id_idx" ON "WorkflowTransition"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTransition_workflow_id_from_status_id_to_status_id_key" ON "WorkflowTransition"("workflow_id", "from_status_id", "to_status_id");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBase_name_key" ON "KnowledgeBase"("name");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_document_id_idx" ON "KnowledgeChunk"("document_id");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversation_id_created_at_idx" ON "ConversationMessage"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "AnalysisCache_req_id_analysis_type_idx" ON "AnalysisCache"("req_id", "analysis_type");

-- CreateIndex
CREATE INDEX "AnalysisCache_input_hash_idx" ON "AnalysisCache"("input_hash");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_task_type_status_idx" ON "AgentTask"("task_type", "status");

-- CreateIndex
CREATE INDEX "RequirementView_user_id_idx" ON "RequirementView"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementView_user_id_name_key" ON "RequirementView"("user_id", "name");

-- CreateIndex
CREATE INDEX "ReqAgentInsight_req_id_insight_type_idx" ON "ReqAgentInsight"("req_id", "insight_type");

-- CreateIndex
CREATE INDEX "TeamLearning_category_idx" ON "TeamLearning"("category");

-- CreateIndex
CREATE INDEX "TeamLearning_author_idx" ON "TeamLearning"("author");

-- CreateIndex
CREATE UNIQUE INDEX "AiSkill_name_key" ON "AiSkill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAssignment_task_key_key" ON "SkillAssignment"("task_key");

-- CreateIndex
CREATE INDEX "SkillAssignment_skill_id_idx" ON "SkillAssignment"("skill_id");

-- CreateIndex
CREATE INDEX "OperationManual_type_idx" ON "OperationManual"("type");

-- CreateIndex
CREATE INDEX "OperationManual_category_idx" ON "OperationManual"("category");

-- CreateIndex
CREATE INDEX "OperationManual_sort_order_idx" ON "OperationManual"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ManualCategory_name_key" ON "ManualCategory"("name");

-- CreateIndex
CREATE INDEX "ManualCategory_sort_order_idx" ON "ManualCategory"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_config_key_key" ON "SystemConfig"("config_key");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionResource_code_key" ON "PermissionResource"("code");

-- CreateIndex
CREATE INDEX "PermissionResource_type_idx" ON "PermissionResource"("type");

-- CreateIndex
CREATE INDEX "PermissionResource_parent_code_idx" ON "PermissionResource"("parent_code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Permission_resource_code_idx" ON "Permission"("resource_code");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGroup_name_key" ON "PermissionGroup"("name");

-- CreateIndex
CREATE INDEX "PermissionGroup_bind_role_idx" ON "PermissionGroup"("bind_role");

-- CreateIndex
CREATE INDEX "PermissionGroup_bind_group_name_idx" ON "PermissionGroup"("bind_group_name");

-- CreateIndex
CREATE INDEX "PermissionGroupItem_permission_id_idx" ON "PermissionGroupItem"("permission_id");

-- CreateIndex
CREATE INDEX "UserPermissionGroup_user_id_idx" ON "UserPermissionGroup"("user_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSeqCounter" ADD CONSTRAINT "RequirementSeqCounter_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "RequirementCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSeqCounter" ADD CONSTRAINT "RequirementSeqCounter_req_type_id_fkey" FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementNumberRule" ADD CONSTRAINT "RequirementNumberRule_req_type_id_fkey" FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementCategory" ADD CONSTRAINT "RequirementCategory_req_type_id_fkey" FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementCategory" ADD CONSTRAINT "RequirementCategory_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "RequirementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_req_type_id_fkey" FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "RequirementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTask" ADD CONSTRAINT "SubTask_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqRelation" ADD CONSTRAINT "ReqRelation_from_req_id_fkey" FOREIGN KEY ("from_req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqRelation" ADD CONSTRAINT "ReqRelation_to_req_id_fkey" FOREIGN KEY ("to_req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqCustomValue" ADD CONSTRAINT "ReqCustomValue_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqCustomValue" ADD CONSTRAINT "ReqCustomValue_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "CustomField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseReview" ADD CONSTRAINT "ReleaseReview_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionSuite" ADD CONSTRAINT "RegressionSuite_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionSuiteItem" ADD CONSTRAINT "RegressionSuiteItem_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "RegressionSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionSuiteItem" ADD CONSTRAINT "RegressionSuiteItem_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRun" ADD CONSTRAINT "RegressionRun_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "RegressionSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRunItem" ADD CONSTRAINT "RegressionRunItem_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "RegressionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRunItem" ADD CONSTRAINT "RegressionRunItem_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "TestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "KnowledgeBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "KnowledgeDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCache" ADD CONSTRAINT "AnalysisCache_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqAgentInsight" ADD CONSTRAINT "ReqAgentInsight_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssignment" ADD CONSTRAINT "SkillAssignment_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "AiSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_resource_code_fkey" FOREIGN KEY ("resource_code") REFERENCES "PermissionResource"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGroupItem" ADD CONSTRAINT "PermissionGroupItem_permission_group_id_fkey" FOREIGN KEY ("permission_group_id") REFERENCES "PermissionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGroupItem" ADD CONSTRAINT "PermissionGroupItem_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionGroup" ADD CONSTRAINT "UserPermissionGroup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionGroup" ADD CONSTRAINT "UserPermissionGroup_permission_group_id_fkey" FOREIGN KEY ("permission_group_id") REFERENCES "PermissionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Column / Table Comments (preserved across regenerations, PascalCase quoted)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE  "Role"            IS '角色定义（RBAC），ADMIN 为系统内置不可删除';
COMMENT ON COLUMN "Role".is_system   IS 'true=系统内置不可删除，false=用户自定义';
COMMENT ON TABLE "Group" IS '组（用于字段隔离、工作流归属）';
COMMENT ON TABLE  "RequirementType"           IS '需求类型（Bug/Feature/Task 等）';
COMMENT ON COLUMN "RequirementType".current_seq IS '已废弃，保留兼容；真实计数在 requirement_seq_counter';
COMMENT ON TABLE "Release" IS '发版计划';
COMMENT ON TABLE  "User"           IS '平台用户';
COMMENT ON COLUMN "User".role       IS '冗余字段：角色名（用于快速读取，权威值见 role_id → role.name）';
COMMENT ON TABLE "RequirementCategory" IS '需求分类（支持树形结构）';
COMMENT ON TABLE "WorkflowDefinition" IS '工作流定义';
COMMENT ON TABLE "KnowledgeBase" IS '知识库（多库）';
COMMENT ON TABLE "Notification" IS '站内通知';
COMMENT ON TABLE "RequirementSeqCounter" IS '按「分类+类型」独立计数的序列号桶';
COMMENT ON TABLE "RequirementNumberRule" IS '需求编号生成规则（按类型）';
COMMENT ON TABLE "CustomField" IS '自定义字段定义';
COMMENT ON TABLE "WorkflowStatus" IS '工作流状态定义';
COMMENT ON TABLE "WorkflowTransition" IS '工作流状态流转规则';
COMMENT ON TABLE "KnowledgeDocument" IS '知识库文档';
COMMENT ON TABLE "Conversation" IS 'AI 对话会话';
COMMENT ON TABLE  "Requirement"               IS '需求单（核心实体）';
COMMENT ON COLUMN "Requirement".embedding     IS 'pgvector embedding，维度 1024';
COMMENT ON TABLE "SubTask" IS '需求子任务';
COMMENT ON TABLE "ReqRelation" IS '需求间关联关系';
COMMENT ON TABLE "ReqCustomValue" IS '需求自定义字段值';
COMMENT ON TABLE "ReleaseReview" IS '发版评审记录';
COMMENT ON TABLE "TestCase" IS '测试用例';
COMMENT ON TABLE "RegressionSuite" IS '回归测试套件';
COMMENT ON TABLE "KnowledgeChunk" IS '知识库 chunk（pgvector 嵌入）';
COMMENT ON TABLE "ConversationMessage" IS 'AI 对话消息';
COMMENT ON TABLE "AiSkill" IS 'AI Skill 定义（用户可自定义的系统提示词）';
COMMENT ON TABLE "SkillAssignment" IS 'AI 调用映射（哪个任务用哪个 Skill）';
COMMENT ON TABLE "OperationManual" IS '操作手册（统一承载知识文章、文档、链接）';
COMMENT ON TABLE "ManualCategory" IS '操作手册分类';
COMMENT ON TABLE "SystemConfig" IS '系统配置（key-value 存储平台级参数）';
COMMENT ON TABLE "TeamLearning" IS '团队学习记录';
COMMENT ON TABLE "AgentTask" IS 'Agent 异步任务';
COMMENT ON TABLE "RequirementView" IS '需求视图（用户保存的筛选器）';
COMMENT ON TABLE "ReqAgentInsight" IS '需求 Agent 洞察';
COMMENT ON TABLE "AnalysisCache" IS 'AI 分析结果缓存';
COMMENT ON TABLE "Attachment" IS '需求附件';
COMMENT ON TABLE "Document" IS '需求关联文档';
COMMENT ON TABLE "Comment" IS '需求评论';
COMMENT ON TABLE "ActivityLog" IS '需求操作活动日志';
COMMENT ON TABLE "TestRun" IS '测试用例执行记录';
COMMENT ON TABLE "RegressionSuiteItem" IS '回归套件包含的测试用例';
COMMENT ON TABLE "RegressionRun" IS '回归测试运行批次';
COMMENT ON TABLE "RegressionRunItem" IS '回归运行单条用例结果';

-- =============================================================================
-- End of schema.sql
-- =============================================================================
