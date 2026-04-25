import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client.js";

const AuthContext = createContext(null);
const TOKEN_KEY = "deploy-platform-token";

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        setAuthReady(true);
        return;
      }

      try {
        const data = await apiRequest("/api/auth/me", { token });
        setUser(data.user);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    };

    bootstrap();
  }, [token]);

  const persistToken = (nextToken) => {
    setToken(nextToken);
    if (nextToken) {
      localStorage.setItem(TOKEN_KEY, nextToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  };

  const login = async (payload) => {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    persistToken(data.token);
    setUser(data.user);
  };

  const signup = async (payload) => {
    const data = await apiRequest("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    persistToken(data.token);
    setUser(data.user);
  };

  const refreshUser = async () => {
    if (!token) {
      return;
    }

    const data = await apiRequest("/api/auth/me", { token });
    setUser(data.user);
  };

  const saveDefaultAwsCredentials = async (payload) => {
    const data = await apiRequest("/api/users/aws-credentials", {
      method: "PUT",
      token,
      body: JSON.stringify(payload)
    });
    setUser(data.user);
  };

  const logout = () => {
    persistToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      authReady,
      login,
      signup,
      logout,
      refreshUser,
      saveDefaultAwsCredentials
    }),
    [token, user, authReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};
