-- Add permission management tables (PermissionGroup + Permission + Resource + joins)
-- 2026-06-15 — Permission Management feature
--
-- Adds 5 tables:
--   PermissionResource      : registry of menus/pages/buttons
--   Permission              : permission point (resource × action)
--   PermissionGroup         : permission group (PG), bindable to role/group/user
--   PermissionGroupItem     : PG ↔ Permission many-to-many
--   UserPermissionGroup     : User ↔ PG many-to-many
--
-- ADMIN 隐式超管 — admin role bypasses these tables in authMiddleware.
-- Existing 5 tables (User/Role/Group) untouched.

-- PermissionResource: 资源注册表
CREATE TABLE "PermissionResource" (
  "id"           SERIAL PRIMARY KEY,
  "code"         TEXT NOT NULL UNIQUE,
  "type"         TEXT NOT NULL,                -- 'MENU' | 'PAGE' | 'BUTTON'
  "parent_code"  TEXT,
  "display_name" TEXT NOT NULL,
  "path"         TEXT,
  "icon"         TEXT,
  "sort_order"   INTEGER NOT NULL DEFAULT 0,
  "enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "PermissionResource_type_idx" ON "PermissionResource" ("type");
CREATE INDEX "PermissionResource_parent_code_idx" ON "PermissionResource" ("parent_code");

-- Permission: 权限点
CREATE TABLE "Permission" (
  "id"            SERIAL PRIMARY KEY,
  "code"          TEXT NOT NULL UNIQUE,
  "resource_code" TEXT NOT NULL REFERENCES "PermissionResource"("code") ON DELETE CASCADE,
  "action"        TEXT NOT NULL,               -- 'view' | 'create' | 'update' | 'delete' | 'export' | 'approve' | 'manage'
  "display_name"  TEXT NOT NULL,
  "description"   TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "Permission_resource_code_idx" ON "Permission" ("resource_code");

-- PermissionGroup: 权限组
CREATE TABLE "PermissionGroup" (
  "id"              SERIAL PRIMARY KEY,
  "name"            TEXT NOT NULL UNIQUE,
  "display_name"    TEXT NOT NULL,
  "description"     TEXT,
  "bind_role"       TEXT,
  "bind_group_name" TEXT,
  "enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order"      INTEGER NOT NULL DEFAULT 0,
  "is_system"       BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "PermissionGroup_bind_role_idx" ON "PermissionGroup" ("bind_role");
CREATE INDEX "PermissionGroup_bind_group_name_idx" ON "PermissionGroup" ("bind_group_name");

-- PermissionGroupItem: PG ↔ Permission 多对多
CREATE TABLE "PermissionGroupItem" (
  "permission_group_id" INTEGER NOT NULL REFERENCES "PermissionGroup"("id") ON DELETE CASCADE,
  "permission_id"       INTEGER NOT NULL REFERENCES "Permission"("id")       ON DELETE CASCADE,
  PRIMARY KEY ("permission_group_id", "permission_id")
);
CREATE INDEX "PermissionGroupItem_permission_id_idx" ON "PermissionGroupItem" ("permission_id");

-- UserPermissionGroup: User ↔ PG 多对多
CREATE TABLE "UserPermissionGroup" (
  "user_id"             INTEGER NOT NULL REFERENCES "User"("id")             ON DELETE CASCADE,
  "permission_group_id" INTEGER NOT NULL REFERENCES "PermissionGroup"("id") ON DELETE CASCADE,
  PRIMARY KEY ("user_id", "permission_group_id")
);
CREATE INDEX "UserPermissionGroup_user_id_idx" ON "UserPermissionGroup" ("user_id");
