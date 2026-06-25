# Req Platform

> An integrated requirement management platform for R&D teams: full lifecycle tracking + release workflow + knowledge base semantic search + AI Agent assistance.

[![branch](https://img.shields.io/badge/branch-dev-blue)](https://github.com/sunj243909596-collab/req-platform/tree/dev)
[![pkg](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io)
[![ts](https://img.shields.io/badge/TypeScript-5.7%20strict-blue)](https://www.typescriptlang.org)
[![db](https://img.shields.io/badge/PostgreSQL-15%20%2B%20pgvector-336791)](https://github.com/pgvector/pgvector)

---

## 1. Overview

**Req Platform** is a **generic requirement management + R&D collaboration** platform that covers the complete pipeline from requirement collection, prioritization, release planning, to archival — enhanced with a RAG knowledge base and AI Agent to boost team efficiency.

| Module | Description |
|---|---|
| **Requirement Management** | Full lifecycle tracking (create / review / develop / test / release / archive) |
| **Priority & Tags** | Multi-level priority (P0~P3), custom tags, module ownership |
| **Release Management** | Release planning, requirement linking, SIT workflow, deployment |
| **Knowledge Base + RAG** | Semantic search over business docs / designs / historical requirements (pgvector) |
| **AI Agent** | Anthropic Claude + OpenAI integration, LLM chat, knowledge retrieval, planning, requirement analysis |
| **Auth & RBAC** | JWT + role-based access control (custom roles) |
| **User Management** | Accounts, roles, groups, status management |

Suited for: internet product R&D, enterprise internal systems, SaaS platforms, vertical industry software — any team that needs disciplined requirement workflow.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| **Monorepo** | pnpm workspace + TypeScript 5.7 (`strict: true`) |
| **Frontend (client/)** | React 19 + Vite + MUI v7 + Radix UI + Emotion + state management |
| **Backend (server/)** | Hono 4 + Prisma 6 + PostgreSQL 15 (pgvector) + JWT + bcryptjs |
| **Agent (agent/)** | Anthropic SDK + OpenAI SDK + custom RAG retrieval chain |
| **Shared Types (packages/shared-types/)** | Cross-package TypeScript type definitions |
| **Infrastructure** | Docker Compose (pgvector), tsx (runtime), Vite (build) |

---

## 3. Repository Structure

```
req-platform/
├── client/                 # Frontend (React 19 + MUI + Radix)
│   └── src/
│       ├── app/            # Routes / pages
│       ├── api/            # API call layer
│       ├── stores/         # State management
│       ├── components/     # Business components
│       └── styles/         # Global styles
├── server/                 # Backend (Hono + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma   # Data models (User / Role / Requirement / Release / KnowledgeChunk...)
│   │   ├── schema.sql      # PostgreSQL 15 DDL (synced from schema.prisma, pgvector)
│   │   └── seed.ts
│   ├── src/
│   │   ├── routes/         # HTTP routes
│   │   ├── services/       # Business services
│   │   ├── middleware/     # JWT / RBAC
│   │   └── lib/            # Infrastructure
│   └── uploads/            # Knowledge base raw uploads (gitignored)
├── agent/                  # AI Agent
│   └── src/
│       ├── llm/            # Claude / OpenAI clients + prompt templates
│       ├── rag/            # Vector retrieval / KB query
│       ├── knowledge/      # KB sync
│       ├── planning/       # Task planning
│       ├── conversation/   # Dialog management
│       └── analysis/       # Requirement analysis
├── packages/
│   └── shared-types/       # Cross-package TS types
├── docker-compose.yml      # pgvector container
├── tsconfig.base.json      # Shared TS config
└── pnpm-lock.yaml
```

---

## 4. Quick Start

### 4.1 Requirements

- Node.js ≥ 20
- pnpm ≥ 9
- Docker & Docker Compose

### 4.2 Start the Database

```bash
docker compose up -d db
# Boots pgvector/pgvector:0.8.0-pg15 on port 5432
# User: req_admin / Password: req_secret / DB: req_platform_db
```

If port `5432` is already used by a local PostgreSQL instance, either stop the
local service before using Docker Compose, or point `server/.env` to the existing
database and make sure the configured user has privileges on `req_platform_db`.

### 4.3 Configure Server Environment

```bash
cp server/.env.example server/.env
```

For local development, the common defaults are:

```bash
DATABASE_URL="postgresql://req_admin:req_secret@localhost:5432/req_platform_db?schema=public"
JWT_SECRET="dev-jwt-secret-change-in-production"
CORS_ORIGIN="http://localhost:6173"
PORT=8001
```

### 4.4 Install Dependencies

```bash
cd server
pnpm install

cd ../client
pnpm install
```

> ⚠️ **WSL users**: if `node_modules` lives on a Windows drive, delete it first and re-run `pnpm install` inside WSL to avoid native-module platform mismatch.

`server/pnpm-workspace.yaml` allows the Prisma and esbuild build scripts required
for `pnpm install` and `prisma generate`.

### 4.5 Initialize the Database Schema

You can use either **Prisma migrate** (recommended for ongoing development) or **raw SQL** (faster cold-start):

**Option A — Prisma migrate** (recommended for development):

```bash
cd server
pnpm prisma:migrate          # Apply schema
pnpm prisma:seed             # Seed initial data
```

**Option B — Raw SQL** (faster cold-start, no Prisma client needed):

```bash
# Apply the DDL directly (PG 15 + pgvector required)
psql "$DATABASE_URL" -f server/prisma/schema.sql
```

`server/prisma/schema.sql` is **regenerated from `schema.prisma`** via `scripts/regenerate-schema-sql.sh` and contains:
- 3 extensions: `vector`, `pg_trgm`, `uuid-ossp`
- **48 tables** (= `schema.prisma` models count; PascalCase naming with quoted identifiers)
- **53 indexes** (unique / composite; HNSW vector indexes added via separate migrations)
- **43 FK constraints** (added via `ALTER TABLE ... ADD CONSTRAINT`)
- **47 `COMMENT ON` annotations** (preserved from legacy schema for table/column docs)

> ⚠️ **Two ways to initialize, both produce equivalent schemas:**
> - Option A (`prisma migrate deploy`): runs the 17-migration chain in `server/prisma/migrations/`
> - Option B (`psql -f schema.sql`): applies the consolidated DDL snapshot directly
>
> After initialization, both paths yield the same 48 business tables. The `WorkflowConfig` table from the initial migration is a deprecated legacy table (not in `schema.prisma`) and is kept for backward compatibility only.
>
> Check sync health: `bash scripts/check-schema-sync.sh`

### 4.6 Start Dev Servers

Recommended one-command startup:

```bash
./scripts/dev.sh
```

Default development addresses:

- Frontend: http://localhost:6173
- Backend: http://localhost:8001
- Health check: http://localhost:8001/api/health

Stop the dev servers:

```bash
./scripts/stop-dev.sh
```

Manual startup is also supported:

```bash
# Terminal 1: backend
cd server
pnpm dev                     # tsx watch mode, watches src/index.ts

# Terminal 2: frontend
cd client
pnpm dev                     # Vite, default http://localhost:6173

# Terminal 3 (optional): knowledge base sync
cd agent
pnpm kb:sync                 # Sync local docs into RAG
```

---

## 5. Common Commands

| Command | Purpose |
|---|---|
| `./scripts/dev.sh` | Run backend and frontend together |
| `./scripts/stop-dev.sh` | Stop local dev servers and free ports |
| `cd server && pnpm dev` | Run backend (tsx watch) |
| `cd client && pnpm dev` | Run frontend (Vite) |
| `cd client && pnpm build` | Frontend production build |
| `cd server && pnpm build` | Backend TS compile (`tsc`) |
| `cd server && pnpm prisma:studio` | Open Prisma Studio (data browser) |
| `cd agent && pnpm kb:sync` | Sync knowledge base into RAG |
| `docker compose up -d db` | Start PostgreSQL + pgvector |

---

## 6. Configuration & Data

### 6.1 Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://req_admin:req_secret@localhost:5432/req_platform_db` |
| `JWT_SECRET` | JWT signing secret | (a strong random string) |
| `ANTHROPIC_API_KEY` | Claude API key (for Agent) | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key (for Agent, optional) | `sk-...` |

Configure via `server/agent-config.json` (LLM provider/key/model) or `.env` files at the project root or under `server/` — **both are gitignored**. The Agent reads `server/agent-config.json` at startup; secrets in `.env` override values from the JSON file when both are present.

### 6.2 Data Model Overview

The platform has **48 models** in `schema.prisma`, grouped into the following functional areas:

| Area | Models | Purpose |
|---|---|---|
| **Identity & Access** | `User`, `Role`, `Group`, `Permission`, `PermissionResource`, `PermissionGroup`, `PermissionGroupItem`, `UserPermissionGroup` | RBAC + fine-grained permission groups (5 tables for perm system, see v1.0.0 release) |
| **Requirement Lifecycle** | `Requirement`, `SubTask`, `ReqRelation`, `RequirementType`, `RequirementCategory`, `RequirementNumberRule`, `RequirementSeqCounter`, `RequirementView`, `CustomField`, `ReqCustomValue`, `Attachment`, `Document`, `Comment`, `ActivityLog` | Core requirement ticket + workflow + custom fields |
| **Release Management** | `Release`, `ReleaseReview`, `TestCase`, `TestRun`, `RegressionSuite`, `RegressionSuiteItem`, `RegressionRun`, `RegressionRunItem` | Release planning + SIT + regression tracking |
| **Workflow** | `WorkflowDefinition`, `WorkflowStatus`, `WorkflowTransition` | Configurable state machines (3 split tables) |
| **Knowledge Base + RAG** | `KnowledgeBase`, `KnowledgeDocument`, `KnowledgeChunk` | pgvector embeddings (1024-dim, HNSW index) |
| **AI Agent** | `Conversation`, `ConversationMessage`, `AnalysisCache`, `AgentTask`, `ReqAgentInsight`, `TeamLearning`, `AiSkill`, `SkillAssignment` | Agent conversation history + RAG cache + skill registry |
| **Operations** | `OperationManual`, `ManualCategory`, `SystemConfig`, `Notification` | User-facing manuals + system config + notifications |

> 📚 **Full schema**: see `server/prisma/schema.prisma` (48 models). **Consolidated DDL snapshot**: see `server/prisma/schema.sql`. **Migration history**: see `server/prisma/migrations/` (17 migrations).

---

## 7. Key Design Principles

1. **Type safety** — TypeScript `strict: true`; cross-package types in `packages/shared-types`
2. **Audit fields** — main entities record `createdAt` / `createdBy` / `updatedAt` / `updatedBy` / `version`
3. **Layered auth** — route-level JWT + service-level RBAC role checks
4. **RAG-first** — retrieve from the knowledge base before any AI answer to reduce hallucination
5. **Local-first / cloud-optional** — pgvector self-hosted; Anthropic/OpenAI are cloud APIs

---

## 8. Contributing

- Commit convention: `<type>(<scope>): <description>` (e.g. `feat(client): add filter row to dialog`)
- Branch strategy: `dev` is the integration branch — create feature branches off `dev`
- Before writing code: skim `client/src/app/`, `server/src/routes/`, `agent/src/` for existing style
- Adding requirement-model fields: update `server/prisma/schema.prisma` → `prisma migrate dev` → sync `shared-types`

### 8.1 Project Scripts

| Path | Command | Purpose |
|---|---|---|
| root | `pnpm install` | Install all sub-package deps |
| `server/` | `pnpm prisma:migrate` | Apply DB migrations |
| `server/` | `pnpm prisma:seed` | Seed initial data |
| `server/` | `pnpm prisma:studio` | Open DB visual tool |

---

## 9. License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file.

---

## 10. Production Deployment

See [docs/DEPLOY.md](./docs/DEPLOY.md) for the full production deployment guide and [`scripts/deploy.sh`](./scripts/deploy.sh) for automation scripts.
