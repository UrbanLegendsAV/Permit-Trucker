import { useLocation, Link } from "wouter";
import { LayoutDashboard, FileText, Trophy, User, MapPin } from "lucide-react";

const navItems = [
  { path: "/discover", icon: MapPin, label: "Discover" },
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/permits", icon: FileText, label: "Permits" },
  { path: "/badges", icon: Trophy, label: "Badges" },
  { path: "/profile", icon: User, label: "Profile" },
];

export function MobileNav() {
  const [location] = useLocation();

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
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] py-2 px-3 rounded-lg transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
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
