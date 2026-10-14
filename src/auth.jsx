import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api, clearToken, getOrigToken, getToken, setOrigToken, setToken, setUnauthorizedHandler,
} from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [impersonating, setImpersonating] = useState(false);
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setImpersonating(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => { setUser(d.user); setImpersonating(d.impersonating); })
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const value = useMemo(() => ({
    user, loading, impersonating,
    async login(email, password) {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(d.token);
      setUser(d.user);
      setImpersonating(false);
      return d.user;
    },
    async loginAsClient(clientId) {
      const d = await api(`/clients/${clientId}/impersonate`, { method: 'POST' });
      setOrigToken(getToken());
      setToken(d.token);
      setUser(d.user);
      setImpersonating(true);
    },
    async exitImpersonation() {
      const orig = getOrigToken();
      if (!orig) return logout();
      setToken(orig);
      setOrigToken(null);
      const d = await api('/auth/me');
      setUser(d.user);
      setImpersonating(false);
    },
    setUser,
    logout,
  }), [user, loading, impersonating, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
