export interface AuthContext {
  userId: number;
  username: string;
  role: string;
  groupName: string | null;
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
