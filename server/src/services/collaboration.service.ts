import { prisma } from "../lib/prisma";


// ================= SubTask =================

export async function listSubTasks(reqId: number) {
  const tasks = await prisma.subTask.findMany({
    where: { reqId },
    orderBy: { sortOrder: "asc" },
  });
  return tasks.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }));
}

export async function createSubTask(reqId: number, data: { title: string; description?: string; assignee?: string; status?: string }) {
  const last = await prisma.subTask.findFirst({
    where: { reqId },
    orderBy: { sortOrder: "desc" },
    select: { taskNo: true },
  });
  const nextNum = last ? parseInt(last.taskNo.split("-")[1] || "0") + 1 : 1;
  const req = await prisma.requirement.findUnique({ where: { id: reqId } });
  const taskNo = `${req?.reqNo || "REQ"}-T${String(nextNum).padStart(2, "0")}`;

  const maxSort = await prisma.subTask.findFirst({
    where: { reqId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return prisma.subTask.create({
    data: {
      reqId,
      taskNo,
      title: data.title,
      description: data.description,
      assignee: data.assignee,
      status: data.status || "待开发",
      sortOrder: maxSort ? maxSort.sortOrder + 1 : 0,
    },
  });
}

export async function updateSubTask(id: number, data: { title?: string; description?: string; assignee?: string; status?: string; sortOrder?: number }) {
  return prisma.subTask.update({ where: { id }, data });
}

export async function deleteSubTask(id: number) {
  return prisma.subTask.delete({ where: { id } });
}

// ================= Comment =================

export async function listComments(reqId: number) {
  const comments = await prisma.comment.findMany({
    where: { reqId },
    orderBy: { createdAt: "asc" },
  });
  return comments.map(c => ({ ...c, createdAt: c.createdAt.toISOString() }));
}

export async function createComment(reqId: number, author: string, content: string) {
  if (!content.trim()) throw new Error("评论内容不能为空");
  const isMention = content.includes("@");
  return prisma.comment.create({
    data: { reqId, author, content: content.trim(), isMention },
  });
}

export async function deleteComment(id: number) {
  return prisma.comment.delete({ where: { id } });
}

// ================= ReqRelation =================

export interface CreateRelationInput {
  fromReqId: number;
  toReqId: number;
  relType: string;
}

export async function listRelations(reqId: number) {
  const [from, to] = await Promise.all([
    prisma.reqRelation.findMany({
      where: { fromReqId: reqId },
      include: { toReq: { select: { id: true, reqNo: true, title: true, status: true } } },
    }),
    prisma.reqRelation.findMany({
      where: { toReqId: reqId },
      include: { fromReq: { select: { id: true, reqNo: true, title: true, status: true } } },
    }),
  ]);

  return {
    outgoing: from.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    incoming: to.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

export async function createRelation(input: CreateRelationInput) {
  if (input.fromReqId === input.toReqId) throw new Error("不能关联自己");

  const existing = await prisma.reqRelation.findFirst({
    where: {
      fromReqId: input.fromReqId,
      toReqId: input.toReqId,
      relType: input.relType,
    },
  });
  if (existing) throw new Error("关联关系已存在");

  return prisma.reqRelation.create({ data: input });
}

export async function deleteRelation(id: number) {
  return prisma.reqRelation.delete({ where: { id } });
}

export async function searchRequirements(query: string, limit = 10) {
  const reqs = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { reqNo: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, reqNo: true, title: true, status: true },
    take: limit,
  });
  return reqs;
}
