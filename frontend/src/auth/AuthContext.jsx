import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem("authToken") || "",
  );
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(token));

  const saveAuth = (nextToken, nextUser) => {
    setToken(nextToken);
    if (nextToken) localStorage.setItem("authToken", nextToken);
    else localStorage.removeItem("authToken");

    setUser(nextUser || null);
  };

  const logout = () => {
    saveAuth("", null);
  };

  const login = async ({ mobileNumber, password }) => {
    const res = await authApi.login({ mobileNumber, password });
    const nextToken = res.data?.data?.token;
    const nextUser = res.data?.data?.user;
    saveAuth(nextToken, nextUser);
    return res;
  };

  const register = async ({
    corporation,
    fullName,
    mobileNumber,
    password,
  }) => {
    const res = await authApi.register({
      corporation,
      fullName,
      mobileNumber,
      password,
    });
    const nextToken = res.data?.data?.token;
    const nextUser = res.data?.data?.user;
    saveAuth(nextToken, nextUser);
    return res;
  };

  const refreshMe = async () => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.me();
      setUser(res.data?.data || null);
    } catch (e) {
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ token, user, isLoading, login, register, logout, refreshMe }),
    [token, user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
