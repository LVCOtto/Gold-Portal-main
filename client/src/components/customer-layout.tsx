import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Menu, LogOut, LayoutDashboard, Briefcase, FileText, ExternalLink, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { DataCurrentBadge } from "./data-current-badge";
import { useAuth } from "@/lib/auth";
import { useCustomerPortal } from "@/lib/customer-portal";
import { cn } from "@/lib/utils";
import lvcLogo from "@assets/logo.png";

interface CustomerLayoutProps {
  children: ReactNode;
}

function NavLinks({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const [location] = useLocation();
  const portal = useCustomerPortal();
  const navItems = [
    { href: portal.routes.dashboard, label: "Dashboard", icon: LayoutDashboard },
    { href: portal.routes.jobs, label: "Jobs", icon: Briefcase },
    { href: portal.routes.quotes, label: "Quotes", icon: FileText },
  ];

  return (
    <>
      {navItems.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        const Icon = item.icon;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors hover-elevate",
              mobile ? "w-full" : "",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid={`link-nav-${item.label.toLowerCase()}`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const { user, logout } = useAuth();
  const portal = useCustomerPortal();
  const displayAccountName = portal.isAdminMode
    ? portal.accountName || portal.accountCode
    : user?.accountName;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-4">
                  <div className="flex flex-col gap-2 mt-6">
                    <NavLinks mobile />
                  </div>
                </SheetContent>
              </Sheet>

              <Link href={portal.routes.dashboard} data-testid="link-logo">
                <img src={lvcLogo} alt="LVC UK" className="h-8" />
              </Link>

              <nav className="hidden md:flex items-center gap-1">
                <NavLinks />
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <DataCurrentBadge />
              </div>
              
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <span data-testid="text-account-name">{displayAccountName}</span>
              </div>

              <ThemeToggle />

              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                data-testid="button-logout"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {portal.isAdminMode && (
        <div className="border-b bg-muted/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4 text-primary" />
              <span>
                Admin view: <span className="font-medium text-foreground">{displayAccountName}</span>
                {portal.accountCode && <span> ({portal.accountCode})</span>}
              </span>
            </div>
            <Link href="/admin/accounts">
              <Button variant="ghost" size="sm" className="w-fit gap-2" data-testid="button-back-admin-accounts">
                <ArrowLeft className="h-4 w-4" />
                Accounts
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="sm:hidden px-4 py-2 border-b">
        <DataCurrentBadge />
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t bg-background/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>LVC UK Ltd - Customer Service Portal</p>
            <a 
              href="https://lvcuk.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              lvcuk.com
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
