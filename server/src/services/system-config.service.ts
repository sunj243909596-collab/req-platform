// System Config Service — manage platform-wide config parameters

import { prisma } from "../lib/prisma";


const DEFAULT_MODULES: string[] = [
  "入库管理", "出库管理", "库存管理", "GSP管理",
  "基础数据", "报表统计", "系统管理", "巴枪端",
];

export interface SystemConfigItem {
  id: number;
  configKey: string;
  configValue: unknown;
  description: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get a config value by key.
 */
export async function getConfig<T = unknown>(key: string): Promise<T | null> {
  const config = await prisma.systemConfig.findUnique({ where: { configKey: key } });
  if (!config) return null;
  return config.configValue as T;
}

/**
 * Get module options. Falls back to defaults if not configured.
 */
export async function getModuleOptions(): Promise<string[]> {
  const value = await getConfig<string[]>("module_options");
  if (!value || !Array.isArray(value) || value.length === 0) {
    return DEFAULT_MODULES;
  }
  return value;
}

/**
 * Set a config value. Creates or updates.
 */
export async function setConfig(key: string, value: unknown, updatedBy?: string): Promise<SystemConfigItem> {
  const data = {
    configKey: key,
    configValue: value as any,
    updatedBy: updatedBy ?? null,
  };

  const existing = await prisma.systemConfig.findUnique({ where: { configKey: key } });
  if (existing) {
    const updated = await prisma.systemConfig.update({
      where: { configKey: key },
      data: { configValue: value as any, updatedBy: updatedBy ?? null },
    });
    return updated;
  }

  const created = await prisma.systemConfig.create({ data });
  return created;
}

/**
 * Reset module options to defaults.
 */
export async function resetModuleOptions(): Promise<string[]> {
  await setConfig("module_options", DEFAULT_MODULES);
  return DEFAULT_MODULES;
}
