# 02 · 功能规格说明书 FSD — 用户自助修改密码

> 文档版本：v1.0.0
> 编写日期：2026-07-29
> 上游 BRD：`./01-业务需求文档 BRD.md`
> 适用范围：`Req Platform` 全栈（server / client / prisma）

---

## 1. 架构概览

```
┌────────────────────────────────────────────────────────────────────┐
│                         Client (React 19)                          │
│  ┌──────────────────────┐    ┌───────────────────────────────────┐  │
│  │ UserMenu (sidebar)  │───▶│ ChangePasswordDialog              │  │
│  │ "修改密码" 入口     │    │  当前密码 / 新密码 / 确认密码       │  │
│  └──────────────────────┘    └─────────────────┬─────────────────┘  │
│                                                │                    │
│  ┌─────────────────────────────────────────────▼───────────────┐  │
│  │  api/users.ts — changeMyPassword(currentPwd, newPwd)        │  │
│  └────────────────────────────────┬────────────────────────────┘  │
└───────────────────────────────────┼────────────────────────────────┘
                                    │  Bearer JWT
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Server (Hono 4)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  middleware/auth.ts                                          │  │
│  │   - JWT verify → userId / tokenVersion                       │  │
│  │   - if jwt.tokenVersion !== user.tokenVersion → 401          │  │
│  └─────────────────────┬────────────────────────────────────────┘  │
│                        ▼                                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  routes/me.routes.ts  (新增)                                 │  │
│  │   POST /api/me/password  — any authenticated user           │  │
│  │   POST /api/me/logout    — best-effort revoke                │  │
│  └─────────────────────┬────────────────────────────────────────┘  │
│                        ▼                                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  services/user.service.ts                                    │  │
│  │   changeMyPassword(userId, currentPwd, newPwd)               │  │
│  │     1) findUnique user                                       │  │
│  │     2) bcrypt.compare(currentPwd, passwordHash)              │  │
│  │     3) validatePassword(newPwd) + mustDifferFrom(current)    │  │
│  │     4) bcrypt.hash(newPwd,10) → passwordHash                │  │
│  │     5) user.update({                                        │  │
│  │          passwordHash,                                       │  │
│  │          tokenVersion: { increment: 1 },                     │  │
│  │          passwordChangedAt: now                             │  │
│  │       })                                                     │  │
│  │     6) ActivityLog.insert(...)                               │  │
│  │     7) invalidatePermissionCache(userId)                    │  │
│  └─────────────────────┬────────────────────────────────────────┘  │
│                        ▼                                            │
│           ┌──────────────────────┐                                 │
│           │   PostgreSQL 15      │                                 │
│           │   prisma.user        │                                 │
│           │   + token_version    │                                 │
│           │   + password_changed_at                                    │
│           │   + must_change_password                                   │
│           │   + last_pwd_change_actor                                      │
│           │   + failed_login_attempts                                       │
│           │   + lock_until                                                     │
│           └──────────────────────┘                                              │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据库变更（Prisma）

### 2.1 `model User` 字段扩展

在 `server/prisma/schema.prisma` `model User { ... }` 内追加：

```prisma
model User {
  // ... 现有字段 ...

  // ── 密码卫生 / 安全（v1.0.0）──
  tokenVersion          Int       @default(0)      @map("token_version")
  passwordChangedAt     DateTime? @map("password_changed_at")
  lastPasswordChangeActor String?  @map("last_pwd_change_actor") // 用户名，ADMIN 重置时记录

  // ── 为 v1.1 / GSP 留口（本期落字段但未消费）──
  mustChangePassword    Boolean   @default(false)  @map("must_change_password")
  failedLoginAttempts   Int       @default(0)      @map("failed_login_attempts")
  lockUntil             DateTime? @map("lock_until")

  // ... 现有 relation 保持 ...
}
```

| 字段 | 类型 | 默认 | 用途 | 本期是否消费 |
|---|---|---|---|---|
| `tokenVersion` | `Int @default(0)` | 0 | 改密即 +1，旧 JWT 立即失效 | ✅ |
| `passwordChangedAt` | `DateTime?` | null | 上次改密时间，配合定期改密策略 | ✅（写，不读） |
| `lastPasswordChangeActor` | `String?` | null | "由谁重置" 痕迹 | ✅ |
| `mustChangePassword` | `Boolean @default(false)` | false | ADMIN 重置后强制下次登录改密 | ⏳ 字段预留，消费代码 v1.1 |
| `failedLoginAttempts` | `Int @default(0)` | 0 | 失败计数 + 锁定 | ⏳ v1.1 |
| `lockUntil` | `DateTime?` | null | 锁定到期时间 | ⏳ v1.1 |

### 2.2 `model ActivityLog` 复用现有

> `server/prisma/schema.prisma` 已存在 `ActivityLog` 模型，本期新增两个 `eventType` 枚举值。

| eventType 值 | actor | payload（示例 JSON） |
|---|---|---|
| `USER_CHANGE_PASSWORD` | 当前用户 self | `{ source: "self" }` |
| `ADMIN_RESET_PASSWORD` | ADMIN | `{ targetUserId, targetUsername }` |
| `PASSWORD_CHANGE_REJECTED` | 当前用户 self | `{ reason: "OLD_MISMATCH" \| "TOO_WEAK" \| "SAME_AS_OLD" }` |

### 2.3 迁移脚本（Prisma Migration）

由 `pnpm prisma migrate dev --name add_password_change_tracking` 自动生成。
在迁移后由脚本同步至 `server/prisma/schema.sql`：

```bash
bash scripts/regenerate-schema-sql.sh
bash scripts/check-schema-sync.sh   # 必须 ✅
```

---

## 3. API 契约

### 3.1 `POST /api/me/password` — 用户自助改密

> 任何已认证用户皆可调用；与 ADMIN 角色无关。

**Request**

```http
POST /api/me/password HTTP/1.1
Host: api.example.com
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "currentPassword": "OldPass#2026",
  "newPassword":     "NewPass#2027",
  "confirmPassword": "NewPass#2027"
}
```

**Response — 200 OK**

```json
{
  "ok": true,
  "passwordChangedAt": "2026-07-29T08:30:00.000Z",
  "message": "密码已修改，请重新登录"
}
```

**Response — 400 Bad Request（字段级）**

| 场景 | errorCode | HTTP | message |
|---|---|---|---|
| 缺字段 | `MISSING_FIELD` | 400 | `缺少必填字段: currentPassword` |
| 旧密码错 | `OLD_PASSWORD_MISMATCH` | 400 | `当前密码不正确` |
| 新密码 < 8 位 | `WEAK_PASSWORD_LENGTH` | 400 | `密码长度不能少于8位` |
| 缺大写 | `WEAK_PASSWORD_UPPERCASE` | 400 | `密码必须包含大写字母` |
| 缺小写 | `WEAK_PASSWORD_LOWERCASE` | 400 | `密码必须包含小写字母` |
| 缺数字 | `WEAK_PASSWORD_DIGIT` | 400 | `密码必须包含数字` |
| 新=旧 | `PASSWORD_UNCHANGED` | 400 | `新密码不能与旧密码相同` |
| 新 ≠ 确认 | `CONFIRM_MISMATCH` | 400 | `两次输入的新密码不一致` |

**Response — 401 Unauthorized**

| 场景 | errorCode |
|---|---|
| 未携带 JWT | `NO_AUTH` |
| JWT 无效/过期 | `INVALID_TOKEN` |
| JWT 与 `user.tokenVersion` 不一致 | `TOKEN_REVOKED` |

**Response — 429 Too Many Requests**

```json
{ "error": "操作过于频繁，请 1 分钟后重试", "retryAfter": 45 }
```

> 节流：单用户 1 分钟内 3 次（不论成败）；继承项目内 `server/src/middleware/rate-limit.ts` 风格。

---

### 3.2 `POST /api/me/logout` — best-effort 失效

> **非必选**。改密成功后**主要是客户端丢弃 token**（localStorage.removeItem）。
> 后端这里给一个**软**失效接口：仅作审计用，下次该 token 调任意受保护接口时因 tokenVersion 不匹配自动 401。

```http
POST /api/me/logout HTTP/1.1
Authorization: Bearer <JWT>
```

```json
{ "ok": true }
```

---

### 3.3 `PUT /api/users/:id/password` — ADMIN 代为重置（新增端点）

> 保留原 `PUT /api/users/:id` 能力不变；**新增**独立端点以表达"代为重置"。
> ADMIN 调用此端点时无需原密码，但必须满足 BR-2 强度校验。

**Request**

```http
PUT /api/users/:id/password HTTP/1.1
Authorization: Bearer <ADMIN-JWT>
Content-Type: application/json

{ "newPassword": "TempPass#2026" }
```

**行为差异（vs `PUT /:id`）**

| 项 | `PUT /api/users/:id`（保留） | `PUT /api/users/:id/password`（新增） |
|---|---|---|
| 需要旧密码 | 否（admin 不传） | 否（admin 特权） |
| 写 `lastPasswordChangeActor` | 否 | 是（写 admin username） |
| 写 `mustChangePassword` | 否 | 是（设 true） |
| `tokenVersion` +1 | 否（不变） | 是（强制目标下次重登） |
| 写 `ActivityLog` | 通用 "updateUser" | `ADMIN_RESET_PASSWORD` |

---

## 4. 鉴权与会话失效

### 4.1 JWT Payload 扩展

```ts
// server/src/middleware/auth.ts
export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  groupName: string | null;
  tokenVersion: number;   // ← 新增
}
```

签发位置：`authMiddleware` 写入 → `generateToken(payload)` 中保存。
**所有现有 token** 在用户首次"重登"之后自动携带 `tokenVersion=0`，兼容。

### 4.2 鉴权流水线

```
jwt.verify(token)
   └─ decoded = { userId, tokenVersion, ... }
c.set("userId", decoded.userId)
c.set("tokenVersion", decoded.tokenVersion)
next()
   ↓
[下游 route handler]
   ↓
prisma.user.findUnique({ where:{id:decoded.userId}, select:{tokenVersion:true,isActive:true} })
   ↓
if (user.tokenVersion !== decoded.tokenVersion) → 401 TOKEN_REVOKED
   ↓
if (!user.isActive) → 403 USER_DISABLED
```

> **优化**：把 `user.tokenVersion` 注入 `authMiddleware` 自身，避免每个 route 多一次 DB。
> `authMiddleware` 取一次 `prisma.user` 拉 `tokenVersion + isActive`，注入 ctx；其余路由无需再查。

### 4.3 缓存失效

`server/src/services/permission-cache.service.ts` 已存在：
改密成功后调 `invalidatePermissions(userId)`。

---

## 5. 服务层代码骨架（不生产最终代码，仅契约）

`server/src/services/user.service.ts` 新增：

```ts
export interface ChangeOwnPasswordInput {
  userId: number;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;   // 服务层做二次校验，客户端提前校验
}

export interface ResetPasswordByAdminInput {
  targetUserId: number;
  adminUsername: string;     // 来自 c.get("username")
  newPassword: string;
}

export async function changeMyPassword(input: ChangeOwnPasswordInput): Promise<{ passwordChangedAt: Date }>
export async function resetPasswordByAdmin(input: ResetPasswordByAdminInput): Promise<void>
```

详细断言顺序：
1. `input.confirmPassword === input.newPassword` → 否则 `CONFIRM_MISMATCH`
2. `findUnique(userId)` 取 `passwordHash`
3. `bcrypt.compare(currentPassword, hash)` → 否则 `OLD_PASSWORD_MISMATCH`
4. `validatePassword(newPassword)` → 否则抛对应强度错误
5. `newPassword !== currentPassword` → `PASSWORD_UNCHANGED`
6. `prisma.user.update({ where:{id}, data:{ passwordHash, tokenVersion:{ increment:1 }, passwordChangedAt:new Date(), lastPasswordChangeActor:username }})` — 在事务里
7. `ActivityLog.insert({ eventType:'USER_CHANGE_PASSWORD', actorUserId:userId })`
8. `invalidatePermissions(userId)`

---

## 6. 前端规格

### 6.1 用户菜单入口（`client/src/app/components/ui/sidebar.tsx` 用户区段）

新增菜单项：

| Label | Icon | onClick | 可见性 |
|---|---|---|---|
| 修改密码 | `KeyRound` | `openChangePasswordDialog()` | 所有登录用户 |
| 退出登录 | `LogOut` | `logout()` | 所有登录用户 |

逻辑：

```tsx
const [showChangePwd, setShowChangePwd] = useState(false);
// ...
<DropdownMenuItem onClick={() => setShowChangePwd(true)}>
  <KeyRound size={16} className="mr-2" />
  修改密码
</DropdownMenuItem>
<ChangePasswordDialog open={showChangePwd} onOpenChange={setShowChangePwd} />
```

### 6.2 `ChangePasswordDialog` 组件

> 位置：`client/src/app/components/ChangePasswordDialog.tsx`
> 依赖：项目内 `Dialog` / `Input` / `Button` / `sonner` toast
> 表单库：暂沿用受控 state（避免引入 RHF 范围蔓延）

字段：

| name | type | required | 校验 | visible strength meter |
|---|---|---|---|---|
| `currentPassword` | password | ✅ | 服务端校（401/400） | — |
| `newPassword` | password | ✅ | client + server | ✅（5 段强度条） |
| `confirmPassword` | password | ✅ | == newPassword | — |

行为：
1. 提交触发 `api/users.ts:changeMyPassword(...)`
2. 200 → toast.success + `localStorage.removeItem('authToken')` + `navigate('/login')`
3. 4xx → 字段级 toast / inline error；不让按钮长期 spin
4. 401 `TOKEN_REVOKED` → 同样清 token + 跳登录（即便客户端不该再撞到）

### 6.3 API 层

`client/src/api/users.ts` 新增：

```ts
export interface ChangeOwnPasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangeOwnPasswordResult {
  ok: true;
  passwordChangedAt: string;
  message: string;
}

export async function changeMyPassword(input: ChangeOwnPasswordInput): Promise<ChangeOwnPasswordResult> {
  return http.post('/me/password', input);
}
```

> 不复用 `updateUser`：避免误导调用者以为它能改任意字段。

### 6.4 全局拦截器（401 自动登出）

`client/src/api/http.ts` 现有 `interceptor` 增加：

```ts
http.interceptors.response.use(
  res => res,
  err => {
    const code = err?.response?.data?.errorCode;
    if (code === 'TOKEN_REVOKED' || code === 'INVALID_TOKEN' || err.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);
```

---

## 7. 错误码全集

| errorCode | 含义 | 触发场景 |
|---|---|---|
| `NO_AUTH` | 未携带 Bearer | 任何受保护接口 |
| `INVALID_TOKEN` | JWT 校验失败 | 过期 / 篡改 / 格式错 |
| `TOKEN_REVOKED` | tokenVersion 不匹配 | 改密后 / ADMIN 重置后 |
| `USER_DISABLED` | `isActive=false` | 用户被 ADMIN 停用 |
| `MISSING_FIELD` | 缺字段 | 改密 / 重置 |
| `OLD_PASSWORD_MISMATCH` | 旧密码错 | 自助改密 |
| `WEAK_PASSWORD_*` | 强度不足 | 自助 + ADMIN 重置 |
| `PASSWORD_UNCHANGED` | 新=旧 | 自助改密 |
| `CONFIRM_MISMATCH` | 两次新密码不一致 | 自助改密 |
| `RATE_LIMITED` | 限流 | 改密 / 登录 |
| `INTERNAL` | 服务端兜底 | 500 |

---

## 8. 字段与审计对账表

> 满足 GSP 05805（计算机系统 / 审计追踪）/ 06009（数据授权）/ 04001-04003（更改留痕）。

| 行为 | actor | 写入字段 | 写入 ActivityLog | 备注 |
|---|---|---|---|---|
| 自助改密成功 | 自己 | `passwordHash` / `tokenVersion+1` / `passwordChangedAt` / `lastPasswordChangeActor=username` | `USER_CHANGE_PASSWORD`（payload `{ source:'self' }`） | 同时失效权限缓存 |
| 自助改密失败 | 自己 | — | `PASSWORD_CHANGE_REJECTED`（payload `{ reason }`） | reason ∈ OLD_MISMATCH / WEAK / SAME_AS_OLD |
| ADMIN 重置 | ADMIN | `passwordHash` / `tokenVersion+1` / `passwordChangedAt` / `lastPasswordChangeActor='admin:<username>'` / `mustChangePassword=true` | `ADMIN_RESET_PASSWORD`（payload `{ targetUserId, targetUsername }`） | 同时失效权限缓存 |

---

## 9. 安全要点

| 编号 | 要点 | 实现位置 |
|---|---|---|
| S-1 | HTTP 头不写入 `Cache-Control: no-store`（密码响应是非缓存） | express → 通过 `c.header('Cache-Control','no-store')` |
| S-2 | bcrypt cost 维持 10（不升级避免旧 hash 不匹配） | user.service |
| S-3 | 限流：1min / 3 次（基于 userId） | `middleware/rate-limit.ts` 新增 `changePasswordLimiter` |
| S-4 | 不写日志明文密码 | logger 配置 |
| S-5 | 改密接口禁用爬虫（`User-Agent: *bot*`） | 复用现有 CSRF/UA 防护 |
| S-6 | 不在前端 localStorage 之外留存密码字段 | 表单组件 `unmount` 时 reset |

---

## 10. 测试矩阵

> 验证标准：本仓 "verification-before-completion" 铁律（IDENTIFY → RUN → READ → VERIFY → THEN）。

| # | 类型 | 用例 | 通过标准 |
|---|---|---|---|
| T1 | build | `pnpm --filter server build` | 退出码 0 |
| T2 | build | `pnpm --filter client build` | 退出码 0 |
| T3 | migrate | `pnpm prisma migrate dev` | 新增字段入列 |
| T4 | unit | `validatePassword` 强度矩阵 | 7/7 通过 |
| T5 | unit | `changeMyPassword` 强度流程 | 8/8 通过 |
| T6 | integ | 旧密码错误 → 400 `OLD_PASSWORD_MISMATCH` | OK |
| T7 | integ | 新=旧 → 400 `PASSWORD_UNCHANGED` | OK |
| T8 | integ | 成功后旧 token → 401 `TOKEN_REVOKED` | OK |
| T9 | integ | ADMIN 重置 → 目标 `mustChangePassword=true` | OK |
| T10 | integ | 限流：1min 第 4 次 → 429 | OK |
| T11 | e2e | 浏览器侧：菜单 → 表单 → 提交 → 自动登出 | Playwright OK |
| T12 | audit | ActivityLog 含 3 种 eventType 行 | OK |

---

## 11. 上线 CheckList

| 项 | 命令 | 通过标准 |
|---|---|---|
| 后端编译 | `cd server && pnpm build` | `dist/` 产物 OK |
| 前端编译 | `cd client && pnpm build` | `dist/` 产物 OK |
| DB 迁移 | `pnpm prisma:migrate` | 字段入列 |
| schema 同步 | `bash scripts/check-schema-sync.sh` | ✅ |
| 集成测试 | `pnpm --filter server test` | 全绿 |
| 一键验证 | `bash /root/WMOS\ 设计工场/scripts/quick-verify.sh` | 全绿 |

---

## 12. 反向兼容与回滚

| 维度 | 设计 |
|---|---|
| 旧 JWT 兼容 | 旧 token 没有 `tokenVersion` 字段 → 默认按 `0` 对比，对未改密用户不变；对已改密用户立即失效（**预期行为**：用户改密后必须重新登录） |
| 旧路由兼容 | `PUT /api/users/:id` 仍可工作（admin 改资料 / 密码的整套场景），仅在调用时**不** ++ tokenVersion，不写 `ActivityLog`。是否给"调用即触发 ++ tokenVersion" 由后续 PR 决策 |
| DB 回滚 | Migration 文件可 `migrate resolve --rolled-back` 回滚；不影响其他业务 |
| 紧急止血 | 路由 `POST /api/me/password` 临时返回 503（一行 route handler 即可），无副作用 |

---

## 13. 参考

- BRD：`./01-业务需求文档 BRD.md`
- 现有服务：`/root/WMOS 设计工场/WMS需求管理平台/server/src/services/user.service.ts`
- 现有路由：`/root/WMOS 设计工场/WMS需求管理平台/server/src/routes/users.routes.ts`
- 鉴权：`/root/WMOS 设计工场/WMS需求管理平台/server/src/middleware/auth.ts`
- 限流：`/root/WMOS 设计工场/WMS需求管理平台/server/src/middleware/rate-limit.ts`
- 数据模型：`/root/WMOS 设计工场/WMS需求管理平台/server/prisma/schema.prisma`
- 前端 API：`/root/WMOS 设计工场/WMS需求管理平台/client/src/api/users.ts`
- 用户菜单：`/root/WMOS 设计工场/WMS需求管理平台/client/src/app/components/ui/sidebar.tsx`
- 全局铁律：`/root/.claude/CLAUDE.md` "verification-before-completion"
