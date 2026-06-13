import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthContext } from "../utils/access";


export interface CreateTeamLearningInput {
  title: string;
  content?: string;
  category: string;
  tags?: Record<string, unknown>;
  confidence?: number;
}

export interface TeamLearningQuery {
  page?: number;
  pageSize?: number;
  category?: string;
  search?: string;
}

export async function listTeamLearnings(query: TeamLearningQuery) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (query.category) where.category = query.category;
  if (query.search) {
    where.title = { contains: query.search, mode: "insensitive" as const };
  }

  const [total, rows] = await Promise.all([
    prisma.teamLearning.count({ where }),
    prisma.teamLearning.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    data: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function createTeamLearning(ctx: AuthContext, input: CreateTeamLearningInput) {
  const item = await prisma.teamLearning.create({
    data: {
      title: input.title.trim(),
      content: input.content?.trim() || null,
      category: input.category,
      author: ctx.username,
      tags: (input.tags ?? Prisma.DbNull) as Prisma.InputJsonValue,
      confidence: input.confidence ?? 7,
    },
  });
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

export async function updateTeamLearning(id: number, input: Partial<CreateTeamLearningInput>) {
  const existing = await prisma.teamLearning.findUnique({ where: { id } });
  if (!existing) throw new Error("经验记录不存在");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.content !== undefined) data.content = input.content?.trim() || null;
  if (input.category !== undefined) data.category = input.category;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.confidence !== undefined) data.confidence = input.confidence;

  const item = await prisma.teamLearning.update({ where: { id }, data });
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

export async function deleteTeamLearning(id: number) {
  const existing = await prisma.teamLearning.findUnique({ where: { id } });
  if (!existing) throw new Error("经验记录不存在");
  await prisma.teamLearning.delete({ where: { id } });
}

export async function getLearningStats() {
  const all = await prisma.teamLearning.findMany({
    select: { category: true },
  });
  const byCategory: Record<string, number> = {};
  for (const item of all) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }
  return { total: all.length, byCategory };
}
