// src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("auth_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(
    () => localStorage.getItem("auth_token") || ""
  );

  const login = (nextUser, nextToken) => {
    // set token first so immediate API calls carry it
    setAuthToken(nextToken);
    setToken(nextToken || "");
    setUser(nextUser || null);
    if (nextUser) localStorage.setItem("auth_user", JSON.stringify(nextUser));
    else localStorage.removeItem("auth_user");
  };

  const logout = () => {
    setAuthToken("");
    setToken("");
    setUser(null);
    localStorage.removeItem("auth_user");
    // clear any per-user caches if you use them
    sessionStorage.clear?.();
  };

  // Keep token header in sync even if localStorage was changed elsewhere
  useEffect(() => {
    const onStorage = () => {
      const t = localStorage.getItem("auth_token") || "";
      if (t !== token) setAuthToken(t);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [token]);

  const value = useMemo(() => {
    const role = user?.role || "";
    return {
      user,
      token,
      login,
      logout,
      loading: false,
      isAdmin: role === "admin",
      isVendor: role === "vendor",
      isCustomer: role === "customer",
    };
  }, [user, token]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

