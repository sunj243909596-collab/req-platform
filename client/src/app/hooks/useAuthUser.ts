// 抽出 4 处重复的「拉当前用户」逻辑（settings 4 个子页 + 任何需要 user 的组件）
import { useEffect, useState } from 'react';
import { authStore } from '../../stores/auth';
import type { UserInfo } from '../../api/auth';

export function useAuthUser(): { user: UserInfo | null; loading: boolean; reload: () => void } {
  const [user, setUser] = useState<UserInfo | null>(() => authStore.currentUser);
  const [loading, setLoading] = useState<boolean>(!authStore.currentUser);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    authStore.fetchUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, [reloadKey]);

  return {
    user,
    loading,
    reload: () => setReloadKey((k) => k + 1),
  };
}
