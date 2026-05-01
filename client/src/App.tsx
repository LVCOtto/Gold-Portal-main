import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import AdminLoginPage from "@/pages/admin-login";
import DashboardPage from "@/pages/dashboard";
import JobsPage from "@/pages/jobs";
import JobDetailPage from "@/pages/job-detail";
import QuotesPage from "@/pages/quotes";
import QuoteDetailPage from "@/pages/quote-detail";
import AdminDashboard from "@/pages/admin/index";
import AdminAccountsPage from "@/pages/admin/accounts";
import { AdminCustomerPortalRoute } from "@/pages/admin/customer-portal-route";
import AdminSettingsPage from "@/pages/admin/settings";
import ChangePasswordPage from "@/pages/change-password";
import { Loader2 } from "lucide-react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function ProtectedRoute({ 
  children, 
  requiredType 
}: { 
  children: React.ReactNode; 
  requiredType: "customer" | "admin";
}) {
  const { user, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect to={requiredType === "admin" ? "/admin/login" : "/"} />;
  }

  if (mustChangePassword) {
    return <Redirect to="/change-password" />;
  }

  if (user.type !== requiredType) {
    return <Redirect to={user.type === "admin" ? "/admin" : "/dashboard"} />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Redirect to={user.type === "admin" ? "/admin" : "/dashboard"} />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/">
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      </Route>
      <Route path="/admin/login">
        <PublicRoute>
          <AdminLoginPage />
        </PublicRoute>
      </Route>

      {/* Customer Routes */}
      <Route path="/change-password">
        <ChangePasswordPage />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requiredType="customer">
          <DashboardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs">
        <ProtectedRoute requiredType="customer">
          <JobsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs/:jobId">
        <ProtectedRoute requiredType="customer">
          <JobDetailPage />
        </ProtectedRoute>
      </Route>
      <Route path="/quotes">
        <ProtectedRoute requiredType="customer">
          <QuotesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/quotes/:quoteId">
        <ProtectedRoute requiredType="customer">
          <QuoteDetailPage />
        </ProtectedRoute>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute requiredType="admin">
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/accounts">
        <ProtectedRoute requiredType="admin">
          <AdminAccountsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/jobs/:jobId">
        <ProtectedRoute requiredType="admin">
          <AdminCustomerPortalRoute>
            <JobDetailPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/jobs">
        <ProtectedRoute requiredType="admin">
          <AdminCustomerPortalRoute>
            <JobsPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/quotes/:quoteId">
        <ProtectedRoute requiredType="admin">
          <AdminCustomerPortalRoute>
            <QuoteDetailPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/quotes">
        <ProtectedRoute requiredType="admin">
          <AdminCustomerPortalRoute>
            <QuotesPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode">
        <ProtectedRoute requiredType="admin">
          <AdminCustomerPortalRoute>
            <DashboardPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute requiredType="admin">
          <AdminSettingsPage />
        </ProtectedRoute>
      </Route>

      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
