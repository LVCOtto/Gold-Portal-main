import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";

interface CommsOperator {
  email: string;
  loginAt: string;
}

interface CommsAuthContextType {
  operator: CommsOperator | null;
  isLoading: boolean;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CommsAuthContext = createContext<CommsAuthContextType | undefined>(undefined);

export function CommsAuthProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<CommsOperator | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/comms/auth/me", { credentials: "include" });
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
    await apiRequest("POST", "/api/comms/auth/request-otp", { email });
  }

  async function verifyOtp(code: string) {
    const res = await apiRequest("POST", "/api/comms/auth/verify-otp", { code });
    const data = await res.json();
    setOperator(data.operator);
    setLocation("/comms/jobs");
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/comms/auth/logout");
    } catch {
      // ignore
    }
    setOperator(null);
    setLocation("/comms/login");
  }

  return (
    <CommsAuthContext.Provider value={{ operator, isLoading, requestOtp, verifyOtp, logout }}>
      {children}
    </CommsAuthContext.Provider>
  );
}

export function useCommsAuth(): CommsAuthContextType {
  const ctx = useContext(CommsAuthContext);
  if (!ctx) throw new Error("useCommsAuth must be used within CommsAuthProvider");
  return ctx;
}
