import { PrismaClient } from "@prisma/client";

// Singleton Prisma client — import this instead of creating new PrismaClient() in each module
export const prisma = new PrismaClient();
