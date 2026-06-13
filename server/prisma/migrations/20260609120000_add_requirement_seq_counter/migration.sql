-- 按「选中分类 + 需求类型」独立计数（替代 RequirementType.current_seq 的全局 per-type 语义）
CREATE TABLE "RequirementSeqCounter" (
    "id"          SERIAL PRIMARY KEY,
    "category_id" INTEGER NOT NULL,
    "req_type_id" INTEGER NOT NULL,
    "current_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementSeqCounter_category_id_req_type_id_key" UNIQUE ("category_id", "req_type_id"),
    CONSTRAINT "RequirementSeqCounter_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "RequirementCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RequirementSeqCounter_req_type_id_fkey" FOREIGN KEY ("req_type_id") REFERENCES "RequirementType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RequirementSeqCounter_req_type_id_idx" ON "RequirementSeqCounter"("req_type_id");
