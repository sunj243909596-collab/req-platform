-- CreateTable
CREATE TABLE "RequirementCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "req_type" TEXT NOT NULL,
    "parent_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "category_id" INTEGER;

-- CreateIndex
CREATE INDEX "RequirementCategory_parent_id_idx" ON "RequirementCategory"("parent_id");
CREATE INDEX "RequirementCategory_req_type_idx" ON "RequirementCategory"("req_type");
CREATE INDEX "Requirement_category_id_idx" ON "Requirement"("category_id");

-- AddForeignKey
ALTER TABLE "RequirementCategory" ADD CONSTRAINT "RequirementCategory_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "RequirementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "RequirementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed root categories
INSERT INTO "RequirementCategory" ("name", "code", "req_type", "parent_id", "sort_order", "enabled", "updated_at")
VALUES
  ('需求', 'REQUIREMENT', 'REQUIREMENT', NULL, 1, true, CURRENT_TIMESTAMP),
  ('缺陷', 'BUG', 'BUG', NULL, 2, true, CURRENT_TIMESTAMP),
  ('改进', 'IMPROVEMENT', 'IMPROVEMENT', NULL, 3, true, CURRENT_TIMESTAMP),
  ('任务', 'TASK', 'TASK', NULL, 4, true, CURRENT_TIMESTAMP);

-- Backfill existing requirements to root categories by req_type
UPDATE "Requirement" r
SET "category_id" = c.id
FROM "RequirementCategory" c
WHERE c."parent_id" IS NULL
  AND c."code" = r."reqType"
  AND r."category_id" IS NULL;
