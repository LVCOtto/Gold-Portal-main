import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Menu, LogOut, Users, 
  LayoutDashboard, ChevronLeft, Settings, ExternalLink, Workflow, MessagesSquare, Radio, PhoneCall
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { DataCurrentBadge } from "./data-current-badge";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import lvcLogo from "@assets/logo.png";

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/accounts", label: "Accounts", icon: Users },
  { href: "/admin/workshop", label: "Workshop", icon: Workflow },
  { href: "/breakdowns", label: "Breakdowns", icon: Radio },
  { href: "/comms/jobs", label: "Comms", icon: MessagesSquare },
  { href: "/callbacks", label: "Callbacks", icon: PhoneCall },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function NavLinks({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <nav className={cn("flex flex-col gap-1", mobile ? "mt-6" : "")}>
      {navItems.map((item) => {
        const isActive = item.exact 
          ? location === item.href 
          : location === item.href || location.startsWith(item.href + "/");
        const Icon = item.icon;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover-elevate"
            )}
            data-testid={`link-admin-${item.label.toLowerCase()}`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      <aside 
        className={cn(
          "hidden lg:flex flex-col border-r bg-sidebar transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
          {!sidebarCollapsed && (
            <img src={lvcLogo} alt="LVC UK" className="h-7 brightness-0 invert" />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn("text-sidebar-foreground", sidebarCollapsed && "mx-auto")}
            data-testid="button-collapse-sidebar"
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          </Button>
        </div>
        
        {!sidebarCollapsed && (
          <div className="flex-1 p-3">
            <NavLinks />
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="p-3 border-t">
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              onClick={logout}
              data-testid="button-admin-logout"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-50 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between h-full px-4 gap-4">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" data-testid="button-admin-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-4">
                  <img src={lvcLogo} alt="LVC UK" className="h-7 mb-4" />
                  <NavLinks mobile />
                </SheetContent>
              </Sheet>
              
              <span className="font-semibold lg:hidden">Admin</span>
            </div>

            <div className="flex items-center gap-3">
              <DataCurrentBadge />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
