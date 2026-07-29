/**
 * 密码相关审计日志工具（写入 PasswordAuditLog 表）
 *
 * 为什么独立于 ActivityLog：
 *   现有 ActivityLog 表的 reqId 字段是 Requirement 的外键且非空，
 *   改密不属于"需求操作"，硬塞进去会破坏语义与 NOT NULL 约束。
 *   PasswordAuditLog 是专用审计表，能独立查询/导出/合规审计。
 *
 * 设计约束：
 *   - 不写入明文密码 / 不写入完整 token
 *   - 仅写 actor / eventType / payload(可枚举原因) / ip
 */
import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";

export type PasswordAuditEventType =
  | "USER_CHANGE_PASSWORD"
  | "ADMIN_RESET_PASSWORD"
  | "PASSWORD_CHANGE_REJECTED";

export type RejectReason =
  | "OLD_MISMATCH"
  | "WEAK"
  | "SAME_AS_OLD"
  | "CONFIRM_MISMATCH"
  | "RATE_LIMIT"
  | "USER_DISABLED"
  | "USER_NOT_FOUND";

export interface WritePasswordAuditArgs {
  userId: number;
  eventType: PasswordAuditEventType;
  actor: string;
  payload?: Record<string, unknown>;
  ip?: string | null;
  /** 传入 prisma 事务 client，与同事务主写入一起提交 */
  tx?: Prisma.TransactionClient;
}

export async function writePasswordAudit(args: WritePasswordAuditArgs): Promise<void> {
  const client = (args.tx ?? prisma) as typeof prisma;
  await client.passwordAuditLog.create({
    data: {
      userId: args.userId,
      eventType: args.eventType,
      actor: args.actor,
      payload: (args.payload ?? null) as Prisma.InputJsonValue,
      ip: args.ip ?? null,
    },
  });
}

/** 取客户端 IP：优先 x-forwarded-for（多代理首项），其次 x-real-ip */
export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = c.req.header("x-real-ip");
  return xri?.trim() || null;
}
