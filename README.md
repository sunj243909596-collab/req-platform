# WMS 需求管理平台 (req-platform)

> 医药物流仓储系统（WMS）的需求、发版、知识库与 AI Agent 一体化管理平台。

[![分支](https://img.shields.io/badge/branch-dev-blue)](https://github.com/sunj243909596-collab/req-platform/tree/dev)
[![包管理](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20strict-blue)](https://www.typescriptlang.org)
[![数据库](https://img.shields.io/badge/PostgreSQL-15%20%2B%20pgvector-336791)](https://github.com/pgvector/pgvector)

---

## 一、项目简介

WMS 需求管理平台是 **国药控股物流仓储系统（WMOS）** 的配套工具，覆盖：

| 模块 | 说明 |
|---|---|
| **需求管理** | 295 条业务需求的全生命周期跟踪（P0 紧急 12 条 / P1 163 / P2 48 / P3 72） |
| **发版管理** | Release 计划、需求关联、SIT 流转、上线发布 |
| **知识库 + RAG** | 业务规则 / 字段映射 / 设计文档的语义检索（pgvector 452 chunks） |
| **AI Agent** | 集成 Anthropic Claude 与 OpenAI，封装 LLM 对话、知识检索、规划能力 |
| **业务规则引擎** | ASN 收货、GSP 追溯、发版自动审核等规则化沉淀 |
| **认证授权** | JWT + RBAC（自定义角色）+ 微信扫码登录 |

业务背景：聚焦收货、出库拣货、入库管理、前置机下发、质量台账等 40 个业务模块。

---

## 二、技术栈

| 层 | 选型 |
|---|---|
| **Monorepo** | pnpm workspace + TypeScript 5.7（`strict: true`） |
| **前端 (client/)** | React 19 + Vite + MUI v7 + Radix UI + Emotion + Pinia/Zustand |
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
│   └── uploads/kb/         # 知识库原始文件
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
├── docs/                   # 知识库与项目文档
│   ├── 00-需求总览.md      # 需求索引
│   ├── 00-术语表.md        # WMOS 字段速查（ASN/LPN/库位等）
│   ├── 00-架构总览.md      # 三层文档架构
│   ├── 99-业务规则/        # ASN / GSP / 发版审核业务规则
│   ├── plans/              # 实施计划
│   └── 微信扫码登录集成方案.md
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

### 4.5 启动开发服务（需开 3 个终端）

```bash
# 终端 1：后端
pnpm --filter server dev     # tsx watch 模式，监听 src/index.ts

# 终端 2：前端
pnpm --filter client dev     # Vite 默认 http://localhost:5173

# 终端 3：（可选）知识库同步
pnpm --filter agent kb:sync  # 把 docs/ 与 uploads/kb/ 同步进 RAG
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
| `docker compose up -d db` | 启动 PostgreSQL+pgvector |

---

## 六、文档导航

| 文档 | 用途 |
|---|---|
| [`docs/00-需求总览.md`](docs/00-需求总览.md) | 需求索引（数量 / 状态 / 优先级 / 模块分布） |
| [`docs/00-术语表.md`](docs/00-术语表.md) | WMOS 字段速查（ASN / LPN / 库位 严禁搞错） |
| [`docs/00-架构总览.md`](docs/00-架构总览.md) | 三层文档架构（Index / Content / Reason） |
| [`docs/99-业务规则/BR-001-ASN收货规则.md`](docs/99-业务规则/BR-001-ASN收货规则.md) | ASN 收货业务规则 |
| [`docs/99-业务规则/BR-002-发版审核规则.md`](docs/99-业务规则/BR-002-发版审核规则.md) | 发版自动审核 |
| [`docs/99-业务规则/BR-003-GSP追溯规则.md`](docs/99-业务规则/BR-003-GSP追溯规则.md) | GSP 药品追溯合规 |
| [`docs/微信扫码登录集成方案.md`](docs/微信扫码登录集成方案.md) | 微信扫码登录技术方案 |
| [`docs/Agent架构评审报告.md`](docs/Agent架构评审报告.md) | Agent 架构设计评审 |
| [`docs/安全威胁评估报告.md`](docs/安全威胁评估报告.md) | 安全审计与漏洞清单 |
| [`docs/plans/`](docs/plans/) | 实施计划归档 |

---

## 七、关键设计铁律

1. **WMOS 字段严禁猜测** — 遇不确定字段先查 [`docs/00-术语表.md`](docs/00-术语表.md) 或 RAG 检索 `WMOS 数据表结构`
2. **ASN 状态是 2 位码**（10/20/30/40/50/60/70），**不是 3 位码**（100/300）
3. **审计字段五件套**：`createDateTime` / `createUserId` / `updateDateTime` / `updateUserId` / `wmVersionId`
4. **GSP 合规**：代码层支持审计追踪 / 权限控制 / 更改留痕，具体合规由业务管理
5. **AI 生成文档带行号前缀** — 提交前用 Python 正则清理：`re.sub(r'^\s*\d+\| ?', '', raw, flags=re.MULTILINE)`

---

## 八、贡献指南

- 提交规范：`<type>(<scope>): <description>`（如 `feat(client): add filter row to dialog`）
- 分支策略：`dev` 为集成分支，功能开发请基于 `dev` 拉特性分支
- 修改前先查 `docs/00-需求总览.md` 与 `docs/00-术语表.md`
- 写代码前看 `CLAUDE.md` 与 `docs/00-架构总览.md`

---

## 九、许可证

内部项目，未经授权禁止外传。

---

**维护者**：Jason SUN &middot; 黄噜噜（Hermes Agent）
**最近更新**：2026-06-13
