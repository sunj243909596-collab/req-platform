-- 编码规则按需求类型独立
ALTER TABLE "RequirementNumberRule" ADD COLUMN "req_type_id" INTEGER;

UPDATE "RequirementNumberRule" r
SET "req_type_id" = t.id
FROM "RequirementType" t
WHERE t.code = 'REQUIREMENT' AND r."req_type_id" IS NULL;

INSERT INTO "RequirementNumberRule" ("enabled", "prefix", "req_type_id", "updated_at")
SELECT false, 'REQ', t.id, CURRENT_TIMESTAMP
FROM "RequirementType" t
WHERE t.enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM "RequirementNumberRule" r WHERE r."req_type_id" = t.id
  );

ALTER TABLE "RequirementNumberRule"
  ALTER COLUMN "req_type_id" SET NOT NULL;

CREATE UNIQUE INDEX "RequirementNumberRule_req_type_id_key" ON "RequirementNumberRule"("req_type_id");

ALTER TABLE "RequirementNumberRule"
  ADD CONSTRAINT "RequirementNumberRule_req_type_id_fkey"
  FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 清理非「需求」类型下误同步的业务模块（仅保留类型根）
DELETE FROM "RequirementCategory"
WHERE "parent_id" IN (
  SELECT c2.id
  FROM "RequirementCategory" c2
  JOIN "RequirementType" t ON c2."req_type_id" = t.id
  WHERE c2."parent_id" IS NOT NULL
    AND t.code <> 'REQUIREMENT'
);

DELETE FROM "RequirementCategory"
WHERE "parent_id" IN (
  SELECT c.id
  FROM "RequirementCategory" c
  JOIN "RequirementType" t ON c."req_type_id" = t.id
  WHERE c."parent_id" IS NULL AND t.code <> 'REQUIREMENT'
);
