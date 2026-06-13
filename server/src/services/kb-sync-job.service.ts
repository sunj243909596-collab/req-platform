// 知识库异步同步任务（内存队列，单进程有效）
import { randomUUID } from "crypto";
import type { AgentDataStore } from "./agent.service";
import { dispatchKbSync, type KbSyncMeta } from "./agent.service";

export type SyncJobStatus = "pending" | "running" | "completed" | "failed";

export interface KbSyncJob {
  id: string;
  kbId: number;
  status: SyncJobStatus;
  progress: number;
  message: string;
  documents?: number;
  chunks?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

const jobs = new Map<string, KbSyncJob>();

export function getSyncJob(jobId: string): KbSyncJob | undefined {
  return jobs.get(jobId);
}

export function listSyncJobsForKb(kbId: number): KbSyncJob[] {
  return [...jobs.values()].filter((j) => j.kbId === kbId);
}

/** 启动后台同步，立即返回 jobId */
export function startKbSyncJob(
  kbId: number,
  kb: KbSyncMeta,
  store: AgentDataStore
): string {
  const id = randomUUID();
  const job: KbSyncJob = {
    id,
    kbId,
    status: "pending",
    progress: 0,
    message: "等待开始",
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);

  setImmediate(async () => {
    const j = jobs.get(id);
    if (!j) return;
    j.status = "running";
    j.message = "正在扫描与索引…";
    j.progress = 5;

    try {
      const result = await dispatchKbSync(kbId, kb, store, (p) => {
        const cur = jobs.get(id);
        if (!cur) return;
        const pct = p.total > 0 ? Math.round((p.done / p.total) * 90) + 5 : 10;
        cur.progress = Math.min(95, pct);
        cur.message = p.file ? `处理: ${p.file}` : "索引中…";
      });
      j.status = "completed";
      j.progress = 100;
      j.message = "同步完成";
      j.documents = result.documents;
      j.chunks = result.chunks;
      j.finishedAt = new Date().toISOString();
    } catch (err) {
      j.status = "failed";
      j.progress = 100;
      j.error = (err as Error).message;
      j.message = "同步失败";
      j.finishedAt = new Date().toISOString();
    }
  });

  return id;
}

/** 清理 24h 前的已完成任务 */
export function pruneOldJobs(maxAgeMs = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.status === "running" || j.status === "pending") continue;
    const t = new Date(j.finishedAt || j.startedAt).getTime();
    if (now - t > maxAgeMs) jobs.delete(id);
  }
}
