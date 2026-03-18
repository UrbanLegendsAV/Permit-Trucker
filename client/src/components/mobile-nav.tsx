import { useLocation, Link } from "wouter";
import { LayoutDashboard, FileText, Trophy, User, Sparkles, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

const baseNavItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/permits", icon: FileText, label: "Permits" },
  { path: "/spots", icon: Sparkles, label: "Spots" },
  { path: "/badges", icon: Trophy, label: "Badges" },
  { path: "/profile", icon: User, label: "Profile" },
];

export function MobileNav() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) return null;

  const isAdmin = roleData?.role === "admin" || roleData?.role === "owner";
  const navItems = isAdmin
    ? [...baseNavItems, { path: "/admin", icon: ShieldCheck, label: "Admin" }]
    : baseNavItems;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-t border-border z-50 safe-area-inset-bottom"
      data-testid="nav-mobile"
    >
      <div className="flex items-center justify-around h-full max-w-lg mx-auto px-4">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location === path || (path === "/dashboard" && location === "/");
          return (
            <Link key={path} href={path}>
              <button
                className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-2 px-2 rounded-xl transition-all ${
                  isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`nav-${label.toLowerCase()}`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
