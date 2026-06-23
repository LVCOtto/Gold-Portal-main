import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Menu, LogOut, Briefcase, LayoutList, FileText, ClipboardList, MessageSquare, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommsAuth } from "@/lib/comms-auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/comms/jobs", label: "Job Board", icon: Briefcase },
  { href: "/comms/templates", label: "Templates", icon: FileText },
  { href: "/comms/audit", label: "Audit Log", icon: ClipboardList },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="flex flex-col gap-1 mt-2">
      {navItems.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function CommsLayout({ children }: { children: ReactNode }) {
  const { operator, logout } = useCommsAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r bg-sidebar transition-all duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2 font-semibold text-sidebar-foreground">
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="text-sm">Comms Portal</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("text-sidebar-foreground", collapsed && "mx-auto")}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!collapsed && <NavLinks />}
        </div>

        <div className="p-3 border-t border-sidebar-border">
          {!collapsed && (
            <p className="text-xs text-muted-foreground truncate mb-2 px-1">{operator?.email}</p>
          )}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={logout}
            className={cn("w-full text-muted-foreground hover:text-foreground", collapsed ? "justify-center" : "justify-start gap-2")}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign out"}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b bg-background">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex items-center gap-2 font-semibold h-14 px-4 border-b">
                <MessageSquare className="h-5 w-5 text-primary" />
                <span>Comms Portal</span>
              </div>
              <div className="p-3">
                <NavLinks />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-3 border-t">
                <p className="text-xs text-muted-foreground truncate mb-2 px-1">{operator?.email}</p>
                <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start gap-2 text-muted-foreground">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-sm">Comms Portal</span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
