import { Link } from "wouter";
import { Bell, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";

interface TopHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function TopHeader({ title }: TopHeaderProps) {
  const { theme, setTheme } = useTheme();
  const { isAuthenticated } = useAuth();

  return (
    <header
      className="sticky top-0 z-40 h-14 bg-background/80 backdrop-blur-xl border-b border-border"
      data-testid="header-top"
    >
      <div className="flex items-center justify-between h-full px-4 max-w-7xl mx-auto">
        {/* Logo */}
        <Link href={isAuthenticated ? "/dashboard" : "/"}>
          <div className="flex items-center gap-2 cursor-pointer">
            <img
              src={theme === "dark" ? "/logo-dark.svg" : "/logo-light.svg"}
              alt="PermitPilot"
              className="h-7 w-auto"
            />
            {title && (
              <span className="font-display font-semibold text-sm text-muted-foreground ml-1 border-l border-border pl-3">
                {title}
              </span>
            )}
          </div>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            /* Authenticated — directory link + theme toggle + notifications */
            <>
              <nav className="hidden sm:flex items-center gap-1 mr-2">
                <Link href="/directory">
                  <Button variant="ghost" size="sm" className="text-sm">Directory</Button>
                </Link>
              </nav>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                data-testid="button-theme-toggle"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
              <Button variant="ghost" size="icon" data-testid="button-notifications">
                <Bell className="w-5 h-5" />
              </Button>
            </>
          ) : (
            /* Public visitor — nav links + CTA buttons */
            <>
              <nav className="hidden sm:flex items-center gap-1 mr-2">
                <Link href="/directory">
                  <Button variant="ghost" size="sm" className="text-sm">Directory</Button>
                </Link>
                <Link href="/#how-it-works">
                  <Button variant="ghost" size="sm" className="text-sm">For Food Trucks</Button>
                </Link>
              </nav>
              <Link href="/auth">
                <Button variant="ghost" size="sm" className="text-sm">Sign In</Button>
              </Link>
              <Link href="/auth">
                <Button size="sm" className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white text-sm">
                  List Your Truck
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
