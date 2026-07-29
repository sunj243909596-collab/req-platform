import bcrypt from "bcryptjs";
import type { AuthContext } from "../utils/access";
import { prisma } from "../lib/prisma";
import { UserError, UserErr } from "./user-error";
import { invalidatePermissionCache } from "./permission-cache.service";
import { writePasswordAudit, type RejectReason } from "../utils/password-audit-log";

function validatePassword(password: string): void {
  if (password.length < 8) throw new Error("密码长度不能少于8位");
  if (!/[A-Z]/.test(password)) throw new Error("密码必须包含大写字母");
  if (!/[a-z]/.test(password)) throw new Error("密码必须包含小写字母");
  if (!/[0-9]/.test(password)) throw new Error("密码必须包含数字");
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName: string;
  role: "ADMIN" | "GROUP_LEAD" | "MEMBER";
  groupName?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: string;
  groupName?: string;
  isActive?: boolean;
  password?: string;
}

export async function listUsers(_ctx: AuthContext) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      groupName: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
}

export async function getUser(_ctx: AuthContext, id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      groupName: true,
      isActive: true,
      createdAt: true,
    },
  });
  if (!user) throw new Error("用户不存在");
  return user;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new Error("用户名已存在");

  validatePassword(input.password);

  const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;
  const passwordHash = await bcryptLib.hash(input.password, 10);

  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      displayName: input.displayName,
      role: input.role,
      groupName: input.groupName,
    },
  });
}

export async function updateUser(id: number, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("用户不存在");

  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.role !== undefined) data.role = input.role;
  if (input.groupName !== undefined) data.groupName = input.groupName;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password) {
    validatePassword(input.password);
    const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;
    data.passwordHash = await bcryptLib.hash(input.password, 10);
  }

  return prisma.user.update({ where: { id }, data });
}

export async function deleteUser(id: number) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("用户不存在");

  return prisma.user.delete({ where: { id } });
}

// =============================================================================
// v1.0.0 · 用户自助改密 / ADMIN 代重置
// =============================================================================

export interface ChangeOwnPasswordInput {
  userId: number;
  username: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  ip?: string | null;
}

/**
 * 用户自助改密。
 * 内部校验流程：
 *   1) 必填
 *   2) newPassword === confirmPassword
 *   3) bcrypt.compare(currentPassword, passwordHash) ← 必须旧密码正确
 *   4) validatePassword(newPassword) ← 强度
 *   5) newPassword 与旧哈希比对，新密码 ≠ 旧密码
 *   6) 事务内：写入 passwordHash + tokenVersion+1 + passwordChangedAt + lastPasswordChangeActor
 *   7) 事务内：写 PasswordAuditLog(USER_CHANGE_PASSWORD)
 *   8) 提交后：invalidatePermissionCache(userId)
 * 失败时也会写 PASSWORD_CHANGE_REJECTED（仅写主审计，不影响事务）。
 */
export async function changeMyPassword(input: ChangeOwnPasswordInput) {
  if (!input.currentPassword) throw UserErr.missingField("currentPassword");
  if (!input.newPassword) throw UserErr.missingField("newPassword");
  if (!input.confirmPassword) throw UserErr.missingField("confirmPassword");

  if (input.newPassword !== input.confirmPassword) {
    await writePasswordAudit({
      userId: input.userId,
      eventType: "PASSWORD_CHANGE_REJECTED",
      actor: input.username,
      payload: { reason: "CONFIRM_MISMATCH" satisfies RejectReason },
      ip: input.ip,
    });
    throw UserErr.confirmMismatch();
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true, isActive: true },
  });
  if (!user) {
    await writePasswordAudit({
      userId: input.userId,
      eventType: "PASSWORD_CHANGE_REJECTED",
      actor: input.username,
      payload: { reason: "USER_NOT_FOUND" satisfies RejectReason },
      ip: input.ip,
    });
    throw UserErr.userNotFound();
  }
  if (!user.isActive) {
    await writePasswordAudit({
      userId: input.userId,
      eventType: "PASSWORD_CHANGE_REJECTED",
      actor: input.username,
      payload: { reason: "USER_DISABLED" satisfies RejectReason },
      ip: input.ip,
    });
    throw UserErr.userDisabled();
  }

  const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;

  const currentOk = await bcryptLib.compare(input.currentPassword, user.passwordHash);
  if (!currentOk) {
    await writePasswordAudit({
      userId: input.userId,
      eventType: "PASSWORD_CHANGE_REJECTED",
      actor: input.username,
      payload: { reason: "OLD_MISMATCH" satisfies RejectReason },
      ip: input.ip,
    });
    throw UserErr.oldMismatch();
  }

  try {
    validatePassword(input.newPassword);
  } catch (e) {
    await writePasswordAudit({
      userId: input.userId,
      eventType: "PASSWORD_CHANGE_REJECTED",
      actor: input.username,
      payload: { reason: "WEAK" satisfies RejectReason, message: (e as Error).message },
      ip: input.ip,
    });
    throw UserErr.weakPassword((e as Error).message);
  }

  // 新密码不能与旧密码相同（hash 比对，避免 hash 碰撞误判）
  const sameAsOld = await bcryptLib.compare(input.newPassword, user.passwordHash);
  if (sameAsOld) {
    await writePasswordAudit({
      userId: input.userId,
      eventType: "PASSWORD_CHANGE_REJECTED",
      actor: input.username,
      payload: { reason: "SAME_AS_OLD" satisfies RejectReason },
      ip: input.ip,
    });
    throw UserErr.sameAsOld();
  }

  const newHash = await bcryptLib.hash(input.newPassword, 10);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: input.userId },
      data: {
        passwordHash: newHash,
        tokenVersion: { increment: 1 },
        passwordChangedAt: new Date(),
        lastPasswordChangeActor: input.username,
      },
      select: { passwordChangedAt: true },
    });
    await writePasswordAudit({
      userId: input.userId,
      eventType: "USER_CHANGE_PASSWORD",
      actor: input.username,
      payload: { source: "self" },
      ip: input.ip,
      tx,
    });
    return u;
  });

  // 失效权限缓存；下一个请求会重新解析
  invalidatePermissionCache(input.userId);

  return { passwordChangedAt: updated.passwordChangedAt };
}

export interface ResetPasswordByAdminInput {
  targetUserId: number;
  adminUsername: string;
  newPassword: string;
  ip?: string | null;
}

/**
 * ADMIN 代用户重置密码。
 *   - 不校验旧密码（ADMIN 特权场景）
 *   - 强度照旧校验
 *   - 同时强制目标用户下次登录必须改密（mustChangePassword=true，仅落字段，路由拦截 v1.1 落地）
 *   - tokenVersion +1 让目标用户所有在线会话失效
 */
export async function resetPasswordByAdmin(input: ResetPasswordByAdminInput) {
  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { username: true },
  });
  if (!target) throw UserErr.userNotFound();

  validatePassword(input.newPassword);
  const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;
  const newHash = await bcryptLib.hash(input.newPassword, 10);
  const actor = `admin:${input.adminUsername}`;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.targetUserId },
      data: {
        passwordHash: newHash,
        tokenVersion: { increment: 1 },
        passwordChangedAt: new Date(),
        lastPasswordChangeActor: actor,
        mustChangePassword: true,
      },
    });
    await writePasswordAudit({
      userId: input.targetUserId,
      eventType: "ADMIN_RESET_PASSWORD",
      actor,
      payload: {
        targetUserId: input.targetUserId,
        targetUsername: target.username,
        adminUsername: input.adminUsername,
      },
      ip: input.ip,
      tx,
    });
  });

  invalidatePermissionCache(input.targetUserId);
}
