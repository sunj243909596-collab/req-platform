import { http } from './http';

export interface Notification {
  id: number;
  userId: number;
  type: string;
  reqId: number | null;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  ASSIGNED: '需求分配',
  STATUS_CHANGED: '状态变更',
  COMMENTED: '评论',
  MENTIONED: '@提及',
  REVIEW_SUBMITTED: '审核提交',
  REVIEW_RESULT: '审核结果',
  RELEASE_REVIEW: '发版审核',
};

export async function getNotifications(limit = 50): Promise<Notification[]> {
  return http.get('/notifications', { limit });
}

export async function getUnreadCount(): Promise<number> {
  const data = await http.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markAsRead(id: number): Promise<Notification> {
  return http.put(`/notifications/${id}/read`);
}

export async function markAllAsRead(): Promise<void> {
  await http.put('/notifications/read-all');
}

export async function deleteNotification(id: number): Promise<void> {
  await http.delete(`/notifications/${id}`);
}
