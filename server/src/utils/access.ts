export interface AuthContext {
  userId: number;
  username: string;
  role: string;
  groupName: string | null;
  /** 用户最终 permission code 集合（admin 包含 "*"），由 authMiddleware 注入。 */
  permissions?: Set<string>;
  /** 是否为 ADMIN 隐式超管（短路权限检查） */
  isAdmin?: boolean;
}

/** Build Prisma where clause for group-scoped data access */
export function groupFilter(ctx: AuthContext): { groupName?: string } {
  if (ctx.role === "ADMIN") return {};
  if (ctx.groupName) return { groupName: ctx.groupName };
  return { groupName: "__NO_GROUP__" };
}

export function canEditRequirement(
  ctx: AuthContext,
  req: { assignee: string | null; reporter: string | null; groupName: string }
): boolean {
  if (ctx.role === "ADMIN") return true;
  if (ctx.role === "GROUP_LEAD" && ctx.groupName === req.groupName) return true;
  if (req.assignee === ctx.username || req.reporter === ctx.username) return true;
  return false;
}

export function canDeleteRequirement(
  ctx: AuthContext,
  req: { reporter: string | null; groupName: string }
): boolean {
  if (ctx.role === "ADMIN") return true;
  if (req.reporter === ctx.username) return true;
  return false;
}
