import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";


export const VALID_TYPES = ["article", "document", "link"] as const;

export async function listManuals(query: {
  category?: string;
  type?: string;
  search?: string;
}) {
  const where: Record<string, unknown> = {};

  if (query.category) {
    where.category = query.category;
  }
  if (query.type) {
    where.type = query.type;
  }
  if (query.search) {
    where.title = { contains: query.search, mode: "insensitive" };
  }

  return prisma.operationManual.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function getManual(id: number) {
  return prisma.operationManual.findUnique({ where: { id } });
}

export async function createManual(data: {
  title: string;
  content?: string;
  type: string;
  category: string;
  tags?: string[];
  externalUrl?: string;
  sortOrder?: number;
  createdBy: string;
}) {
  if (!data.title?.trim()) throw new Error("标题不能为空");
  if (!VALID_TYPES.includes(data.type as typeof VALID_TYPES[number])) {
    throw new Error(`类型无效，有效值：${VALID_TYPES.join("、")}`);
  }
  if (data.type === "link" && !data.externalUrl?.trim()) {
    throw new Error("外链类型必须填写 URL");
  }

  return prisma.operationManual.create({
    data: {
      title: data.title.trim(),
      content: data.content || null,
      type: data.type,
      category: data.category,
      tags: (data.tags || null) as unknown as Prisma.InputJsonValue,
      externalUrl: data.externalUrl || null,
      sortOrder: data.sortOrder ?? 0,
      createdBy: data.createdBy,
    },
  });
}

export async function createManualDocument(data: {
  title: string;
  category: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  createdBy: string;
}) {
  if (!data.title?.trim()) throw new Error("标题不能为空");

  return prisma.operationManual.create({
    data: {
      title: data.title.trim(),
      type: "document",
      category: data.category,
      fileName: data.fileName,
      filePath: data.filePath,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      sortOrder: 0,
      createdBy: data.createdBy,
    },
  });
}

export async function updateManual(
  id: number,
  data: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    externalUrl?: string;
    sortOrder?: number;
    updatedBy?: string;
  }
) {
  const existing = await prisma.operationManual.findUnique({ where: { id } });
  if (!existing) throw new Error("操作手册不存在");

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.content !== undefined) updateData.content = data.content;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.tags !== undefined) updateData.tags = data.tags as unknown as Prisma.InputJsonValue;
  if (data.externalUrl !== undefined) updateData.externalUrl = data.externalUrl;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.updatedBy) updateData.updatedBy = data.updatedBy;

  return prisma.operationManual.update({ where: { id }, data: updateData });
}

export async function deleteManual(id: number) {
  const existing = await prisma.operationManual.findUnique({ where: { id } });
  if (!existing) throw new Error("操作手册不存在");
  await prisma.operationManual.delete({ where: { id } });
  return existing;
}
