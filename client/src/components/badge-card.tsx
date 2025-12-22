import { Award, Star, Zap, Users, Rocket, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Badge as BadgeType, Town } from "@shared/schema";
import { format } from "date-fns";

interface BadgeCardProps {
  badge?: BadgeType | null;
  town?: Town | null;
  badgeType?: string;
  tier?: string;
  isLocked?: boolean;
  onClick?: () => void;
}

const badgeConfig = {
  pioneer: {
    icon: Rocket,
    title: "Pioneer",
    description: "First to complete a permit in a new town",
  },
  first_permit: {
    icon: Award,
    title: "First Steps",
    description: "Completed your first permit application",
  },
  multi_town: {
    icon: Users,
    title: "Multi-Town",
    description: "Permits in 3 or more towns",
  },
  speed_demon: {
    icon: Zap,
    title: "Speed Demon",
    description: "Completed application in under 10 minutes",
  },
  helper: {
    icon: Star,
    title: "Community Helper",
    description: "Contributed valuable survey data",
  },
};

const tierGradients = {
  bronze: "from-amber-700 via-amber-600 to-amber-500",
  silver: "from-slate-400 via-slate-300 to-slate-200",
  gold: "from-yellow-500 via-amber-400 to-yellow-300",
};

const tierBgColors = {
  bronze: "bg-amber-900/20",
  silver: "bg-slate-400/20",
  gold: "bg-yellow-500/20",
};

export function BadgeCard({ badge, town, badgeType, tier, isLocked = false, onClick }: BadgeCardProps) {
  const type = badge?.badgeType || badgeType || "first_permit";
  const badgeTier = badge?.tier || tier || "bronze";
  const config = badgeConfig[type as keyof typeof badgeConfig] || badgeConfig.first_permit;
  const Icon = config.icon;

  if (isLocked) {
    return (
      <Card
        className="aspect-square p-4 flex flex-col items-center justify-center gap-2 opacity-50 cursor-default"
        data-testid={`badge-locked-${type}`}
      >
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground text-center font-medium">
          {config.title}
        </p>
      </Card>
    );
  }

  return (
    <Card
      className={`aspect-square p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover-elevate transition-all ${tierBgColors[badgeTier as keyof typeof tierBgColors]}`}
      onClick={onClick}
      data-testid={`badge-card-${badge?.id || type}`}
    >
      <div
        className={`w-14 h-14 rounded-full bg-gradient-to-br ${tierGradients[badgeTier as keyof typeof tierGradients]} flex items-center justify-center shadow-lg`}
      >
        <Icon className="w-7 h-7 text-black/70" />
      </div>
      <p className="text-sm font-semibold text-center">{config.title}</p>
      {town && (
        <p className="text-xs text-muted-foreground text-center truncate w-full">
          {town.townName}
        </p>
      )}
      {badge?.earnedDate && (
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {format(new Date(badge.earnedDate), "MMM yyyy")}
        </p>
      )}
    </Card>
  );
}

export function BadgeCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="aspect-square p-4 flex flex-col items-center justify-center gap-2" data-testid={`badge-skeleton-${i}`}>
          <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
          <div className="w-16 h-4 bg-muted rounded animate-pulse" />
          <div className="w-12 h-3 bg-muted rounded animate-pulse" />
        </Card>
      ))}
    </>
  );
}
