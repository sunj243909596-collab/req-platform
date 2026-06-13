import { prisma } from "../lib/prisma";
import type { AuthContext } from "../utils/access";


export async function listGroups(_ctx: AuthContext) {
  const groups = await prisma.group.findMany({ orderBy: { groupName: "asc" } });
  return groups.map(g => ({
    id: g.id,
    groupName: g.groupName,
    description: g.description,
    createdAt: g.createdAt.toISOString(),
  }));
}

export async function createGroup(data: { groupName: string; description?: string }) {
  const existing = await prisma.group.findUnique({ where: { groupName: data.groupName } });
  if (existing) throw new Error("组名已存在");

  return prisma.group.create({
    data: { groupName: data.groupName, description: data.description },
  });
}

export async function updateGroup(id: number, data: { groupName?: string; description?: string }) {
  if (data.groupName) {
    const dup = await prisma.group.findFirst({
      where: { groupName: data.groupName, NOT: { id } },
    });
    if (dup) throw new Error("组名已存在");
  }

  return prisma.group.update({ where: { id }, data });
}

export async function deleteGroup(id: number) {
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) throw new Error("组不存在");

  const userCount = await prisma.user.count({ where: { groupName: group.groupName } });
  if (userCount > 0) throw new Error("组下仍有用户，无法删除");

  await prisma.group.delete({ where: { id } });
}
