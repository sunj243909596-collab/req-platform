import { prisma } from "../lib/prisma";


// ── Types ──

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  groupId: number;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export interface UpsertStatusInput {
  id?: number;          // update existing if present
  name: string;
  sortOrder?: number;
  isStart?: boolean;
  isEnd?: boolean;
  color?: string;
}

export interface UpsertTransitionInput {
  fromStatusId: number;
  toStatusId: number;
}

// ── Workflow CRUD ──

export async function listWorkflows(groupId?: number) {
  return prisma.workflowDefinition.findMany({
    where: groupId ? { groupId } : undefined,
    include: {
      statuses: true,
      transitions: true,
      _count: { select: { statuses: true, transitions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getWorkflow(id: number) {
  return prisma.workflowDefinition.findUnique({
    where: { id },
    include: {
      statuses: { orderBy: { sortOrder: "asc" } },
      transitions: true,
    },
  });
}

export async function createWorkflow(input: CreateWorkflowInput) {
  const wf = await prisma.workflowDefinition.create({
    data: {
      name: input.name,
      description: input.description,
      groupId: input.groupId,
    },
  });
  // Create default statuses
  const defaults = ["待评审", "评审中", "设计中", "开发中", "测试中", "已完成"];
  const createdStatuses: { id: number; name: string }[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const st = await prisma.workflowStatus.create({
      data: {
        workflowId: wf.id,
        name: defaults[i],
        sortOrder: i,
        isStart: i === 0,
        isEnd: i === defaults.length - 1,
      },
    });
    createdStatuses.push(st);
  }

  // Create default sequential transitions
  for (let i = 0; i < createdStatuses.length - 1; i++) {
    await prisma.workflowTransition.create({
      data: {
        workflowId: wf.id,
        fromStatusId: createdStatuses[i].id,
        toStatusId: createdStatuses[i + 1].id,
      },
    });
  }

  return getWorkflow(wf.id);
}

export async function updateWorkflow(id: number, input: UpdateWorkflowInput) {
  await prisma.workflowDefinition.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    },
  });
  return getWorkflow(id);
}

export async function deleteWorkflow(id: number) {
  // Cascade deletes because onDelete: Cascade is set
  await prisma.workflowDefinition.delete({ where: { id } });
}

// ── Status Management ──

export async function updateStatuses(workflowId: number, statuses: UpsertStatusInput[]) {
  // 失效 statusColor 缓存(让 dashboard / 列表下次拉取读到最新色)
  try {
    const { invalidateStatusColorCache } = await import("../utils/serialize");
    invalidateStatusColorCache();
  } catch { /* 缓存模块未加载也无所谓 */ }
  // Get current statuses
  const current = await prisma.workflowStatus.findMany({ where: { workflowId } });
  const currentIds = new Set(current.map(s => s.id));

  const upsertedIds: number[] = [];

  for (const st of statuses) {
    if (st.id && currentIds.has(st.id)) {
      await prisma.workflowStatus.update({
        where: { id: st.id },
        data: {
          name: st.name,
          sortOrder: st.sortOrder ?? 0,
          isStart: st.isStart ?? false,
          isEnd: st.isEnd ?? false,
          color: st.color,
        },
      });
      upsertedIds.push(st.id);
    } else {
      const created = await prisma.workflowStatus.create({
        data: {
          workflowId,
          name: st.name,
          sortOrder: st.sortOrder ?? 0,
          isStart: st.isStart ?? false,
          isEnd: st.isEnd ?? false,
          color: st.color,
        },
      });
      upsertedIds.push(created.id);
    }
  }

  // Delete removed statuses
  const removedIds = [...currentIds].filter(id => !upsertedIds.includes(id));
  for (const id of removedIds) {
    await prisma.workflowStatus.delete({ where: { id } });
  }

  return getWorkflow(workflowId);
}

// ── Transition Management ──

export async function updateTransitions(
  workflowId: number,
  transitions: UpsertTransitionInput[]
) {
  // Delete all existing transitions for this workflow
  await prisma.workflowTransition.deleteMany({ where: { workflowId } });

  // Create new transitions
  for (const t of transitions) {
    await prisma.workflowTransition.create({
      data: {
        workflowId,
        fromStatusId: t.fromStatusId,
        toStatusId: t.toStatusId,
      },
    });
  }

  return getWorkflow(workflowId);
}

// ── Compatibility: getTransitions for a specific workflow ──

export async function getWorkflowTransitions(workflowId: number) {
  const wf = await getWorkflow(workflowId);
  if (!wf) return [];

  return wf.transitions.map(t => ({
    from: wf.statuses.find(s => s.id === t.fromStatusId)?.name ?? "",
    to: wf.statuses.find(s => s.id === t.toStatusId)?.name ?? "",
  }));
}

/**
 * Check if a transition is allowed for a requirement.
 * Used by requirement status change logic.
 */
export async function isTransitionAllowed(
  groupId: number,
  fromStatus: string,
  toStatus: string
): Promise<boolean> {
  const workflows = await prisma.workflowDefinition.findMany({
    where: { groupId, enabled: true },
    include: {
      statuses: true,
      transitions: true,
    },
  });

  // If no workflow defined, allow all transitions
  if (workflows.length === 0) return true;

  for (const wf of workflows) {
    const fromSt = wf.statuses.find(s => s.name === fromStatus);
    const toSt = wf.statuses.find(s => s.name === toStatus);
    if (!fromSt || !toSt) continue;

    const transition = wf.transitions.find(t => t.fromStatusId === fromSt.id && t.toStatusId === toSt.id);
    if (transition) return true;
  }

  return false;
}

/**
 * Get allowed next statuses for a requirement.
 * Used by StatusChangeDialog to show valid options.
 */
export async function getAllowedNextStatuses(
  groupId: number,
  currentStatus: string
): Promise<string[]> {
  const workflows = await prisma.workflowDefinition.findMany({
    where: { groupId, enabled: true },
    include: {
      statuses: true,
      transitions: true,
    },
  });

  if (workflows.length === 0) return []; // No workflow means no restriction

  const allowed = new Set<string>();
  for (const wf of workflows) {
    const fromSt = wf.statuses.find(s => s.name === currentStatus);
    if (!fromSt) continue;

    for (const t of wf.transitions) {
      if (t.fromStatusId === fromSt.id) {
        const toSt = wf.statuses.find(s => s.id === t.toStatusId);
        if (toSt) allowed.add(toSt.name);
      }
    }
  }

  return [...allowed];
}
