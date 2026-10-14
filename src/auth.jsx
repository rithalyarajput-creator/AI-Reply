import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api, clearToken, getOrigToken, getScope, getToken, setOrigToken, setScope as storeScope,
  setToken, setUnauthorizedHandler,
} from './api.js';

const Ctx = createContext(null);
export const AuthContext = Ctx;
export const useAuth = () => useContext(Ctx);

export const PLATFORM = ['super_admin', 'staff_support', 'staff_sales', 'staff_billing', 'staff_developer'];
export const CLIENT_SIDE = ['client_admin', 'agent_head', 'agent'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [impersonating, setImpersonating] = useState(false);
  const [scope, setScopeState] = useState(getScope());
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setPerms([]);
    setImpersonating(false);
    setScopeState(null);
  }, []);

  const applyMe = useCallback((d) => {
    setUser(d.user);
    setPerms(d.permissions || []);
    setImpersonating(!!d.impersonating);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api('/auth/me').then(applyMe).catch(logout).finally(() => setLoading(false));
  }, [logout, applyMe]);

  const value = useMemo(() => ({
    user, perms, loading, impersonating, scope,
    can: (p) => perms.includes(p),
    isPlatform: !!user && PLATFORM.includes(user.role),
    isClientSide: !!user && CLIENT_SIDE.includes(user.role),
    async login(email, password) {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(d.token);
      const me = await api('/auth/me');
      applyMe(me);
      return d.user;
    },
    async loginAsClient(clientId) {
      const d = await api(`/clients/${clientId}/impersonate`, { method: 'POST' });
      setOrigToken(getToken());
      setToken(d.token);
      applyMe(await api('/auth/me'));
    },
    async exitImpersonation() {
      const orig = getOrigToken();
      if (!orig) return logout();
      setToken(orig);
      setOrigToken(null);
      applyMe(await api('/auth/me'));
      return undefined;
    },
    openClient(client) {
      storeScope({ id: client.id, name: client.company_name });
      setScopeState({ id: client.id, name: client.company_name });
    },
    closeClient() {
      storeScope(null);
      setScopeState(null);
    },
    setUser,
    logout,
  }), [user, perms, loading, impersonating, scope, logout, applyMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

