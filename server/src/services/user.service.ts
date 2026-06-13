import bcrypt from "bcryptjs";
import type { AuthContext } from "../utils/access";
import { prisma } from "../lib/prisma";

function validatePassword(password: string): void {
  if (password.length < 8) throw new Error("密码长度不能少于8位");
  if (!/[A-Z]/.test(password)) throw new Error("密码必须包含大写字母");
  if (!/[a-z]/.test(password)) throw new Error("密码必须包含小写字母");
  if (!/[0-9]/.test(password)) throw new Error("密码必须包含数字");
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName: string;
  role: "ADMIN" | "GROUP_LEAD" | "MEMBER";
  groupName?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: string;
  groupName?: string;
  isActive?: boolean;
  password?: string;
}

export async function listUsers(_ctx: AuthContext) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      groupName: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));
}

export async function getUser(_ctx: AuthContext, id: number) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      groupName: true,
      isActive: true,
      createdAt: true,
    },
  });
  if (!user) throw new Error("用户不存在");
  return user;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new Error("用户名已存在");

  validatePassword(input.password);

  const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;
  const passwordHash = await bcryptLib.hash(input.password, 10);

  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      displayName: input.displayName,
      role: input.role,
      groupName: input.groupName,
    },
  });
}

export async function updateUser(id: number, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("用户不存在");

  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.role !== undefined) data.role = input.role;
  if (input.groupName !== undefined) data.groupName = input.groupName;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password) {
    validatePassword(input.password);
    const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;
    data.passwordHash = await bcryptLib.hash(input.password, 10);
  }

  return prisma.user.update({ where: { id }, data });
}

export async function deleteUser(id: number) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("用户不存在");

  return prisma.user.delete({ where: { id } });
}
