import { prisma } from "../lib/prisma";


export type NotificationType =
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "COMMENTED"
  | "MENTIONED"
  | "REVIEW_SUBMITTED"
  | "REVIEW_RESULT"
  | "RELEASE_REVIEW";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType | string;
  reqId?: number;
  content: string;
}

export async function getNotifications(userId: number, limit = 50) {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return notifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getUnreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markAsRead(notificationId: number) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
}

export async function markAllAsRead(userId: number) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

export async function deleteNotification(id: number) {
  return prisma.notification.delete({ where: { id } });
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({ data: input });
}

export async function createNotificationsForGroup(
  groupName: string,
  excludeUsername: string | null,
  input: Omit<CreateNotificationInput, "userId">
) {
  const users = await prisma.user.findMany({
    where: {
      groupName,
      isActive: true,
      ...(excludeUsername ? { username: { not: excludeUsername } } : {}),
    },
    select: { id: true },
  });

  if (users.length === 0) return 0;

  await prisma.notification.createMany({
    data: users.map((u) => ({ ...input, userId: u.id })),
  });

  return users.length;
}
