-- =============================================================================
-- Sync 17 missing tables to align schema.prisma with migrations history
-- Date: 2026-06-25
--
-- Background:
--   schema.prisma declares 48 models, but the 16 migrations created only 32 tables.
--   The 17 models below were either:
--     (a) declared in schema.prisma but never migrated (Role, WorkflowDefinition, etc.)
--     (b) added to schema.prisma during refactor without a corresponding migration
--   This migration brings the migrations history in sync with schema.prisma.
--
-- Affected tables (17):
--   - AiSkill, ManualCategory, OperationManual
--   - RegressionRun, RegressionRunItem, RegressionSuite, RegressionSuiteItem
--   - RequirementView, Role, SkillAssignment, SystemConfig, TeamLearning
--   - TestCase, TestRun
--   - WorkflowDefinition, WorkflowStatus, WorkflowTransition
--
-- IMPORTANT: After this migration, `prisma migrate deploy` and
-- `psql -f server/prisma/schema.sql` produce identical schemas.
-- =============================================================================

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

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

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
CREATE INDEX "RequirementView_user_id_idx" ON "RequirementView"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementView_user_id_name_key" ON "RequirementView"("user_id", "name");

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
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssignment" ADD CONSTRAINT "SkillAssignment_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "AiSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- Add Requirement.embedding column (the 3 dimension migrations assume it exists,
-- but init migration never created it). Added here at final dimension 1024.
-- -----------------------------------------------------------------------------
-- AddEmbeddingColumn
ALTER TABLE "Requirement" ADD COLUMN "embedding" vector(1024);
