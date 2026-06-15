// 权限组 (PermissionGroup) 业务服务
// 仿 role.service.ts 风格：显式 DTO、isSystem 保护、sortOrder 自增、删除前检查
import type { PermissionGroup, Permission, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { invalidatePermissionCache } from "./permission-cache.service";

// ============== DTO 类型 ==============

export type PgSummary = {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  bindRole: string | null;
  bindGroupName: string | null;
  enabled: boolean;
  isSystem: boolean;
  sortOrder: number;
  permissionCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PgDetail = PgSummary & {
  permissions: { id: number; code: string; displayName: string; action: string }[];
  members: { id: number; username: string; displayName: string }[];
};

// ============== Seed ==============

const DEFAULT_PG_SEEDS: {
  name: string;
  displayName: string;
  description: string;
  bindRole?: string;
  bindGroupName?: string;
  /** 关联的 permission code 子集（启动后立即补 PermissionGroupItem 关联）*/
  permissionCodes: string[];
  sortOrder: number;
}[] = [
  {
    name: "pg_viewer",
    displayName: "只读访客",
    description: "MEMBER 默认绑定的只读权限集合（看页面/菜单，不能写）",
    bindRole: "MEMBER",
    sortOrder: 10,
    // 所有 PAGE 类的 view
    permissionCodes: [
      "page:dashboard", "page:requirements", "page:releases", "page:ai",
      "page:trash", "page:manuals", "page:help", "page:team", "page:settings",
      "menu:dashboard", "menu:requirements", "menu:releases", "menu:ai",
      "menu:trash", "menu:manuals", "menu:help", "menu:team", "menu:settings",
    ],
  },
  {
    name: "pg_group_lead",
    displayName: "组长权限",
    description: "GROUP_LEAD 默认绑定：viewer + 需求/发版创建编辑",
    bindRole: "GROUP_LEAD",
    sortOrder: 20,
    permissionCodes: [
      // 继承 viewer 全部
      "page:dashboard", "page:requirements", "page:releases", "page:ai",
      "page:trash", "page:manuals", "page:help", "page:team", "page:settings",
      "menu:dashboard", "menu:requirements", "menu:releases", "menu:ai",
      "menu:trash", "menu:manuals", "menu:help", "menu:team", "menu:settings",
      // 额外写操作
      "btn:requirement:create", "btn:requirement:edit", "btn:requirement:export", "btn:requirement:import",
      "btn:requirement:trash-restore",
      "btn:release:create", "btn:release:edit",
      "btn:user:create", "btn:user:edit",
      "btn:ai:chat",
    ],
  },
  {
    name: "pg_admin_ops",
    displayName: "高危操作（导入/导出/删除）",
    description: "需要 admin 显式分配给特定用户，不绑定 role",
    sortOrder: 30,
    permissionCodes: [
      "btn:requirement:delete",
      "btn:requirement:trash-delete",
      "btn:release:delete",
      "btn:user:delete",
      "btn:role:create", "btn:role:edit", "btn:role:delete",
    ],
  },
];

/** 启动时 seed 默认 PG。幂等：已存在则不重建关联（避免覆盖用户改动）。*/
export async function seedDefaultPermissionGroups(): Promise<{ groups: number; bindings: number }> {
  let gCount = 0, bCount = 0;
  for (const s of DEFAULT_PG_SEEDS) {
    // upsert PG
    const pg = await prisma.permissionGroup.upsert({
      where: { name: s.name },
      create: {
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        bindRole: s.bindRole,
        bindGroupName: s.bindGroupName,
        enabled: true,
        sortOrder: s.sortOrder,
        isSystem: true,
      },
      update: {
        displayName: s.displayName,
        description: s.description,
        bindRole: s.bindRole,
        bindGroupName: s.bindGroupName,
        sortOrder: s.sortOrder,
        // 不改 isSystem — 保留种子意图
      },
    });
    gCount++;

    // 检查是否已有 binding（避免覆盖用户后续的手动调整）
    const existingBindings = await prisma.permissionGroupItem.count({
      where: { permissionGroupId: pg.id },
    });
    if (existingBindings === 0) {
      // 首次 seed：插入所有 permission 关联
      for (const code of s.permissionCodes) {
        const perm = await prisma.permission.findUnique({ where: { code } });
        if (!perm) continue;  // 容错：resource 还没 seed（启动顺序问题）
        await prisma.permissionGroupItem.create({
          data: { permissionGroupId: pg.id, permissionId: perm.id },
        });
        bCount++;
      }
    }
  }
  return { groups: gCount, bindings: bCount };
}

// ============== 列表 / 详情 ==============

/** 列出所有 PG（带 permission 数 / member 数）。*/
export async function listPermissionGroups(): Promise<PgSummary[]> {
  const groups = await prisma.permissionGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { items: true, members: true } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    displayName: g.displayName,
    description: g.description,
    bindRole: g.bindRole,
    bindGroupName: g.bindGroupName,
    enabled: g.enabled,
    isSystem: g.isSystem,
    sortOrder: g.sortOrder,
    permissionCount: g._count.items,
    memberCount: g._count.members,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  }));
}

/** 取 PG 详情（含 permission / member 列表）。*/
export async function getPermissionGroup(id: number): Promise<PgDetail | null> {
  const g = await prisma.permissionGroup.findUnique({
    where: { id },
    include: {
      items: { include: { permission: true } },
      members: { include: { user: true } },
    },
  });
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    displayName: g.displayName,
    description: g.description,
    bindRole: g.bindRole,
    bindGroupName: g.bindGroupName,
    enabled: g.enabled,
    isSystem: g.isSystem,
    sortOrder: g.sortOrder,
    permissionCount: g.items.length,
    memberCount: g.members.length,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    permissions: g.items.map((it) => ({
      id: it.permission.id,
      code: it.permission.code,
      displayName: it.permission.displayName,
      action: it.permission.action,
    })),
    members: g.members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
    })),
  };
}

// ============== CRUD ==============

export async function createPermissionGroup(input: {
  name: string;
  displayName: string;
  description?: string;
  bindRole?: string;
  bindGroupName?: string;
  permissionIds?: number[];
  memberIds?: number[];
}) {
  if (!input.name.trim()) throw new Error("权限组名称不能为空");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(input.name)) {
    throw new Error("权限组名称仅允许 1-32 字符字母/数字/下划线/连字符");
  }
  if (!input.displayName.trim()) throw new Error("权限组显示名不能为空");

  const existing = await prisma.permissionGroup.findUnique({ where: { name: input.name } });
  if (existing) throw new Error("权限组名称已存在");

  const maxSort = await prisma.permissionGroup.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const pg = await prisma.permissionGroup.create({
    data: {
      name: input.name.trim(),
      displayName: input.displayName.trim(),
      description: input.description?.trim() || null,
      bindRole: input.bindRole || null,
      bindGroupName: input.bindGroupName || null,
      enabled: true,
      isSystem: false,
      sortOrder: (maxSort?.sortOrder ?? 0) + 1,
    },
  });

  if (input.permissionIds?.length) {
    await prisma.permissionGroupItem.createMany({
      data: input.permissionIds.map((pid) => ({ permissionGroupId: pg.id, permissionId: pid })),
    });
  }
  if (input.memberIds?.length) {
    await prisma.userPermissionGroup.createMany({
      data: input.memberIds.map((uid) => ({ permissionGroupId: pg.id, userId: uid })),
    });
  }

  // 改了 PG 关联 → 清缓存（让被分配的用户下次请求重新解析）
  if (input.memberIds?.length) invalidatePermissionCache();

  return pg;
}

export async function updatePermissionGroup(
  id: number,
  input: {
    displayName?: string;
    description?: string;
    bindRole?: string | null;
    bindGroupName?: string | null;
    enabled?: boolean;
    sortOrder?: number;
  }
) {
  const pg = await prisma.permissionGroup.findUnique({ where: { id } });
  if (!pg) throw new Error("权限组不存在");

  return prisma.permissionGroup.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined && { displayName: input.displayName.trim() }),
      ...(input.description !== undefined && { description: input.description?.trim() || null }),
      ...(input.bindRole !== undefined && { bindRole: input.bindRole || null }),
      ...(input.bindGroupName !== undefined && { bindGroupName: input.bindGroupName || null }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });
}

/** 删除 PG：系统内置不可删；有成员时先解绑再删（避免 dangling）。*/
export async function deletePermissionGroup(id: number) {
  const pg = await prisma.permissionGroup.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  });
  if (!pg) throw new Error("权限组不存在");
  if (pg.isSystem) throw new Error("系统内置权限组不可删除");

  if (pg._count.members > 0) {
    throw new Error("该权限组仍有 " + pg._count.members + " 名成员，请先解绑用户");
  }

  // 先解绑所有 permission（FK CASCADE 也会做，但显式更清晰）
  await prisma.permissionGroupItem.deleteMany({ where: { permissionGroupId: id } });
  await prisma.permissionGroup.delete({ where: { id } });
}

/** 整组覆盖 PG 的 permission 列表（tx）。*/
export async function setGroupPermissions(pgId: number, permissionIds: number[]) {
  const pg = await prisma.permissionGroup.findUnique({ where: { id: pgId } });
  if (!pg) throw new Error("权限组不存在");

  await prisma.$transaction(async (tx) => {
    await tx.permissionGroupItem.deleteMany({ where: { permissionGroupId: pgId } });
    if (permissionIds.length) {
      await tx.permissionGroupItem.createMany({
        data: permissionIds.map((pid) => ({ permissionGroupId: pgId, permissionId: pid })),
      });
    }
  });

  // 改了 PG 关联 → 清所有缓存（让所有受影响用户重新解析）
  invalidatePermissionCache();
}

/** 整组覆盖 PG 的成员列表（tx）。*/
export async function setGroupMembers(pgId: number, userIds: number[]) {
  const pg = await prisma.permissionGroup.findUnique({ where: { id: pgId } });
  if (!pg) throw new Error("权限组不存在");

  await prisma.$transaction(async (tx) => {
    await tx.userPermissionGroup.deleteMany({ where: { permissionGroupId: pgId } });
    if (userIds.length) {
      await tx.userPermissionGroup.createMany({
        data: userIds.map((uid) => ({ permissionGroupId: pgId, userId: uid })),
      });
    }
  });

  // 改了用户-PG 关联 → 清所有缓存
  invalidatePermissionCache();
}
