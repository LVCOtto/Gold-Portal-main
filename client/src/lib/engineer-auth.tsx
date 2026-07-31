import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";

interface EngineerOperator {
  email: string;
  loginAt: string;
  displayName: string;
  engineerNames: string[];
  canSelectEngineer?: boolean;
}

interface EngineerAuthContextType {
  operator: EngineerOperator | null;
  isLoading: boolean;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const EngineerAuthContext = createContext<EngineerAuthContextType | undefined>(undefined);

export function EngineerAuthProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<EngineerOperator | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/engineers/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOperator(data.operator);
      }
    } catch {
      // not authenticated
    } finally {
      setIsLoading(false);
    }
  }

  async function requestOtp(email: string) {
    await apiRequest("POST", "/api/engineers/auth/request-otp", { email });
  }

  async function verifyOtp(code: string) {
    const res = await apiRequest("POST", "/api/engineers/auth/verify-otp", { code });
    const data = await res.json();
    setOperator(data.operator);
    setLocation("/engineers");
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/engineers/auth/logout");
    } catch {
      // ignore
    }
    setOperator(null);
    setLocation("/engineers/login");
  }

  return (
    <EngineerAuthContext.Provider value={{ operator, isLoading, requestOtp, verifyOtp, logout }}>
      {children}
    </EngineerAuthContext.Provider>
  );
}

export function useEngineerAuth(): EngineerAuthContextType {
  const ctx = useContext(EngineerAuthContext);
  if (!ctx) throw new Error("useEngineerAuth must be used within EngineerAuthProvider");
  return ctx;
}
