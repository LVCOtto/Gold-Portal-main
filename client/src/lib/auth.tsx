import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "./queryClient";

interface User {
  type: "customer" | "admin" | "workshop";
  email?: string;
  accountCode?: string;
  accountName?: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  mustChangePassword: boolean;
  requestCustomerOtp: (credentials: { accountCode: string; email: string }) => Promise<void>;
  verifyCustomerOtp: (code: string) => Promise<void>;
  requestAdminOtp: (email: string) => Promise<void>;
  verifyAdminOtp: (code: string) => Promise<void>;
  requestWorkshopOtp: (email: string) => Promise<void>;
  verifyWorkshopOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  function getDefaultRouteForUser(nextUser: User | null): string {
    if (!nextUser) return "/";
    if (nextUser.type === "admin") return "/admin";
    if (nextUser.type === "workshop") return "/workshop";
    return "/dashboard";
  }

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setMustChangePassword(!!data.user?.mustChangePassword);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function requestCustomerOtp(credentials: { accountCode: string; email: string }) {
    await apiRequest("POST", "/api/auth/customer/request-otp", credentials);
  }

  async function verifyCustomerOtp(code: string) {
    const response = await apiRequest("POST", "/api/auth/customer/verify-otp", { code });

    const data = await response.json();
    setUser(data.user);
    if (data.mustChangePassword) {
      setMustChangePassword(true);
      setLocation("/change-password");
      return;
    }
    setMustChangePassword(false);
    setLocation("/dashboard");
  }

  async function requestAdminOtp(email: string) {
    await apiRequest("POST", "/api/auth/admin/request-otp", { email });
  }

  async function verifyAdminOtp(code: string) {
    const response = await apiRequest("POST", "/api/auth/admin/verify-otp", { code });
    const data = await response.json();
    queryClient.clear();
    setUser(data.user);
    setMustChangePassword(false);
    setLocation("/admin");
  }

  async function requestWorkshopOtp(email: string) {
    await apiRequest("POST", "/api/auth/workshop/request-otp", { email });
  }

  async function verifyWorkshopOtp(code: string) {
    const response = await apiRequest("POST", "/api/auth/workshop/verify-otp", { code });
    const data = await response.json();
    queryClient.clear();
    setUser(data.user);
    setMustChangePassword(false);
    setLocation("/workshop");
  }

  async function logout() {
    const currentUser = user;
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
    queryClient.clear();
    setUser(null);
    setMustChangePassword(false);
    setLocation(currentUser?.type === "workshop" ? "/workshop/login" : "/");
  }

  function clearMustChangePassword() {
    setMustChangePassword(false);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, mustChangePassword, requestCustomerOtp, verifyCustomerOtp, requestAdminOtp, verifyAdminOtp, requestWorkshopOtp, verifyWorkshopOtp, logout, clearMustChangePassword }}>
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
