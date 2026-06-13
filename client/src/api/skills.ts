import { http } from './http';

export interface AiSkill {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  systemPrompt: string;
  category: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  assignments?: { taskKey: string }[];
}

export interface SkillInput {
  name: string;
  displayName: string;
  description?: string;
  systemPrompt: string;
  category?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface SkillAssignment {
  id: number;
  taskKey: string;
  skillId: number;
  enabled: boolean;
  skill?: { id: number; name: string; displayName: string };
}

const PREFIX = '/skills';

// ===================== Skills CRUD =====================

export async function listSkills(): Promise<AiSkill[]> {
  return http.get(PREFIX);
}

export async function createSkill(input: SkillInput): Promise<AiSkill> {
  return http.post(PREFIX, input);
}

export async function updateSkill(id: number, input: Partial<SkillInput>): Promise<AiSkill> {
  return http.put(`${PREFIX}/${id}`, input);
}

export async function deleteSkill(id: number): Promise<void> {
  await http.delete(`${PREFIX}/${id}`);
}

export async function toggleSkill(id: number): Promise<AiSkill> {
  return http.post(`${PREFIX}/${id}/toggle`);
}

// ===================== Assignments =====================

export async function listAssignments(): Promise<SkillAssignment[]> {
  return http.get(`${PREFIX}/assignments`);
}

export async function upsertAssignment(input: { taskKey: string; skillId: number }): Promise<SkillAssignment> {
  return http.post(`${PREFIX}/assignments`, input);
}

export async function deleteAssignment(id: number): Promise<void> {
  await http.delete(`${PREFIX}/assignments/${id}`);
}
