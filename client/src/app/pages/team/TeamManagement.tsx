import { useState, useEffect } from 'react';
import { Plus, Users, Shield, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listGroups,
  createGroup,
  deleteGroup,
  type GroupInfo,
} from '../../../api/groups';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listRoles,
  createRole,
  updateRole as updateRoleApi,
  deleteRole as deleteRoleApi,
  assignUserRole,
  type UserInfo,
  type RoleData,
} from '../../../api/users';
import { authStore } from '../../../stores/auth';
import { AppPageShell } from '../../components/AppPageShell';
import { PageHeader } from '../../components/PageHeader';

type Tab = 'users' | 'groups' | 'roles';

const ROLE_COLORS: Record<string, string> = {
  ADMIN: '#ff3b30',
  GROUP_LEAD: '#ff9500',
  MEMBER: '#0066cc',
};

export function TeamManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editUser, setEditUser] = useState<UserInfo | null>(null);
  const [editForm, setEditForm] = useState({
    displayName: '',
    role: 'MEMBER' as 'ADMIN' | 'GROUP_LEAD' | 'MEMBER',
    groupName: '',
    password: '',
    isActive: true,
  });
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'MEMBER' as 'ADMIN' | 'GROUP_LEAD' | 'MEMBER',
    groupName: '',
  });

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      if ((err as Error).message.includes('权限不足')) {
        // Non-admin users will see this
      }
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchGroups = async () => {
    setGroupsLoading(true);
    try {
      const data = await listGroups();
      setGroups(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error('组名不能为空');
      return;
    }
    try {
      await createGroup({ groupName: newGroupName.trim(), description: newGroupDesc || undefined });
      toast.success('组创建成功');
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDesc('');
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (!window.confirm('确定要删除该组吗？')) return;
    try {
      await deleteGroup(id);
      toast.success('组已删除');
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.username.trim()) { toast.error('用户名不能为空'); return; }
    if (!newUser.password) { toast.error('密码不能为空'); return; }
    if (!newUser.displayName.trim()) { toast.error('显示名不能为空'); return; }

    try {
      await createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        displayName: newUser.displayName.trim(),
        role: newUser.role,
        groupName: newUser.groupName || undefined,
      });
      toast.success('用户创建成功');
      setShowCreateUser(false);
      setNewUser({ username: '', password: '', displayName: '', role: 'MEMBER', groupName: '' });
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleToggleUserActive = async (userId: number, currentStatus: boolean) => {
    try {
      await updateUser(userId, { isActive: !currentStatus });
      toast.success(currentStatus ? '已停用' : '已启用');
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!window.confirm(`确定要删除用户 "${username}" 吗？`)) return;
    try {
      await deleteUser(userId);
      toast.success('用户已删除');
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const openEditUser = (user: UserInfo) => {
    setEditUser(user);
    setEditForm({
      displayName: user.displayName,
      role: user.role as 'ADMIN' | 'GROUP_LEAD' | 'MEMBER',
      groupName: user.groupName || '',
      password: '',
      isActive: user.isActive,
    });
  };

  const handleSaveEditUser = async () => {
    if (!editUser) return;
    if (!editForm.displayName.trim()) { toast.error('显示名不能为空'); return; }

    try {
      const input: { displayName: string; role: string; groupName?: string; isActive?: boolean; password?: string } = {
        displayName: editForm.displayName.trim(),
        role: editForm.role,
        isActive: editForm.isActive,
      };
      if (editForm.groupName) input.groupName = editForm.groupName;
      if (editForm.password) input.password = editForm.password;

      await updateUser(editUser.id, input);
      toast.success('用户更新成功');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  return (
    <AppPageShell>
        <PageHeader
          title="团队管理"
          description="管理用户、组织和权限"
          actions={
            activeTab !== 'roles' ? (
              <button
                onClick={() => {
                  if (activeTab === 'groups') setShowCreateGroup(true);
                  if (activeTab === 'users') setShowCreateUser(true);
                }}
                className="compact-action flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 text-sm"
              >
                <Plus size={18} />
                <span>添加{activeTab === 'users' ? '用户' : '组'}</span>
              </button>
            ) : undefined
          }
        />

        <div className="mb-5 border-b border-[var(--hairline)] bg-[var(--canvas)] rounded-t-[var(--radius-lg)] px-4 pt-2">
          <div className="flex gap-6">
            {(['users', 'groups', 'roles'] as Tab[]).map((tab) => {
              const Icon = tab === 'roles' ? Shield : Users;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                    activeTab === tab
                      ? 'border-[var(--primary)] text-[var(--primary)]'
                      : 'border-transparent text-[var(--ink-muted-80)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon size={16} />
                  <span className="font-medium">
                    {tab === 'users' ? '用户管理' : tab === 'groups' ? '组管理' : '角色权限'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            {usersLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
              </div>
            )}

            {!usersLoading && (
              <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data-table w-full">
                    <thead className="bg-[var(--canvas-parchment)] border-b border-[var(--hairline)]">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--ink)]">用户名</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--ink)]">显示名</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--ink)]">角色</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--ink)]">所属组</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--ink)]">状态</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-[var(--ink)]">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--hairline)]">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-[var(--canvas-parchment)] transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                                style={{ backgroundColor: ROLE_COLORS[user.role] || '#6c757d' }}
                              >
                                {(user.displayName || '?').charAt(0)}
                              </div>
                              <span className="font-medium text-[var(--ink)]">{user.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[var(--ink)]">{user.displayName}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className="table-badge inline-block px-3 py-1 rounded-[1px] text-xs font-semibold text-white"
                              style={{ backgroundColor: ROLE_COLORS[user.role] || '#6c757d' }}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[var(--ink)]">{user.groupName || '-'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`table-badge inline-block px-3 py-1 rounded-[1px] text-xs font-semibold ${
                              user.isActive ? 'bg-[#d4edda] text-[#155724]' : 'bg-[#f8d7da] text-[#721c24]'
                            }`}>
                              {user.isActive ? '激活' : '停用'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditUser(user)}
                                className="compact-icon-button p-2 text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                                title="编辑"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleToggleUserActive(user.id, user.isActive)}
                                className="compact-icon-button p-2 text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                                title={user.isActive ? '停用' : '启用'}
                              >
                                {user.isActive ? (
                                  <span className="text-xs font-medium">停用</span>
                                ) : (
                                  <span className="text-xs font-medium">启用</span>
                                )}
                              </button>
                              {user.role !== 'ADMIN' && (
                                <button
                                  onClick={() => handleDeleteUser(user.id, user.username)}
                                  className="compact-icon-button p-2 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                                  title="删除"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {users.length === 0 && (
                  <div className="text-center py-12 text-[var(--ink-muted-80)]">
                    暂无用户（需要管理员权限查看）
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <>
            {groupsLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
              </div>
            )}

            {!groupsLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-5 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-[var(--ink)] mb-1">{group.groupName}</h4>
                        <p className="text-sm text-[var(--ink-muted-80)]">
                          {group.description || '暂无描述'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button className="p-2 text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors">
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-2 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-[var(--hairline)]">
                      <div className="text-sm text-[var(--ink-muted-80)]">
                        创建于: <span className="text-[var(--ink)]">{group.createdAt?.slice(0, 10)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!groupsLoading && groups.length === 0 && (
              <div className="text-center py-16 text-[var(--ink-muted-80)]">
                <p>暂无用户组，点击"添加组"创建第一个</p>
              </div>
            )}
          </>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && <RolesManagement />}

        {/* Create Group Modal */}
        {showCreateGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-6 text-[var(--ink)]">创建用户组</h3>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">组名 *</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="例如：后端组"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">描述</label>
                  <input
                    type="text"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="描述该组的职责..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowCreateGroup(false)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] transition-colors">取消</button>
                <button onClick={handleCreateGroup} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors">创建</button>
              </div>
            </div>
          </div>
        )}

        {/* Create User Modal */}
        {showCreateUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-6 text-[var(--ink)]">创建用户</h3>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">用户名 *</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="登录用名"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">密码 *</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">显示名 *</label>
                  <input
                    type="text"
                    value={newUser.displayName}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, displayName: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    placeholder="展示名称"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">角色</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as typeof prev.role }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="MEMBER">成员</option>
                    <option value="GROUP_LEAD">组长</option>
                    <option value="ADMIN">管理员</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">所属组</label>
                  <select
                    value={newUser.groupName || ''}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, groupName: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">无</option>
                    {groups.map(g => <option key={g.id} value={g.groupName}>{g.groupName}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowCreateUser(false)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] transition-colors">取消</button>
                <button onClick={handleCreateUser} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors">创建</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-6 text-[var(--ink)]">编辑用户</h3>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink-muted-80)]">用户名</label>
                  <div className="px-4 py-3 bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)]">
                    {editUser.username}
                  </div>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">显示名 *</label>
                  <input
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">角色</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as typeof f.role }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="MEMBER">成员</option>
                    <option value="GROUP_LEAD">组长</option>
                    <option value="ADMIN">管理员</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">所属组</label>
                  <select
                    value={editForm.groupName}
                    onChange={(e) => setEditForm((f) => ({ ...f, groupName: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">无</option>
                    {groups.map(g => <option key={g.id} value={g.groupName}>{g.groupName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">
                    新密码 <span className="text-[var(--ink-muted-80)]">(留空则不修改)</span>
                  </label>
                  <input
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[var(--hairline)] peer-checked:bg-[var(--primary)] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                  <span className="text-sm text-[var(--ink)]">账号激活</span>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setEditUser(null)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] transition-colors">取消</button>
                <button onClick={handleSaveEditUser} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors">保存</button>
              </div>
            </div>
          </div>
        )}
    </AppPageShell>
  );
}

// ── Roles Management Component ──

function RolesManagement() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', displayName: '', description: '' });
  const [saving, setSaving] = useState(false);
  const currentUser = authStore.currentUser;
  const isAdmin = currentUser?.role === 'ADMIN';

  const loadRoles = () => {
    setLoading(true);
    listRoles().then(setRoles).catch(() => toast.error('加载角色失败')).finally(() => setLoading(false));
  };

  useEffect(() => { loadRoles(); }, []);

  const handleSave = async () => {
    if (!form.name.trim() || !form.displayName.trim()) { toast.error('角色名和显示名不能为空'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateRoleApi(editingId, { displayName: form.displayName, description: form.description });
      } else {
        await createRole({ name: form.name.trim(), displayName: form.displayName.trim(), description: form.description });
        setForm({ name: '', displayName: '', description: '' });
      }
      toast.success(editingId ? '已更新' : '已创建');
      setShowForm(false); setEditingId(null);
      loadRoles();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (role: RoleData) => {
    if (role.isSystem) { toast.error('系统内置角色不可删除'); return; }
    if (role.userCount > 0 && !window.confirm(`该角色下有 ${role.userCount} 个用户，删除后这些用户将自动分配为"成员"角色。确定删除？`)) return;
    try {
      await deleteRoleApi(role.id);
      toast.success('已删除');
      loadRoles();
    } catch (err) { toast.error((err as Error).message); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--primary)]" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--ink-muted-80)]">
          共 {roles.length} 个角色。系统内置角色（管理员/组长/成员）不可删除。
        </p>
        {isAdmin && (
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', displayName: '', description: '' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-sm hover:bg-[var(--primary-focus)] transition-colors">
            <Plus size={16} /> 新建角色
          </button>
        )}
      </div>

      {roles.map(role => (
        <div key={role.id} className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-[var(--radius-md)]" style={{ backgroundColor: ROLE_COLORS[role.name] ? `${ROLE_COLORS[role.name]}20` : '#f0f0f0' }}>
                <Shield size={20} style={{ color: ROLE_COLORS[role.name] || '#6c757d' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-[var(--ink)]">{role.displayName}</h4>
                  <code className="text-xs px-1.5 py-0.5 bg-[var(--canvas-parchment)] rounded text-[var(--ink-muted-80)]">{role.name}</code>
                  {role.isSystem && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-[1px]">系统</span>}
                </div>
                {role.description && <p className="text-sm text-[var(--ink-muted-80)] mt-0.5">{role.description}</p>}
                <p className="text-xs text-[var(--ink-muted-48)] mt-1">{role.userCount} 个用户</p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingId(role.id); setForm({ name: role.name, displayName: role.displayName, description: role.description || '' }); setShowForm(true); }}
                  className="p-1.5 text-[var(--ink-muted-60)] hover:text-[var(--primary)] rounded-[var(--radius-sm)] hover:bg-[var(--canvas-parchment)] transition-colors" title="编辑">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(role)}
                  className="p-1.5 text-[var(--ink-muted-60)] hover:text-[var(--destructive)] rounded-[var(--radius-sm)] hover:bg-red-50 transition-colors disabled:opacity-30" disabled={role.isSystem} title={role.isSystem ? '系统角色不可删除' : '删除'}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Create/Edit Role Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[var(--radius-xl)] p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--ink)] mb-4">{editingId ? '编辑角色' : '新建角色'}</h3>
            <div className="space-y-4">
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-[var(--ink)] mb-1">角色名（英文）*</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="如: TEST_MANAGER"
                    className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)]" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-1">显示名 *</label>
                <input type="text" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="如: 测试主管"
                  className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-1">描述</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="可选"
                  className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)]" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)]">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} {editingId ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
