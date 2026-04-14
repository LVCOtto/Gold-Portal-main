import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "./queryClient";

interface User {
  type: "customer" | "admin";
  accountCode?: string;
  accountName?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (type: "customer" | "admin", credentials: { accountCode?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(type: "customer" | "admin", credentials: { accountCode?: string; password: string }) {
    const endpoint = type === "admin" ? "/api/auth/admin/login" : "/api/auth/customer/login";
    const response = await apiRequest("POST", endpoint, credentials);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Login failed");
    }
    
    const data = await response.json();
    setUser(data.user);
    setLocation(type === "admin" ? "/admin" : "/dashboard");
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
    // Clear all cached data to prevent stale data when logging in as different user
    queryClient.clear();
    setUser(null);
    setLocation("/");
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
