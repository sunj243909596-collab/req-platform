// 权限管理页（ADMIN）
import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  Search,
  Check,
  RotateCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listPermissionGroups,
  getPermissionGroup,
  createPermissionGroup,
  updatePermissionGroup,
  deletePermissionGroup,
  setGroupPermissions,
  setGroupMembers,
  listAdminUsers,
  listAdminResources,
  listAllPermissions,
  invalidatePermissionCache,
  type PgSummary,
  type PgDetail,
  type PermissionResource,
  type Permission,
  type UserOption,
} from '../../../api/permissions';
import { permissionStore } from '../../../stores/permission';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理员',
  GROUP_LEAD: '组长',
  MEMBER: '成员',
};

export function PermissionsSettings() {
  const [groups, setGroups] = useState<PgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    displayName: '',
    description: '',
    bindRole: '',
  });

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await listPermissionGroups();
      setGroups(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('标识不能为空');
      return;
    }
    if (!createForm.displayName.trim()) {
      toast.error('显示名不能为空');
      return;
    }
    setCreating(true);
    try {
      await createPermissionGroup({
        name: createForm.name.trim(),
        displayName: createForm.displayName.trim(),
        description: createForm.description || undefined,
        bindRole: createForm.bindRole || undefined,
      });
      toast.success('权限组已创建');
      setShowCreate(false);
      setCreateForm({ name: '', displayName: '', description: '', bindRole: '' });
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (pg: PgSummary) => {
    if (pg.isSystem) {
      toast.error('系统内置权限组不可删除');
      return;
    }
    if (pg.memberCount > 0) {
      toast.error('请先解绑该组下的用户');
      return;
    }
    if (!window.confirm(`确定删除权限组「${pg.displayName}」吗？`)) return;
    try {
      await deletePermissionGroup(pg.id);
      toast.success('已删除');
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleEdit = (pg: PgSummary) => {
    setEditingId(pg.id);
  };

  const handleSaved = () => {
    setEditingId(null);
    fetchGroups();
  };

  return (
    <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[var(--ink)] flex items-center gap-2">
            <ShieldCheck size={18} />
            权限组管理
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted-80)]">
            配置权限组及其绑定的权限点和成员。每个权限组可绑定多个权限点。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95"
        >
          <Plus size={18} /> <span>新建权限组</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-[var(--ink-muted-80)]">
          <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
          <p className="mb-2">暂无权限组</p>
          <p className="text-sm">点击「新建权限组」开始创建</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--ink-muted-80)] border-b border-[var(--hairline)]">
              <tr>
                <th className="py-2.5 px-3 font-medium">名称</th>
                <th className="py-2.5 px-3 font-medium">绑定角色</th>
                <th className="py-2.5 px-3 font-medium">绑定组</th>
                <th className="py-2.5 px-3 font-medium text-right">权限数</th>
                <th className="py-2.5 px-3 font-medium text-right">成员数</th>
                <th className="py-2.5 px-3 font-medium">状态</th>
                <th className="py-2.5 px-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--canvas-parchment)]/40">
                  <td className="py-3 px-3">
                    <div className="font-medium text-[var(--ink)]">{g.displayName}</div>
                    <div className="text-xs text-[var(--ink-muted-80)] font-mono">{g.name}</div>
                    {g.description && (
                      <div className="text-xs text-[var(--ink-muted-80)] mt-0.5 line-clamp-1">{g.description}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-[var(--ink-muted-80)]">
                    {g.bindRole ? ROLE_LABELS[g.bindRole] || g.bindRole : <span className="opacity-40">—</span>}
                  </td>
                  <td className="py-3 px-3 text-[var(--ink-muted-80)] font-mono text-xs">
                    {g.bindGroupName || <span className="opacity-40">—</span>}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">{g.permissionCount}</td>
                  <td className="py-3 px-3 text-right font-mono">{g.memberCount}</td>
                  <td className="py-3 px-3">
                    {g.isSystem ? (
                      <span className="px-2 py-0.5 bg-[#e3f2fd] text-[#1565c0] rounded-full text-xs">内置</span>
                    ) : g.enabled ? (
                      <span className="px-2 py-0.5 bg-[#d4edda] text-[#155724] rounded-full text-xs">启用</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-[#f8d7da] text-[#721c24] rounded-full text-xs">禁用</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(g)}
                        className="p-1.5 text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                        title="编辑权限和成员"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(g)}
                        disabled={g.isSystem}
                        className="p-1.5 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={g.isSystem ? '系统内置不可删' : '删除'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 创建弹窗 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[var(--ink)] flex items-center gap-2">
                <ShieldCheck size={18} /> 新建权限组
              </h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="p-1 text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-sm text-[var(--ink)]">标识 (英文) *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm font-mono"
                  placeholder="pg_custom"
                />
                <p className="mt-1 text-xs text-[var(--ink-muted-80)]">创建后不可修改，命名规范: pg_xxx</p>
              </div>
              <div>
                <label className="block mb-1 text-sm text-[var(--ink)]">显示名 *</label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
                  placeholder="例如：测试组"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm text-[var(--ink)]">描述</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm resize-none"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm text-[var(--ink)]">绑定角色（可选）</label>
                <select
                  value={createForm.bindRole}
                  onChange={(e) => setCreateForm((f) => ({ ...f, bindRole: e.target.value }))}
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
                >
                  <option value="">不绑定（仅手动分配成员）</option>
                  <option value="MEMBER">MEMBER — 成员</option>
                  <option value="GROUP_LEAD">GROUP_LEAD — 组长</option>
                  <option value="ADMIN">ADMIN — 管理员</option>
                </select>
                <p className="mt-1 text-xs text-[var(--ink-muted-80)]">
                  绑定后，该角色的所有用户自动获得本组权限
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑抽屉 */}
      {editingId !== null && (
        <EditPgDrawer
          pgId={editingId}
          groups={groups}
          onClose={() => setEditingId(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// EditPgDrawer — 右侧抽屉：左半权限矩阵 + 右半成员多选
// ─────────────────────────────────────────────────────────
function EditPgDrawer({
  pgId,
  groups,
  onClose,
  onSaved,
}: {
  pgId: number;
  groups: PgSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = groups.find((g) => g.id === pgId);
  const [detail, setDetail] = useState<PgDetail | null>(null);
  const [resources, setResources] = useState<PermissionResource[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<number>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [metaForm, setMetaForm] = useState({ displayName: '', description: '', bindRole: '', bindGroupName: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meta) return;
    setMetaForm({
      displayName: meta.displayName,
      description: meta.description || '',
      bindRole: meta.bindRole || '',
      bindGroupName: meta.bindGroupName || '',
    });
  }, [meta]);

  useEffect(() => {
    (async () => {
      try {
        const [d, res, perms, u] = await Promise.all([
          getPermissionGroup(pgId),
          listAdminResources(),
          listAllPermissions(),
          listAdminUsers(),
        ]);
        setDetail(d);
        setResources(res.resources);
        setAllPerms(perms);
        setUsers(u.users);
        setSelectedPermIds(new Set(d.items.map((i) => i.permissionId)));
        setSelectedUserIds(new Set(d.members.map((m) => m.userId)));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '加载详情失败');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [pgId, onClose]);

  // 按 parentCode 分组权限（用于左侧 matrix 显示）
  const permsByParent = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of allPerms) {
      const key = p.resourceCode; // 形如 page:dashboard / menu:trash
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [allPerms]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.groupName ?? '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const togglePerm = (pid: number) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const toggleUser = (uid: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      // 1) 更新元数据
      await updatePermissionGroup(pgId, {
        displayName: metaForm.displayName.trim(),
        description: metaForm.description.trim() || undefined,
        bindRole: metaForm.bindRole || null,
        bindGroupName: metaForm.bindGroupName.trim() || null,
      });
      // 2) 整组覆盖权限
      await setGroupPermissions(pgId, Array.from(selectedPermIds));
      // 3) 整组覆盖成员
      await setGroupMembers(pgId, Array.from(selectedUserIds));
      // 4) 清缓存，让所有在线用户立即生效
      try {
        await invalidatePermissionCache();
      } catch {
        // 后端清缓存是 admin-only，但本组件也只能在 admin 看到，忽略即可
      }
      // 5) 刷新当前用户自己的 permissionStore
      await permissionStore.fetch(true);

      toast.success('权限组已保存');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-[var(--canvas)] w-full max-w-[840px] h-full flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--hairline)] shrink-0">
          <div className="min-w-0">
            <h3 className="text-[var(--ink)] flex items-center gap-2">
              <ShieldCheck size={18} />
              {detail?.displayName || metaForm.displayName || '权限组'}
              {meta?.isSystem && (
                <span className="px-2 py-0.5 bg-[#e3f2fd] text-[#1565c0] rounded-full text-xs">内置</span>
              )}
            </h3>
            <p className="text-xs text-[var(--ink-muted-80)] font-mono mt-0.5">{detail?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // 重新拉详情，撤销未保存的改动
                if (!detail) return;
                setMetaForm({
                  displayName: detail.displayName,
                  description: detail.description || '',
                  bindRole: detail.bindRole || '',
                  bindGroupName: detail.bindGroupName || '',
                });
                setSelectedPermIds(new Set(detail.items.map((i) => i.permissionId)));
                setSelectedUserIds(new Set(detail.members.map((m) => m.userId)));
              }}
              className="p-1.5 text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
              title="重置"
            >
              <RotateCw size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Meta form */}
        <div className="px-5 py-3 border-b border-[var(--hairline)] bg-[var(--canvas-parchment)]/40 grid grid-cols-2 gap-3 text-sm shrink-0">
          <div>
            <label className="block mb-1 text-xs text-[var(--ink-muted-80)]">显示名</label>
            <input
              type="text"
              value={metaForm.displayName}
              onChange={(e) => setMetaForm((f) => ({ ...f, displayName: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block mb-1 text-xs text-[var(--ink-muted-80)]">绑定角色</label>
            <select
              value={metaForm.bindRole}
              onChange={(e) => setMetaForm((f) => ({ ...f, bindRole: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="">不绑定</option>
              <option value="MEMBER">MEMBER</option>
              <option value="GROUP_LEAD">GROUP_LEAD</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block mb-1 text-xs text-[var(--ink-muted-80)]">描述</label>
            <input
              type="text"
              value={metaForm.description}
              onChange={(e) => setMetaForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-2.5 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        {/* Body: two columns */}
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden grid grid-cols-[1fr_320px] divide-x divide-[var(--hairline)]">
            {/* Left: permissions */}
            <div className="overflow-y-auto px-5 py-4">
              <h4 className="text-sm font-medium text-[var(--ink)] mb-3 sticky top-0 bg-[var(--canvas)] py-1">
                权限点 ({selectedPermIds.size} / {allPerms.length})
              </h4>
              <div className="space-y-3">
                {resources.map((r) => {
                  const perms = permsByParent.get(r.code) ?? [];
                  if (perms.length === 0) return null;
                  return (
                    <div key={r.code} className="border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden">
                      <div className="px-3 py-2 bg-[var(--canvas-parchment)] text-sm font-medium text-[var(--ink)] flex items-center justify-between">
                        <span>
                          {r.displayName}
                          <span className="ml-2 text-xs text-[var(--ink-muted-80)] font-mono">{r.code}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const allOn = perms.every((p) => selectedPermIds.has(p.id));
                            setSelectedPermIds((prev) => {
                              const next = new Set(prev);
                              for (const p of perms) {
                                if (allOn) next.delete(p.id);
                                else next.add(p.id);
                              }
                              return next;
                            });
                          }}
                          className="text-xs text-[var(--primary)] hover:underline"
                        >
                          {perms.every((p) => selectedPermIds.has(p.id)) ? '全不选' : '全选'}
                        </button>
                      </div>
                      <div className="divide-y divide-[var(--hairline)]">
                        {perms.map((p) => (
                          <label
                            key={p.id}
                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--canvas-parchment)]/40 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPermIds.has(p.id)}
                              onChange={() => togglePerm(p.id)}
                              className="accent-[var(--primary)]"
                            />
                            <span className="text-[var(--ink)] flex-1">{p.displayName}</span>
                            <span className="text-xs text-[var(--ink-muted-80)] font-mono">{p.code}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: members */}
            <div className="flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--hairline)] shrink-0">
                <h4 className="text-sm font-medium text-[var(--ink)] mb-2">
                  成员 ({selectedUserIds.size} / {users.length})
                </h4>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted-80)]" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="搜索用户..."
                    className="w-full pl-8 pr-2.5 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredUsers.map((u) => {
                  const checked = selectedUserIds.has(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer hover:bg-[var(--canvas-parchment)]/50 ${
                        checked ? 'bg-[var(--primary)]/5' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUser(u.id)}
                        className="accent-[var(--primary)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--ink)] truncate">{u.displayName}</div>
                        <div className="text-xs text-[var(--ink-muted-80)] truncate">
                          @{u.username} · {ROLE_LABELS[u.role] || u.role}
                          {u.groupName ? ` · ${u.groupName}` : ''}
                        </div>
                      </div>
                      {checked && <Check size={14} className="text-[var(--primary)] shrink-0" />}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-[var(--hairline)] shrink-0 bg-[var(--canvas-parchment)]/40">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas)] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
