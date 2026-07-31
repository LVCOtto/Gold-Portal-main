import { type ReactNode } from "react";
import { HardHat, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useEngineerAuth } from "@/lib/engineer-auth";

export function EngineersLayout({ children }: { children: ReactNode }) {
  const { operator, logout } = useEngineerAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
            <HardHat className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Engineer Hub</p>
            <p className="text-xs text-muted-foreground">{operator?.displayName || operator?.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={logout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
