// 权限解析 — UNION 三路：用户显式加入 + bindRole + bindGroupName
// ADMIN 角色不查表 — 调用方应短路（isAdmin 标志）
import { prisma } from "../lib/prisma";

/**
 * 解析用户的最终权限 code 集合。
 * 三路 UNION：
 *  1. UserPermissionGroup（用户显式加入的 PG）
 *  2. bindRole == role 的 PG
 *  3. bindGroupName == groupName 的 PG（仅当 groupName 非 null）
 */
export async function resolveUserPermissions(
  userId: number,
  role: string,
  groupName: string | null
): Promise<Set<string>> {
  // 一次 SQL 取出所有相关 PG 的 permission.code
  // 用 OR 把三路条件合一
  const rows = await prisma.permissionGroupItem.findMany({
    where: {
      permissionGroup: {
        enabled: true,
        OR: [
          { members: { some: { userId } } },                     // 1. 用户显式加入
          ...(role ? [{ bindRole: role }] : []),                 // 2. 绑定角色
          ...(groupName ? [{ bindGroupName: groupName }] : []),  // 3. 绑定组
        ],
      },
    },
    select: { permission: { select: { code: true } } },
  });

  const set = new Set<string>();
  for (const r of rows) set.add(r.permission.code);
  return set;
}
