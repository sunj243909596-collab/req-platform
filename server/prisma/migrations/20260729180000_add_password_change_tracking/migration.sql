-- =============================================================================
-- v1.0.0 · 用户自助修改密码 — 密码安全字段 + PasswordAuditLog 审计
-- Date: 2026-07-29
--
-- Background:
--   1) 原 PUT /api/users/:id 被 requireRole("ADMIN") 锁死，普通用户无法改密
--   2) ForgotPasswordPage 是纯前端 mock，无实际邮件链路
--   3) 缺 tokenVersion 改密即时失效机制；缺密码审计日志
--
-- 本次落地：
--   (a) User 表加 6 字段：3 个本期消费（tokenVersion / passwordChangedAt /
--       lastPasswordChangeActor）+ 3 个 v1.1 预留（mustChangePassword /
--       failedLoginAttempts / lockUntil）
--   (b) 新建 PasswordAuditLog 表（独立于 ActivityLog，避免受 reqId 必填约束）
--
-- 配套代码：server/src/routes/me.routes.ts (POST /me/password)
--           server/src/services/user.service.ts (changeMyPassword / resetPasswordByAdmin)
--           server/src/middleware/auth.ts (tokenVersion 校验)
-- =============================================================================

-- CreateTable: 密码审计日志（独立于 ActivityLog）
CREATE TABLE "PasswordAuditLog" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordAuditLog_user_id_created_at_idx" ON "PasswordAuditLog"("user_id", "created_at");
CREATE INDEX "PasswordAuditLog_event_type_created_at_idx" ON "PasswordAuditLog"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "PasswordAuditLog" ADD CONSTRAINT "PasswordAuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: User 加密码安全字段（v1.0.0 + v1.1 预留）
ALTER TABLE "User"
    ADD COLUMN "token_version"           INTEGER    NOT NULL DEFAULT 0,
    ADD COLUMN "password_changed_at"     TIMESTAMP(3),
    ADD COLUMN "last_pwd_change_actor"   TEXT,
    ADD COLUMN "must_change_password"    BOOLEAN    NOT NULL DEFAULT false,
    ADD COLUMN "failed_login_attempts"   INTEGER    NOT NULL DEFAULT 0,
    ADD COLUMN "lock_until"              TIMESTAMP(3);

-- Comments（与 schema.prisma 字段说明保持一致）
COMMENT ON COLUMN "User"."token_version"           IS '令牌版本号，每次改密 +1，旧 JWT 立即失效';
COMMENT ON COLUMN "User"."password_changed_at"     IS '密码最近修改时间';
COMMENT ON COLUMN "User"."last_pwd_change_actor"   IS '最近一次改密的操作者 username（含 ADMIN 代改前缀 admin:<name>）';
COMMENT ON COLUMN "User"."must_change_password"    IS '下次登录强制改密（v1.1 路由拦截消费）';
COMMENT ON COLUMN "User"."failed_login_attempts"   IS '登录失败累计次数（v1.1 锁定逻辑消费）';
COMMENT ON COLUMN "User"."lock_until"              IS '账户锁定到期时间（v1.1 消费）';

COMMENT ON COLUMN "PasswordAuditLog"."event_type"  IS 'USER_CHANGE_PASSWORD / ADMIN_RESET_PASSWORD / PASSWORD_CHANGE_REJECTED';
COMMENT ON COLUMN "PasswordAuditLog"."actor"        IS '操作者：自助=username；ADMIN 代改=admin:<username>';
COMMENT ON COLUMN "PasswordAuditLog"."payload"      IS '补充信息（如 source / targetUserId / reason: OLD_MISMATCH|WEAK|SAME_AS_OLD|RATE_LIMIT）';
