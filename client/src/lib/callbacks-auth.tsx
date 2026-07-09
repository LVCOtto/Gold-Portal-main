import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "./queryClient";

interface CallbacksOperator {
  email: string;
  loginAt: string;
}

interface CallbacksAuthContextType {
  operator: CallbacksOperator | null;
  isLoading: boolean;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const CallbacksAuthContext = createContext<CallbacksAuthContextType | undefined>(undefined);

export function CallbacksAuthProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<CallbacksOperator | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch("/api/callbacks/auth/me", { credentials: "include" });
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
    await apiRequest("POST", "/api/callbacks/auth/request-otp", { email });
  }

  async function verifyOtp(code: string) {
    const res = await apiRequest("POST", "/api/callbacks/auth/verify-otp", { code });
    const data = await res.json();
    setOperator(data.operator);
    setLocation("/callbacks");
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/callbacks/auth/logout");
    } catch {
      // ignore
    }
    setOperator(null);
    setLocation("/callbacks/login");
  }

  return (
    <CallbacksAuthContext.Provider value={{ operator, isLoading, requestOtp, verifyOtp, logout }}>
      {children}
    </CallbacksAuthContext.Provider>
  );
}

export function useCallbacksAuth(): CallbacksAuthContextType {
  const ctx = useContext(CallbacksAuthContext);
  if (!ctx) throw new Error("useCallbacksAuth must be used within CallbacksAuthProvider");
  return ctx;
}