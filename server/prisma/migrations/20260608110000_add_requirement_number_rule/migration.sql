-- 1. RequirementType 加 current_seq（按 type 计数器）
ALTER TABLE "RequirementType" ADD COLUMN "current_seq" INTEGER NOT NULL DEFAULT 0;

-- 2. 新建规则表
CREATE TABLE "RequirementNumberRule" (
    "id"         SERIAL PRIMARY KEY,
    "enabled"    BOOLEAN NOT NULL DEFAULT false,
    "prefix"     TEXT NOT NULL DEFAULT 'REQ',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- 3. Seed 一行默认规则（enabled=false，不影响现有数据）
INSERT INTO "RequirementNumberRule" ("enabled", "prefix", "updated_at")
VALUES (false, 'REQ', CURRENT_TIMESTAMP);
