import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CommsAuthProvider, useCommsAuth } from "@/lib/comms-auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import AdminLoginPage from "@/pages/admin-login";
import WorkshopLoginPage from "@/pages/workshop-login";
import DashboardPage from "@/pages/dashboard";
import JobsPage from "@/pages/jobs";
import JobDetailPage from "@/pages/job-detail";
import QuotesPage from "@/pages/quotes";
import QuoteDetailPage from "@/pages/quote-detail";
import AdminDashboard from "@/pages/admin/index";
import AdminAccountsPage from "@/pages/admin/accounts";
import WorkshopBoardPage from "@/pages/admin/workshop-board";
import { AdminCustomerPortalRoute } from "@/pages/admin/customer-portal-route";
import AdminSettingsPage from "@/pages/admin/settings";
import ChangePasswordPage from "@/pages/change-password";
import CommsLoginPage from "@/pages/comms/login";
import CommsJobsPage from "@/pages/comms/jobs";
import CommsJobDetailPage from "@/pages/comms/job-detail";
import CommsTemplatesPage from "@/pages/comms/templates";
import CommsAuditPage from "@/pages/comms/audit";
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
  requiredTypes 
}: { 
  children: React.ReactNode; 
  requiredTypes: Array<"customer" | "admin" | "workshop">;
}) {
  const { user, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    if (requiredTypes.includes("admin")) {
      return <Redirect to="/admin/login" />;
    }
    if (requiredTypes.includes("workshop")) {
      return <Redirect to="/workshop/login" />;
    }
    return <Redirect to="/" />;
  }

  if (mustChangePassword) {
    return <Redirect to="/change-password" />;
  }

  if (!requiredTypes.includes(user.type)) {
    return <Redirect to={user.type === "admin" ? "/admin" : user.type === "workshop" ? "/workshop" : "/dashboard"} />;
  }

  return <>{children}</>;
}

/** Guard for comms portal routes — redirects to /comms/login if not authenticated */
function CommsRoute({ children }: { children: React.ReactNode }) {
  const { operator, isLoading } = useCommsAuth();
  if (isLoading) return <LoadingScreen />;
  if (!operator) return <Redirect to="/comms/login" />;
  return <>{children}</>;
}

/** Public comms route — redirects to /comms/jobs if already authenticated */
function CommsPublicRoute({ children }: { children: React.ReactNode }) {
  const { operator, isLoading } = useCommsAuth();
  if (isLoading) return <LoadingScreen />;
  if (operator) return <Redirect to="/comms/jobs" />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, mustChangePassword } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user?.type === "customer" && mustChangePassword) {
    return <Redirect to="/change-password" />;
  }

  if (user) {
    return <Redirect to={user.type === "admin" ? "/admin" : user.type === "workshop" ? "/workshop" : "/dashboard"} />;
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
      <Route path="/workshop/login">
        <PublicRoute>
          <WorkshopLoginPage />
        </PublicRoute>
      </Route>

      {/* Customer Routes */}
      <Route path="/change-password">
        <ChangePasswordPage />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requiredTypes={["customer"]}>
          <DashboardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs">
        <ProtectedRoute requiredTypes={["customer"]}>
          <JobsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/jobs/:jobId">
        <ProtectedRoute requiredTypes={["customer"]}>
          <JobDetailPage />
        </ProtectedRoute>
      </Route>
      <Route path="/quotes">
        <ProtectedRoute requiredTypes={["customer"]}>
          <QuotesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/quotes/:quoteId">
        <ProtectedRoute requiredTypes={["customer"]}>
          <QuoteDetailPage />
        </ProtectedRoute>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/accounts">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminAccountsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/workshop">
        <ProtectedRoute requiredTypes={["admin"]}>
          <WorkshopBoardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/workshop">
        <ProtectedRoute requiredTypes={["admin", "workshop"]}>
          <WorkshopBoardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/jobs/:jobId">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminCustomerPortalRoute>
            <JobDetailPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/jobs">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminCustomerPortalRoute>
            <JobsPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/quotes/:quoteId">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminCustomerPortalRoute>
            <QuoteDetailPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode/quotes">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminCustomerPortalRoute>
            <QuotesPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer/:accountCode">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminCustomerPortalRoute>
            <DashboardPage />
          </AdminCustomerPortalRoute>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute requiredTypes={["admin"]}>
          <AdminSettingsPage />
        </ProtectedRoute>
      </Route>

      {/* Comms Portal Routes — operator only, never customer-facing */}
      <Route path="/comms/login">
        <CommsPublicRoute>
          <CommsLoginPage />
        </CommsPublicRoute>
      </Route>
      <Route path="/comms/jobs/:jobId">
        <CommsRoute>
          <CommsJobDetailPage />
        </CommsRoute>
      </Route>
      <Route path="/comms/jobs">
        <CommsRoute>
          <CommsJobsPage />
        </CommsRoute>
      </Route>
      <Route path="/comms/queue">
        <CommsRoute>
          <CommsJobsPage />
        </CommsRoute>
      </Route>
      <Route path="/comms/templates">
        <CommsRoute>
          <CommsTemplatesPage />
        </CommsRoute>
      </Route>
      <Route path="/comms/audit">
        <CommsRoute>
          <CommsAuditPage />
        </CommsRoute>
      </Route>
      <Route path="/comms">
        <Redirect to="/comms/jobs" />
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
          <CommsAuthProvider>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
          </CommsAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
