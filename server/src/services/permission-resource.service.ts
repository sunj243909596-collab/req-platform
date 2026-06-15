// 资源 + 权限点注册服务
// 启动时 seed 系统内置资源（页面/菜单项/按钮），并把每个资源登记为 1 个 Permission。
// 1:1 模型（v1）：每个 PermissionResource 对应一个 Permission（resource.code === permission.code）。
// 后续如需 1:N（如 view + edit 两个 action 在同一 resource），改这里 seed 即可。

import type { PermissionResource, Permission } from "@prisma/client";
import { prisma } from "../lib/prisma";

/** 资源/权限点 seed 清单。
 * type: 'MENU' | 'PAGE' | 'BUTTON'
 * code = permission code，前端 has(code) 直接用。
 */
type ResourceSeed = {
  code: string;
  type: "MENU" | "PAGE" | "BUTTON";
  parentCode?: string;
  displayName: string;
  path?: string;
  icon?: string;
  sortOrder?: number;
};

const RESOURCE_SEEDS: ResourceSeed[] = [
  // ───── 页面（PAGE）─────
  { code: "page:dashboard",    type: "PAGE", displayName: "工作台",   path: "/app",                  icon: "LayoutDashboard", sortOrder: 0 },
  { code: "page:requirements", type: "PAGE", displayName: "需求管理", path: "/app/requirements",     icon: "FileText",         sortOrder: 10 },
  { code: "page:releases",     type: "PAGE", displayName: "发版计划", path: "/app/releases",         icon: "Rocket",           sortOrder: 20 },
  { code: "page:ai",           type: "PAGE", displayName: "AI 助手",  path: "/app/ai",                icon: "Bot",              sortOrder: 30 },
  { code: "page:trash",        type: "PAGE", displayName: "回收站",   path: "/app/requirements/trash", icon: "Trash2",         sortOrder: 40 },
  { code: "page:manuals",      type: "PAGE", displayName: "操作手册", path: "/app/manuals",           icon: "BookOpen",         sortOrder: 50 },
  { code: "page:help",         type: "PAGE", displayName: "帮助中心", path: "/app/help",              icon: "BookText",         sortOrder: 60 },
  { code: "page:team",         type: "PAGE", displayName: "团队管理", path: "/app/team",              icon: "Users",            sortOrder: 70 },
  { code: "page:settings",     type: "PAGE", displayName: "系统设置", path: "/app/settings",          icon: "Settings",         sortOrder: 80 },

  // ───── 菜单项（MENU）— 与上面的 PAGE 共享 permission code（但分开登记方便管理 UI 区分）─────
  { code: "menu:dashboard",    type: "MENU", displayName: "工作台",   parentCode: "page:dashboard",    sortOrder: 0 },
  { code: "menu:requirements", type: "MENU", displayName: "需求管理", parentCode: "page:requirements", sortOrder: 10 },
  { code: "menu:releases",     type: "MENU", displayName: "发版计划", parentCode: "page:releases",     sortOrder: 20 },
  { code: "menu:ai",           type: "MENU", displayName: "AI 助手",  parentCode: "page:ai",           sortOrder: 30 },
  { code: "menu:trash",        type: "MENU", displayName: "回收站",   parentCode: "page:trash",        sortOrder: 40 },
  { code: "menu:manuals",      type: "MENU", displayName: "操作手册", parentCode: "page:manuals",      sortOrder: 50 },
  { code: "menu:help",         type: "MENU", displayName: "帮助中心", parentCode: "page:help",         sortOrder: 60 },
  { code: "menu:team",         type: "MENU", displayName: "团队管理", parentCode: "page:team",         sortOrder: 70 },
  { code: "menu:settings",     type: "MENU", displayName: "系统设置", parentCode: "page:settings",     sortOrder: 80 },

  // ───── 按钮（BUTTON）─────
  // 需求
  { code: "btn:requirement:create",  type: "BUTTON", parentCode: "page:requirements", displayName: "新建需求",   sortOrder: 0 },
  { code: "btn:requirement:edit",    type: "BUTTON", parentCode: "page:requirements", displayName: "编辑需求",   sortOrder: 1 },
  { code: "btn:requirement:delete",  type: "BUTTON", parentCode: "page:requirements", displayName: "删除需求",   sortOrder: 2 },
  { code: "btn:requirement:export",  type: "BUTTON", parentCode: "page:requirements", displayName: "导出需求",   sortOrder: 3 },
  { code: "btn:requirement:import",  type: "BUTTON", parentCode: "page:requirements", displayName: "导入需求",   sortOrder: 4 },
  { code: "btn:requirement:trash-delete",  type: "BUTTON", parentCode: "page:trash",  displayName: "永久删除需求", sortOrder: 0 },
  { code: "btn:requirement:trash-restore", type: "BUTTON", parentCode: "page:trash",  displayName: "还原需求",     sortOrder: 1 },

  // 发版
  { code: "btn:release:create", type: "BUTTON", parentCode: "page:releases", displayName: "新建发版", sortOrder: 0 },
  { code: "btn:release:edit",   type: "BUTTON", parentCode: "page:releases", displayName: "编辑发版", sortOrder: 1 },
  { code: "btn:release:delete", type: "BUTTON", parentCode: "page:releases", displayName: "删除发版", sortOrder: 2 },

  // 团队
  { code: "btn:user:create", type: "BUTTON", parentCode: "page:team", displayName: "新建用户", sortOrder: 0 },
  { code: "btn:user:edit",   type: "BUTTON", parentCode: "page:team", displayName: "编辑用户", sortOrder: 1 },
  { code: "btn:user:delete", type: "BUTTON", parentCode: "page:team", displayName: "删除用户", sortOrder: 2 },
  { code: "btn:role:create", type: "BUTTON", parentCode: "page:team", displayName: "新建角色", sortOrder: 3 },
  { code: "btn:role:edit",   type: "BUTTON", parentCode: "page:team", displayName: "编辑角色", sortOrder: 4 },
  { code: "btn:role:delete", type: "BUTTON", parentCode: "page:team", displayName: "删除角色", sortOrder: 5 },

  // 权限管理（页内按钮，挂 page:settings 父级）
  { code: "btn:permission:create", type: "BUTTON", parentCode: "page:settings", displayName: "新建权限组", sortOrder: 0 },
  { code: "btn:permission:edit",   type: "BUTTON", parentCode: "page:settings", displayName: "编辑权限组", sortOrder: 1 },
  { code: "btn:permission:delete", type: "BUTTON", parentCode: "page:settings", displayName: "删除权限组", sortOrder: 2 },

  // AI
  { code: "btn:ai:chat", type: "BUTTON", parentCode: "page:ai", displayName: "发起 AI 对话", sortOrder: 0 },

  // 操作手册
  { code: "btn:manual:create", type: "BUTTON", parentCode: "page:manuals", displayName: "新建操作手册", sortOrder: 0 },
  { code: "btn:manual:edit",   type: "BUTTON", parentCode: "page:manuals", displayName: "编辑操作手册", sortOrder: 1 },
  { code: "btn:manual:delete", type: "BUTTON", parentCode: "page:manuals", displayName: "删除操作手册", sortOrder: 2 },
];

/** 启动时 seed — 幂等（upsert by code）。已存在则只更新 displayName/sortOrder。*/
export async function seedDefaultPermissionResources(): Promise<{ resources: number; permissions: number }> {
  let rCount = 0, pCount = 0;
  for (const r of RESOURCE_SEEDS) {
    // upsert resource
    const resource = await prisma.permissionResource.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        type: r.type,
        parentCode: r.parentCode,
        displayName: r.displayName,
        path: r.path,
        icon: r.icon,
        sortOrder: r.sortOrder ?? 0,
        enabled: true,
      },
      update: {
        displayName: r.displayName,
        path: r.path,
        icon: r.icon,
        parentCode: r.parentCode,
        sortOrder: r.sortOrder ?? 0,
      },
    });
    rCount++;

    // upsert 对应 permission（1:1 — resource.code === permission.code）
    await prisma.permission.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        resourceCode: resource.code,
        action: r.type === "BUTTON" ? "execute" : "view",
        displayName: r.displayName,
        description: `${r.type} 权限`,
      },
      update: {
        displayName: r.displayName,
        resourceCode: resource.code,
        action: r.type === "BUTTON" ? "execute" : "view",
      },
    });
    pCount++;
  }
  return { resources: rCount, permissions: pCount };
}

/** 列出所有资源（按 type + sortOrder）。管理 UI 用。*/
export async function listAllResources(): Promise<PermissionResource[]> {
  return prisma.permissionResource.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
}

/** 列出所有权限点（带 resource 关联）。管理 UI / 调试用。*/
export async function listAllPermissions(): Promise<(Permission & { resource: PermissionResource | null })[]> {
  return prisma.permission.findMany({
    orderBy: { code: "asc" },
    include: { resource: true },
  });
}

/** 按 code 取单个 resource。*/
export async function getResourceByCode(code: string): Promise<PermissionResource | null> {
  return prisma.permissionResource.findUnique({ where: { code } });
}
