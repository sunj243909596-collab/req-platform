import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const group = await prisma.group.upsert({
    where: { groupName: "WMS产品组" },
    update: {},
    create: { groupName: "WMS产品组", description: "WMS 需求管理默认组" },
  });

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash,
      displayName: "系统管理员",
      role: "ADMIN",
      groupName: group.groupName,
    },
  });

  const leadHash = await bcrypt.hash("lead123", 10);
  await prisma.user.upsert({
    where: { username: "lead" },
    update: {},
    create: {
      username: "lead",
      passwordHash: leadHash,
      displayName: "组长张三",
      role: "GROUP_LEAD",
      groupName: group.groupName,
    },
  });

  const memberHash = await bcrypt.hash("member123", 10);
  await prisma.user.upsert({
    where: { username: "member" },
    update: {},
    create: {
      username: "member",
      passwordHash: memberHash,
      displayName: "成员李四",
      role: "MEMBER",
      groupName: group.groupName,
    },
  });

  const existingReqs = await prisma.requirement.count();
  if (existingReqs === 0) {
    const samples = [
      {
        reqNo: "REQ-2026-001",
        title: "支持扫码入库",
        reqType: "REQUIREMENT",
        priority: "P0",
        status: "开发中",
        module: "入库管理",
        assignee: "member",
        reporter: "lead",
        groupName: group.groupName,
        description: "巴枪扫描商品条码后自动匹配 ASN 并完成收货确认。",
        tags: ["GSP", "追溯"],
      },
      {
        reqNo: "REQ-2026-002",
        title: "出库复核界面优化",
        reqType: "IMPROVEMENT",
        priority: "P1",
        status: "设计中",
        module: "出库管理",
        assignee: "lead",
        reporter: "admin",
        groupName: group.groupName,
        description: "优化复核界面布局，减少操作步骤。",
      },
      {
        reqNo: "REQ-2026-003",
        title: "库存盘点差异报表",
        reqType: "BUG",
        priority: "P2",
        status: "待评审",
        module: "库存管理",
        assignee: "member",
        reporter: "member",
        groupName: group.groupName,
        description: "盘点差异报表导出时数据不完整。",
      },
    ];

    for (const sample of samples) {
      await prisma.requirement.create({ data: sample });
    }
  }

  console.log("Seed completed:");
  console.log("  admin / admin123 (ADMIN)");
  console.log("  lead / lead123 (GROUP_LEAD)");
  console.log("  member / member123 (MEMBER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
