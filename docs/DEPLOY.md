# WMS 需求管理平台 — 生产部署指南

本文档说明如何将 **Req Platform（WMS 需求管理平台）** 部署到 Linux 生产环境。

## 1. 架构概览

```
                    ┌─────────────────────────────────────┐
  用户浏览器 ──────►│  Nginx (80/443)                     │
                    │  ├─ /        → client/dist 静态资源  │
                    │  └─ /api/*   → 反向代理到后端        │
                    └──────────────┬──────────────────────┘
                                   │ 127.0.0.1:8001
                    ┌──────────────▼──────────────────────┐
                    │  Node.js 后端 (Hono + Prisma)        │
                    │  systemd: req-platform.service       │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  PostgreSQL 15 + pgvector            │
                    │  Docker Compose 或独立实例            │
                    └─────────────────────────────────────┘
```

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端 | React + Vite | 构建产物 `client/dist/`，由 Nginx 托管 |
| 后端 | Hono + Node.js ≥ 20 | 监听 `PORT`（默认 8001），API 前缀 `/api` |
| 数据库 | PostgreSQL 15 + pgvector | 向量检索、全文检索依赖 pgvector / pg_trgm |
| 进程管理 | systemd | 推荐；也可用 PM2 / Docker |
| 反向代理 | Nginx | 统一入口、HTTPS、静态资源、API 转发 |

前端 API 使用相对路径 `/api/v1`（见 `client/src/api/http.ts`），生产环境**无需**单独配置 `VITE_API_URL`，只要 Nginx 将 `/api` 转发到后端即可。

---

## 2. 服务器要求

| 项目 | 最低配置 | 推荐 |
|------|----------|------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB（RAG 重建索引时占用更高） |
| 磁盘 | 40 GB | 100 GB+（含 uploads 与数据库） |
| 操作系统 | Ubuntu 22.04 / Debian 12 / CentOS 8+ | — |

**软件依赖：**

- Node.js ≥ 20
- pnpm ≥ 9
- Nginx
- Docker & Docker Compose（若数据库容器化部署）
- Git（从仓库拉取代码）

---

## 3. 目录与持久化数据

部署后需持久化以下路径（备份 / 挂载卷）：

| 路径 | 用途 |
|------|------|
| `server/uploads/` | 需求附件、知识库文件、手册上传等 |
| PostgreSQL 数据目录 | 业务数据 + 向量索引 |
| `server/.env` | 生产环境变量（**勿提交 Git**） |

---

## 4. 首次部署（逐步）

### 4.1 获取代码

```bash
# 示例：部署到 /opt/req-platform
sudo mkdir -p /opt/req-platform
sudo chown "$USER:$USER" /opt/req-platform

git clone <你的仓库地址> /opt/req-platform
cd /opt/req-platform
git checkout dev   # 或你的发布分支
```

### 4.2 启动数据库

**方式 A — Docker Compose（推荐小规模自建）：**

```bash
cd /opt/req-platform

# 复制并编辑生产 compose（修改 POSTGRES_PASSWORD）
cp docker-compose.prod.yml docker-compose.prod.local.yml
# 编辑 docker-compose.prod.local.yml 中的密码

docker compose -f docker-compose.prod.local.yml up -d db
```

**方式 B — 已有 PostgreSQL 15：**

确保已安装扩展：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 4.3 配置环境变量

```bash
cp deploy/env/server.env.production.example server/.env
# 编辑 server/.env，至少修改以下项：
#   DATABASE_URL
#   JWT_SECRET          （强随机字符串，≥ 32 字符）
#   CORS_ORIGIN         （https://你的域名，禁止 * 或 localhost）
#   ANTHROPIC_API_KEY / OPENAI_API_KEY / EMBEDDING_API_KEY（若启用 AI/RAG）
#   KB_SOURCES          （生产服务器上知识库文档的实际路径）
```

**生产环境建议额外设置：**

```bash
RAG_STARTUP_REINDEX=false
RAG_STARTUP_REQ_REINDEX=false
```

首次启动时 RAG 全量重建可能耗时数分钟；生产环境建议关闭启动时自动重建，改用手动触发：

```bash
curl -X POST -H "Authorization: Bearer <admin-token>" \
  https://你的域名/api/v1/knowledge/requirement-kb/rebuild
```

### 4.4 安装依赖并初始化

```bash
# 一键首次安装（构建 + 迁移 + seed + systemd + nginx 模板）
./scripts/deploy.sh install

# 或分步执行：
./scripts/deploy.sh build
./scripts/deploy.sh migrate
./scripts/deploy.sh seed      # 仅首次，创建 admin 等初始账号
```

首次 seed 默认账号（**上线后立即修改密码**）：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| lead | lead123 | 组长 |
| member | member123 | 成员 |

### 4.5 配置 Nginx

```bash
# 生成站点配置（替换域名与路径）
sudo ./scripts/deploy.sh nginx-config \
  --domain req.example.com \
  --root /opt/req-platform/client/dist

# 手动检查并启用
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS 建议使用 certbot：

```bash
sudo certbot --nginx -d req.example.com
```

### 4.6 启动后端服务

```bash
sudo ./scripts/deploy.sh install-systemd   # 注册 systemd 单元
sudo systemctl enable --now req-platform
sudo systemctl status req-platform
```

### 4.7 验证

```bash
./scripts/deploy.sh status

# 期望输出：
#   后端 health: ok
#   前端: HTTP 200
```

浏览器访问 `https://你的域名`，使用 admin 登录并**立即修改密码**。

---

## 5. 日常更新（滚动发布）

```bash
cd /opt/req-platform

git pull origin dev          # 拉取最新代码
./scripts/deploy.sh all      # 构建 + 迁移 + 重启

# 等价于：
# ./scripts/deploy.sh build
# ./scripts/deploy.sh migrate
# ./scripts/deploy.sh restart
```

---

## 6. 环境变量参考

完整示例见 [`deploy/env/server.env.production.example`](../deploy/env/server.env.production.example)。

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接串 |
| `JWT_SECRET` | ✅ | JWT 签名密钥，生产必须更换 |
| `CORS_ORIGIN` | ✅ | 前端域名，如 `https://req.example.com` |
| `PORT` | — | 后端端口，默认 `8001` |
| `LLM_PROVIDER` | — | `anthropic` 或 `openai` |
| `ANTHROPIC_API_KEY` | AI 功能 | Claude API Key |
| `OPENAI_API_KEY` | AI 功能 | OpenAI API Key |
| `EMBEDDING_PROVIDER` | RAG | 默认 `openai` |
| `EMBEDDING_API_KEY` | RAG | Embedding API Key |
| `EMBEDDING_MODEL` | RAG | 如 `text-embedding-v3` |
| `KB_SOURCES` | RAG | 知识库源目录，逗号分隔 |
| `RAG_STARTUP_REINDEX` | — | 默认 `true`；生产建议 `false` |
| `RAG_STARTUP_REQ_REINDEX` | — | 默认 `true`；生产建议 `false` |

---

## 7. 运维命令速查

| 操作 | 命令 |
|------|------|
| 全量部署 | `./scripts/deploy.sh all` |
| 仅构建 | `./scripts/deploy.sh build` |
| 数据库迁移 | `./scripts/deploy.sh migrate` |
| 重启后端 | `./scripts/deploy.sh restart` |
| 查看状态 | `./scripts/deploy.sh status` |
| 后端日志 | `journalctl -u req-platform -f` |
| Nginx 日志 | `tail -f /var/log/nginx/req-platform.access.log` |
| 停止后端 | `sudo systemctl stop req-platform` |
| 数据库备份 | `pg_dump "$DATABASE_URL" -Fc -f backup_$(date +%Y%m%d).dump` |

---

## 8. 数据库迁移说明

开发环境使用 `pnpm prisma:migrate`（`migrate dev`），**生产环境必须使用**：

```bash
cd server
pnpm prisma:deploy    # 等价于 prisma migrate deploy
```

`deploy.sh migrate` 已封装上述命令。迁移文件位于 `server/prisma/migrations/`。

---

## 9. 安全清单

- [ ] 修改 `JWT_SECRET` 为强随机值
- [ ] 修改所有 seed 账号默认密码
- [ ] `CORS_ORIGIN` 设为精确生产域名
- [ ] PostgreSQL 不对公网暴露 5432
- [ ] 启用 HTTPS（Let's Encrypt 或企业证书）
- [ ] `server/.env` 权限设为 `600`
- [ ] 定期备份数据库与 `server/uploads/`
- [ ] API Key 仅存于 `server/.env`，勿写入 Git
- [ ] 防火墙仅开放 80/443

---

## 10. 故障排查

### 后端无法启动

```bash
journalctl -u req-platform -n 100 --no-pager
# 常见原因：DATABASE_URL 错误、端口占用、prisma client 未生成
```

### 前端 502 / API 不通

```bash
curl -sf http://127.0.0.1:8001/api/health
# 若失败，检查 systemd 状态与 .env 中 PORT
sudo nginx -t
```

### 数据库连接失败

```bash
# 测试连接
psql "$DATABASE_URL" -c "SELECT 1"
# Docker 场景检查容器
docker compose -f docker-compose.prod.local.yml ps
```

### RAG / 向量搜索异常

确认 pgvector 扩展已安装：

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 文件上传失败

Nginx 需设置 `client_max_body_size 25m;`（见 `deploy/nginx/req-platform.conf.example`）。

---

## 11. 脚本索引

| 脚本 | 用途 |
|------|------|
| [`scripts/deploy.sh`](../scripts/deploy.sh) | 部署主入口 |
| [`scripts/deploy/build.sh`](../scripts/deploy/build.sh) | 前后端生产构建 |
| [`scripts/deploy/migrate.sh`](../scripts/deploy/migrate.sh) | 生产数据库迁移 |
| [`scripts/deploy/install.sh`](../scripts/deploy/install.sh) | 首次安装（systemd + 目录） |
| [`deploy/nginx/req-platform.conf.example`](../deploy/nginx/req-platform.conf.example) | Nginx 站点模板 |
| [`deploy/systemd/req-platform.service.example`](../deploy/systemd/req-platform.service.example) | systemd 单元模板 |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | 生产数据库 Compose |

---

## 12. 与开发环境的差异

| 项目 | 开发 (`./scripts/dev.sh`) | 生产 |
|------|---------------------------|------|
| 前端 | Vite dev server :6173 | Nginx 托管 `client/dist` |
| 后端 | tsx watch 热重载 | `node dist/server/src/index.js` |
| API 代理 | Vite proxy | Nginx reverse proxy |
| 数据库迁移 | `prisma migrate dev` | `prisma migrate deploy` |
| CORS | `http://localhost:6173` | 生产 HTTPS 域名 |
