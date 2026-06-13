-- Migration: 字典化需求类型 (RequirementType)
-- 把 Requirement.reqType / RequirementCategory.reqType 从 String 列替换为 req_type_id 外键
-- 1. 新建字典表 + seed 4 个默认类型
-- 2. 新增 req_type_id 列
-- 3. Backfill 从旧 req_type 字符串映射到 id
-- 4. 断言 backfill 0 漏
-- 5. 加 FK 约束
-- 6. 删除旧列 + 旧索引

-- 1. 新建字典表
CREATE TABLE "RequirementType" (
    "id"          SERIAL PRIMARY KEY,
    "code"        TEXT NOT NULL UNIQUE,
    "display_name" TEXT NOT NULL,
    "color"       TEXT NOT NULL DEFAULT '#6b7280',
    "prefix"      TEXT NOT NULL DEFAULT '',
    "sort_order"  INTEGER NOT NULL DEFAULT 0,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RequirementType_enabled_sort_order_idx" ON "RequirementType"("enabled", "sort_order");

-- 2. Seed 4 个默认类型
INSERT INTO "RequirementType" ("code", "display_name", "color", "prefix", "sort_order", "enabled", "updated_at")
VALUES
  ('REQUIREMENT',  '需求', '#eff6ff', 'REQ', 1, true, CURRENT_TIMESTAMP),
  ('BUG',          '缺陷', '#fef2f2', 'BUG', 2, true, CURRENT_TIMESTAMP),
  ('IMPROVEMENT',  '改进', '#faf5ff', 'IMP', 3, true, CURRENT_TIMESTAMP),
  ('TASK',         '任务', '#f0fdfa', 'TSK', 4, true, CURRENT_TIMESTAMP);

-- 3. Requirement 加列 + 索引
ALTER TABLE "Requirement" ADD COLUMN "req_type_id" INTEGER;
CREATE INDEX "Requirement_req_type_id_idx" ON "Requirement"("req_type_id");

-- 4. RequirementCategory 加列 + 索引（替换旧 req_type 索引）
ALTER TABLE "RequirementCategory" ADD COLUMN "req_type_id" INTEGER;
CREATE INDEX "RequirementCategory_req_type_id_idx" ON "RequirementCategory"("req_type_id");

-- 5. Backfill (从旧 req_type 字符串映射到 req_type_id)
-- 注意：原 schema 不一致 — Requirement.reqType 没 @map (列名 reqType)，
-- RequirementCategory.reqType 有 @map (列名 req_type)。分别用各自的列名。
UPDATE "Requirement" r
SET "req_type_id" = t.id
FROM "RequirementType" t
WHERE t.code = r."reqType";

UPDATE "RequirementCategory" c
SET "req_type_id" = t.id
FROM "RequirementType" t
WHERE t.code = c."req_type";

-- 6. 验证 backfill：若有 0 行匹配应报错强制中止
DO $$
DECLARE
  missing_req INT;
  missing_cat INT;
BEGIN
  SELECT COUNT(*) INTO missing_req FROM "Requirement" WHERE "req_type_id" IS NULL AND "reqType" IS NOT NULL;
  SELECT COUNT(*) INTO missing_cat FROM "RequirementCategory" WHERE "req_type_id" IS NULL AND "req_type" IS NOT NULL;
  IF missing_req > 0 OR missing_cat > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % requirements, % categories unmatched', missing_req, missing_cat;
  END IF;
END $$;

-- 7. 加 FK 约束
ALTER TABLE "Requirement"
  ADD CONSTRAINT "Requirement_req_type_id_fkey"
  FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE SET NULL;

ALTER TABLE "RequirementCategory"
  ADD CONSTRAINT "RequirementCategory_req_type_id_fkey"
  FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE SET NULL;

-- 8. 删除旧列 + 旧索引
-- Requirement 旧列名是 "reqType" (没 @map), Category 旧列名是 "req_type" (有 @map)
ALTER TABLE "Requirement" DROP COLUMN "reqType";
DROP INDEX IF EXISTS "RequirementCategory_req_type_idx";
ALTER TABLE "RequirementCategory" DROP COLUMN "req_type";
