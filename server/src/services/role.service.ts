import { prisma } from "../lib/prisma";


export type RoleData = {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  userCount: number;
};

const DEFAULT_ROLES = [
  { name: "ADMIN", displayName: "管理员", description: "系统管理员，拥有全部权限", isSystem: true, sortOrder: 0 },
  { name: "GROUP_LEAD", displayName: "组长", description: "组管理员，管理组内需求和成员", isSystem: true, sortOrder: 1 },
  { name: "MEMBER", displayName: "成员", description: "普通成员，参与需求和测试", isSystem: true, sortOrder: 2 },
];

/** Seed default system roles on startup */
export async function seedDefaultRoles() {
  for (const r of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { name: r.name },
      create: r,
      update: { displayName: r.displayName, description: r.description },
    });
  }
}

/** List all roles with user counts */
export async function listRoles(): Promise<RoleData[]> {
  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return roles.map(r => ({
    id: r.id,
    name: r.name,
    displayName: r.displayName,
    description: r.description,
    isSystem: r.isSystem,
    sortOrder: r.sortOrder,
    userCount: r._count.users,
  }));
}

/** Create a custom role */
export async function createRole(input: { name: string; displayName: string; description?: string }) {
  const maxSort = await prisma.role.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return prisma.role.create({
    data: {
      name: input.name.trim(),
      displayName: input.displayName.trim(),
      description: input.description?.trim(),
      isSystem: false,
      sortOrder: (maxSort?.sortOrder ?? 0) + 1,
    },
  });
}

/** Update role name/display name (system roles can only update displayName) */
export async function updateRole(id: number, input: { displayName?: string; description?: string }) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new Error("角色不存在");
  return prisma.role.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined && { displayName: input.displayName.trim() }),
      ...(input.description !== undefined && { description: input.description?.trim() }),
    },
  });
}

/** Delete a role (system roles cannot be deleted). Reassign users to default role. */
export async function deleteRole(id: number) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new Error("角色不存在");
  if (role.isSystem) throw new Error("系统内置角色不可删除");

  // Reassign users to MEMBER
  const memberRole = await prisma.role.findUnique({ where: { name: "MEMBER" } });
  if (memberRole) {
    await prisma.user.updateMany({
      where: { roleId: id },
      data: { roleId: memberRole.id, role: memberRole.name },
    });
  }

  await prisma.role.delete({ where: { id } });
}

/** Assign a role to a user */
export async function assignUserRole(userId: number, roleId: number) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("角色不存在");
  const user = await prisma.user.update({
    where: { id: userId },
    data: { roleId, role: role.name },
    include: { roleRef: true },
  });
  return user;
}
