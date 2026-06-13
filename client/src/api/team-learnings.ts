import { http } from './http';

export const LEARNING_CATEGORY_LABELS: Record<string, string> = {
  '最佳实践': '🏆 最佳实践',
  '踩坑记录': '⚠️ 踩坑记录',
  '团队偏好': '💡 团队偏好',
  '架构决策': '🏗️ 架构决策',
};

export interface TeamLearning {
  id: number;
  title: string;
  content: string | null;
  category: string;
  tags: Record<string, unknown> | null;
  author: string;
  confidence: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamLearningInput {
  title: string;
  content?: string;
  category: string;
  tags?: Record<string, unknown>;
  confidence?: number;
}

export interface LearningStats {
  total: number;
  byCategory: Record<string, number>;
}

export async function listTeamLearnings(
  params: { page?: number; pageSize?: number; category?: string; search?: string } = {}
): Promise<{ data: TeamLearning[]; total: number; page: number; pageSize: number }> {
  return http.get('/team-learnings', params);
}

export async function getLearningStats(): Promise<LearningStats> {
  return http.get('/team-learnings/stats');
}

export async function createTeamLearning(input: CreateTeamLearningInput): Promise<TeamLearning> {
  return http.post('/team-learnings', input);
}

export async function updateTeamLearning(
  id: number,
  input: Partial<CreateTeamLearningInput>
): Promise<TeamLearning> {
  return http.put(`/team-learnings/${id}`, input);
}

export async function deleteTeamLearning(id: number): Promise<void> {
  await http.delete(`/team-learnings/${id}`);
}
