# Req Platform

> 面向研发团队的一体化需求管理平台：需求全生命周期跟踪 + 发版流转 + 知识库语义检索 + AI Agent 智能辅助。

[![分支](https://img.shields.io/badge/branch-dev-blue)](https://github.com/sunj243909596-collab/req-platform/tree/dev)
[![包管理](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20strict-blue)](https://www.typescriptlang.org)
[![数据库](https://img.shields.io/badge/PostgreSQL-15%20%2B%20pgvector-336791)](https://github.com/pgvector/pgvector)

---

## 一、项目简介

Req Platform 是一套**通用的需求管理 + 研发协作**平台，覆盖从需求收集、优先级排序、发版流转到上线归档的完整链路，并通过 RAG 知识库 + AI Agent 提升团队效率。

| 模块 | 说明 |
|---|---|
| **需求管理** | 需求的全生命周期跟踪（创建 / 评审 / 开发 / 测试 / 发版 / 归档） |
| **优先级 & 标签** | 多级优先级（P0~P3）、自定义标签、模块归属 |
| **发版管理** | Release 计划、需求关联、SIT 流转、上线发布 |
| **知识库 + RAG** | 业务文档 / 设计资料 / 历史需求的语义检索（pgvector 向量索引） |
| **AI Agent** | 集成 Anthropic Claude 与 OpenAI，封装 LLM 对话、知识检索、规划、需求分析能力 |
| **认证授权** | JWT + RBAC（自定义角色） |
| **用户管理** | 账户、角色、组、状态管理 |

适配场景：互联网产品研发、企业内部系统、SaaS 平台、行业软件等需要规范需求流转的团队。

---

## 二、技术栈

| 层 | 选型 |
|---|---|
| **Monorepo** | pnpm workspace + TypeScript 5.7（`strict: true`） |
| **前端 (client/)** | React 19 + Vite + MUI v7 + Radix UI + Emotion + 状态管理 |
| **后端 (server/)** | Hono 4 + Prisma 6 + PostgreSQL 15（pgvector 扩展）+ JWT + bcryptjs |
| **Agent (agent/)** | Anthropic SDK + OpenAI SDK + 自研 RAG 检索链路 |
| **共享类型 (packages/shared-types/)** | 跨包 TypeScript 类型定义 |
| **基础设施** | Docker Compose（pgvector）、tsx（运行时）、Vite（构建） |

---

## 三、仓库结构

```
req-platform/
├── client/                 # 前端（React 19 + MUI + Radix）
│   └── src/
│       ├── app/            # 路由 / 页面
│       ├── api/            # API 调用层
│       ├── stores/         # 状态管理
│       ├── components/     # 业务组件
│       └── styles/         # 全局样式
├── server/                 # 后端（Hono + Prisma）
│   ├── prisma/
│   │   ├── schema.prisma   # 数据模型（User / Role / Requirement / Release / KnowledgeChunk...）
│   │   └── seed.ts
│   ├── src/
│   │   ├── routes/         # HTTP 路由
│   │   ├── services/       # 业务服务
│   │   ├── middleware/     # JWT / RBAC
│   │   └── lib/            # 基础设施
│   └── uploads/            # 知识库原始文件上传目录（不入 git）
├── agent/                  # AI Agent
│   └── src/
│       ├── llm/            # Claude / OpenAI 客户端 + Prompt 模板
│       ├── rag/            # 向量检索 / 知识库查询
│       ├── knowledge/      # 知识库同步
│       ├── planning/       # 任务规划
│       ├── conversation/   # 对话管理
│       └── analysis/       # 需求分析
├── packages/
│   └── shared-types/       # 跨包 TS 类型
├── docker-compose.yml      # pgvector 容器
├── tsconfig.base.json      # 共享 TS 配置
└── pnpm-lock.yaml
```

---

## 四、快速开始

### 4.1 环境要求

- Node.js ≥ 20
- pnpm ≥ 9
- Docker & Docker Compose

### 4.2 启动数据库

```bash
docker compose up -d db
# 启动 pgvector/pgvector:0.8.0-pg15，端口 5432
# 账号: req_admin / req_secret / req_platform_db
```

### 4.3 安装依赖

```bash
pnpm install
```

> ⚠️ **WSL 用户注意**：若 `node_modules` 在 Windows 磁盘上，请先删除再 `pnpm install` 重新装，避免原生模块平台不一致。

### 4.4 数据库迁移与种子

```bash
cd server
pnpm prisma:migrate          # 应用 schema
pnpm prisma:seed             # 初始化基础数据
```

### 4.5 启动开发服务（需开 2~3 个终端）

```bash
# 终端 1：后端
pnpm --filter server dev     # tsx watch 模式，监听 src/index.ts

# 终端 2：前端
pnpm --filter client dev     # Vite 默认 http://localhost:5173

# 终端 3：（可选）知识库同步
pnpm --filter agent kb:sync  # 把本地文档同步进 RAG
```

---

## 五、常用命令速查

| 命令 | 作用 |
|---|---|
| `pnpm --filter server dev` | 启后端（tsx watch） |
| `pnpm --filter client dev` | 启前端（Vite） |
| `pnpm --filter client build` | 前端生产构建 |
| `pnpm --filter server build` | 后端 TS 编译（`tsc`） |
| `pnpm --filter server prisma:studio` | 打开 Prisma Studio（数据浏览） |
| `pnpm --filter agent kb:sync` | 同步知识库到 RAG |
| `docker compose up -d db` | 启动 PostgreSQL + pgvector |

---

## 六、配置 & 数据

### 6.1 环境变量

| 变量 | 说明 | 示例 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://req_admin:req_secret@localhost:5432/req_platform_db` |
| `JWT_SECRET` | JWT 签名密钥 | （自行生成强随机字符串） |
| `ANTHROPIC_API_KEY` | Claude API 密钥（Agent 用） | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API 密钥（Agent 用，可选） | `sk-...` |

通过 `agent-config.json` 或 `.env` 文件管理，**均不入 git**（`.gitignore` 已屏蔽）。

### 6.2 数据模型概览

| 模型 | 用途 |
|---|---|
| `User` | 平台用户 |
| `Role` | 角色定义（RBAC） |
| `Requirement` | 需求单（标题 / 描述 / 优先级 / 状态 / 分配人 / 模块 / 标签） |
| `Release` | 发版计划（关联需求） |
| `KnowledgeChunk` | RAG 知识库 chunk（pgvector 嵌入） |
| `Notification` | 站内通知 |

---

## 七、关键设计原则

1. **类型安全** — TypeScript `strict: true`，跨包类型走 `packages/shared-types`
2. **审计字段** — 主要实体记录 `createdAt` / `createdBy` / `updatedAt` / `updatedBy` / `version`
3. **权限分层** — 路由级 JWT 鉴权 + 服务级 RBAC 角色检查
4. **RAG 优先** — AI 回答前先检索知识库，降低幻觉
5. **本地优先 / 云端可选** — pgvector 自托管，Anthropic/OpenAI 走云端 API

---

## 八、贡献指南

- 提交规范：`<type>(<scope>): <description>`（如 `feat(client): add filter row to dialog`）
- 分支策略：`dev` 为集成分支，功能开发请基于 `dev` 拉特性分支
- 写代码前：先看 `client/src/app/`、`server/src/routes/`、`agent/src/` 的现有实现风格
- 新增需求模型字段时：先改 `server/prisma/schema.prisma` → `prisma migrate dev` → 同步 `shared-types`

### 8.1 项目脚本

| 路径 | 命令 | 作用 |
|---|---|---|
| 根 | `pnpm install` | 安装所有子包依赖 |
| `server/` | `pnpm prisma:migrate` | 应用数据库迁移 |
| `server/` | `pnpm prisma:seed` | 初始化种子数据 |
| `server/` | `pnpm prisma:studio` | 打开数据库可视化工具 |

---

## 九、许可证

本项目采用 **MIT 许可证** — 详见 [LICENSE](./LICENSE) 文件（如未提供，请补充）。

---

**维护者**：Jason SUN
**最近更新**：2026-06-13
