-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "groupName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Requirement" (
    "id" SERIAL NOT NULL,
    "reqNo" TEXT NOT NULL,
    "reqType" TEXT NOT NULL DEFAULT 'REQUIREMENT',
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
    "group_id" INTEGER NOT NULL,
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
CREATE TABLE "WorkflowConfig" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "status_list" JSONB NOT NULL,
    "transitions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "base_path" TEXT NOT NULL,
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
    "embedding" JSONB,
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Group_groupName_key" ON "Group"("groupName");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_reqNo_key" ON "Requirement"("reqNo");

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
CREATE INDEX "ReqAgentInsight_req_id_insight_type_idx" ON "ReqAgentInsight"("req_id", "insight_type");

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubTask" ADD CONSTRAINT "SubTask_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqRelation" ADD CONSTRAINT "ReqRelation_from_req_id_fkey" FOREIGN KEY ("from_req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqRelation" ADD CONSTRAINT "ReqRelation_to_req_id_fkey" FOREIGN KEY ("to_req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_req_id_fkey" FOREIGN KEY ("req_id") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowConfig" ADD CONSTRAINT "WorkflowConfig_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
