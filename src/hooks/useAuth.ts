import { useState, useEffect, useCallback } from "react";
import { apiMe, apiLogin, apiRegister, apiLogout } from "@/lib/api";

export interface User {
  id: number;
  email: string;
  name: string;
  hasOzonKey: boolean;
  hasWbKey: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) { setLoading(false); return; }
    apiMe().then((data) => {
      if (data?.user) setUser(data.user);
      else localStorage.removeItem("auth_token");
    }).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const data = await apiLogin(email, password);
    if (data?.error) return data.error;
    localStorage.setItem("auth_token", data.token);
    setUser(data.user);
    return null;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<string | null> => {
    const data = await apiRegister(email, password, name);
    if (data?.error) return data.error;
    localStorage.setItem("auth_token", data.token);
    setUser(data.user);
    return null;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return { user, loading, login, register, logout };
}
