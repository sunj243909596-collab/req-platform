# 01 · 业务需求文档 BRD — 用户自助修改密码

> 需求名称：用户自助修改密码（Self-Service Password Change）
> 版本：v1.0.0
> 撰写日期：2026-07-29
> 撰写人：Jason SUN（Hermes Agent）
> 适用范围：`/root/WMOS 设计工场/WMS需求管理平台/`（Req Platform — Hono 4 + Prisma 6 + PostgreSQL + JWT）

---

## 1. 业务背景

### 1.1 当前现状（As-Is）

| 维度 | 现状 |
|---|---|
| 后端 | `server/src/routes/users.routes.ts:77` 路由 `PUT /api/users/:id` 通过 `requireRole("ADMIN")` 中间件锁死，仅 ADMIN 可改任意用户密码（含自己的） |
| 服务层 | `server/src/services/user.service.ts:95-99` `updateUser` 内部已实现：① `validatePassword` 强度校验 ② `bcrypt.hash(password, 10)` 哈希存储 |
| 前端 | `client/src/api/users.ts:42` 仅暴露 `updateUser(id, input)`，无 `changeMyPassword(oldPwd, newPwd)` API |
| UI 入口 | `client/src/app/components/ui/sidebar.tsx` 用户菜单**无** "修改密码" 选项 |
| "忘记密码" | `client/src/app/pages/ForgotPasswordPage.tsx` **纯前端 mock** — `setTimeout(1500)` 后显示"邮件已发送"，后端无对应路由、无邮件服务、无 token 表 |
| 数据库 | `server/prisma/schema.prisma:13-27` `model User` 无 `email` / `passwordChangedAt` / `failedLoginAttempts` / `lockUntil` 等字段 |

### 1.2 触达痛点（Pains）

| # | 痛点 | 影响范围 |
|---|---|---|
| P1 | 普通用户忘记密码后**只能找 ADMIN 重置**，流程被打断 | 所有 GROUP_LEAD / MEMBER |
| P2 | 怀疑账号泄露需要紧急改密时，必须联系 ADMIN；存在串扰管理员账号风险 | 安全风险 |
| P3 | "强制定期改密" / "首次登录改密" 等 GSP 密码卫生要求**代码层无法支撑** | GSP 05805 / 05901 合规缺口 |
| P4 | `ForgotPasswordPage` 是 mock，会员误以为支持，引发客服投诉 | 体验损伤 |
| P5 | ADMIN 可看/可改所有人密码（含 ADMIN 互相），没有最小权限分离 | 审计盲区 |

### 1.3 期望目标（To-Be）

**让每个已登录用户可独立修改自己的密码，且与现有 ADMIN 改密能力互不干涉，同时为后续 GSP 合规强改 / 定期改密 / 忘记密码邮件流程打下基础。**

---

## 2. 业务目标与成功度量（Success Metrics）

| 编号 | 目标 | 关键结果 | 度量口径 |
|---|---|---|---|
| G1 | 用户可自助改密，无需 ADMIN 介入 | 改密端点日调用中，非 ADMIN 用户占比 > 50% | `activity_log.eventType='USER_CHANGE_PASSWORD' && actorUserRole != 'ADMIN'` |
| G2 | 改密后旧会话即时失效 | 修改后 5s 内调用旧 JWT 必返回 401 | 自动化测试 / 日志 |
| G3 | 改密行为全过程留痕 | 每条改密操作有审计字段 + 活动日志 | `server.log` + `ActivityLog` |
| G4 | 改密后 ADMIN 强改密码行为仍可用 | ADMIN 改密路径不重构，仅调整位置 | 回归测试 |

---

## 3. 用户故事（User Stories）

### US-1：登录用户主动改密
> **作为** 一个已登录的普通用户（GROUP_LEAD / MEMBER），  
> **我希望** 通过"右上角头像 → 修改密码"打开表单，填入旧密码 + 新密码 + 确认新密码后保存，  
> **以便于** 怀疑密码泄露时立即加固，无需找 ADMIN。

**验收标准**
- AC-1.1：菜单入口存在并对所有登录用户可见
- AC-1.2：旧密码错误时返回 400 + 文案"当前密码不正确"，旧/新密码字段保留输入
- AC-1.3：新密码不达 8 位 + 大写 + 小写 + 数字 → 400 + 字段级错误提示
- AC-1.4：新密码 ≠ 确认密码 → 字段级错误
- AC-1.5：新密码 = 旧密码 → 字段级提示（不允许相同）
- AC-1.6：保存成功后提示"密码已修改，请重新登录"，JWT 失效并跳转 `/login`
- AC-1.7：审计日志写入 `ActivityLog`

### US-2：忘记密码（基础版，v1）
> **作为** 忘记了密码的用户，  
> **我希望** 通过 "忘记密码" 页面输入 username，由 ADMIN 在后台发起密码重置（v1 邮件流依赖 `email` 字段建模，列入 v1.1）。

**验收标准（v1 含）**
- AC-2.1：`POST /api/auth/forgot-password` 接收 `username`，对所有用户一视同仁返回 200（防止枚举）
- AC-2.2：若 username 存在且配置了 ADMIN 邮箱，由后端产生一次性 reset token（**v1.1** 通过站内信 / **v2** 通过 SMTP）
- AC-2.3：**本 BRD v1 仅承诺**：完成"自助改密"+"ADMIN 控制台搜索 username 后代为重置一条初始密码"两条路径；真正的忘记密码邮件流程放在 `02-密码自助找回 BBR` v1.1

### US-3：ADMIN 重置任意用户密码（保留旧能力）
> **作为** 一个 ADMIN，  
> **我希望** 继续在 `团队管理 → 用户` 下重置别人的密码，无需自己输入旧密码。

**验收标准**
- AC-3.1：原 `team-management` 的"修改用户 → 密码"输入框仍工作
- AC-3.2：ADMIN 重置后，`ActivityLog` 同时记录"由 ADMIN X 重置 Y 密码"，actor=ADMIN，target=user

### US-4：可观测性
> **作为** 系统管理员 / 审计人员，  
> **我希望** 在活动日志里能查到"谁在什么时间改过谁的密码"。

**验收标准**
- AC-4.1：`ActivityLog.eventType` 枚举新增 `USER_CHANGE_PASSWORD`、`ADMIN_RESET_PASSWORD`
- AC-4.2：列表展示 actor / target / time，不展示明文密码

---

## 4. 业务规则

| 编号 | 规则 | 说明 |
|---|---|---|
| BR-1 | 改密必须验证旧密码（自助场景） | 防已登录会话被劫持后被篡改密码 |
| BR-2 | 新密码强度：`≥ 8 位 + 大写 + 小写 + 数字` | 与现有 `validatePassword` 一致，**禁止放宽** |
| BR-3 | 新密码 ≠ 旧密码 | 防"改密"流于形式 |
| BR-4 | 改密成功后旧 JWT 立即失效 | 避免被盗用会话配合新密码继续访问 |
| BR-5 | ADMIN 重置密码不需要原密码 | v1 保留 ADMIN 通道 |
| BR-6 | ADMIN 重置会触发目标用户 **下次登录强制改密** | 通过 `requirePasswordChange=true` 标志位（v1.1 落地，本 BRD 在数据建模时预留字段） |
| BR-7 | 同一用户 1 分钟内最多 3 次改密尝试（含失败） | 通过 `rate-limit` 中间件 |
| BR-8 | 失败 5 次锁定账户 15 分钟 | 走 `failedLoginAttempts` / `lockUntil` 字段（v1.1 引入，本 BRD 数据建模时一并加列） |
| BR-9 | 改密行为不可逆；不暴露"是否曾使用过的密码" | 仅写哈希，不存历史 |
| BR-10 | 活动日志记录 actor / target / time / ip，不记录明文密码 | 满足 GSP 05805 / 04001 审计追踪 |

---

## 5. 范围（Scope）

### 5.1 In Scope（v1 本期交付）

- 自助改密 API（需要旧密码）
- 自助改密前端页 / 弹窗 + 用户菜单入口
- 改密失败审计日志 + 改密成功审计日志
- ADMIN 控制台改密路径保留 + 行为可追溯
- 数据库扩展：`User.mustChangePassword`、`User.passwordChangedAt`、`User.lastPasswordChangeActor`
- 改密成功后旧 JWT 自动失效（`tokenVersion` / 黑名单 任选其一）
- 单元测试 / 集成测试 / 契约测试

### 5.2 Out of Scope（v1 不做）

- 邮件通知改密结果（无 SMTP 服务、无邮件配置）
- 通过邮箱真实"忘记密码"邮件流（需要 User.email 字段、邮件服务、reset token 表 — v1.1）
- 短信验证 / 双因子认证
- 历史密码去重（防同密码循环使用）
- LDAP / SSO 同步改密

---

## 6. 假设与依赖

| 项 | 描述 |
|---|---|
| AS-1 | 后端 `bcryptjs` v2.4.3 已稳定使用，沿用 `bcrypt.hash(x, 10)` |
| AS-2 | 后端保持 Hono 4 + Prisma 6 + JWT 7d 签发不变；通过 `tokenVersion` 让旧 token 失效 |
| AS-3 | 前端技术栈 React 19 + MUI v7 + Radix 不变 |
| AS-4 | 已部署 PostgreSQL 15 + pgvector 容器 |
| DP-1 | 依赖 Prisma 迁移能力 `pnpm prisma:migrate` |
| DP-2 | 依赖现有 `ActivityLog` 模型（已存在 — 见 `schema.prisma` 全局搜索） |
| DP-3 | 依赖前端 `sonner` toast 组件 |
| DP-4 | 依赖全局 `JWT_SECRET` 环境变量已配置 |

---

## 7. 风险与缓解

| 编号 | 风险 | 等级 | 缓解策略 |
|---|---|---|---|
| R-1 | 修改密码导致所有前端标签页立即失效 → 用户体验骤然丢失 | 中 | 改密成功 Toast 后延迟 1.5s 再登出，给后端审计足够时间落库 |
| R-2 | `tokenVersion` 失效造成管理后台移动端报错风暴 | 中 | 移动端（巴枪 / Pad）当前不依赖本系统，留空 — 与本 PR 无关 |
| R-3 | 旧会话写入新密码时被劫持 | 低 | BR-1 + JWT 7d 短期，配合 tokenVersion 即时失效 |
| R-4 | ADMIN 重置密码后原 `passwordHash` 不强制目标用户改密 | 中 | DB 字段 `mustChangePassword=true` 即可，登录后路由拦截（本 BRD 落字段；路由拦截放入 v1.1） |
| R-5 | PR 与前端用户菜单已有"退出登录"共存冲突 | 低 | 改密流程独立，对菜单不构成侵入 |

---

## 8. 验收一览（Definition of Done）

| 校验项 | 通过标志 |
|---|---|
| 后端编译 | `cd /root/WMOS 设计工场/WMS需求管理平台/server && pnpm build` 退出码 0 |
| 前端编译 | `cd /root/WMOS 设计工场/WMS需求管理平台/client && pnpm build` 退出码 0 |
| Prisma 迁移 | `pnpm prisma:migrate` 成功，新增字段入列 |
| 集成测试 | 用户自助改密流程 Playwright/Supertest 通过 |
| 审计日志 | 改密前后 `ActivityLog` 有对应行 |
| 回归 | ADMIN 控制台原改密路径不破坏 |
| 文档 | BRD / FSD / PRD / 06-开发设计说明书齐备，本仓 `docs/` 内索引更新 |

---

## 9. 参考

- 用户现状梳理：`server/src/routes/users.routes.ts:77-86`
- 服务层实现：`server/src/services/user.service.ts:5-10`（强度校验）+ `:95-99`（bcrypt）
- 鉴权中间件：`server/src/middleware/auth.ts:11-66`
- 用户模型：`server/prisma/schema.prisma:13-27`
- API 层：`client/src/api/users.ts:42-44`
- 占位页面：`client/src/app/pages/ForgotPasswordPage.tsx:12-21`
- 全局 CLAUDE（设计规范）：`/root/.claude/CLAUDE.md`
