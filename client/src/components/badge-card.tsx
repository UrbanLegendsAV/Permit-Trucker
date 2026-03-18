import { Card } from "@/components/ui/card";
import type { Badge as BadgeType, Town } from "@shared/schema";
import { format } from "date-fns";

interface BadgeCardProps {
  badge?: BadgeType | null;
  town?: Town | null;
  badgeType?: string;
  tier?: string;
  isLocked?: boolean;
  unlockHint?: string;
  onClick?: () => void;
}

interface BadgeDefinition {
  label: string;
  description: string;
  color: string;
  svg: React.ReactNode;
}

const tierGradients = {
  bronze: "from-amber-700 via-amber-600 to-amber-500",
  silver: "from-slate-400 via-slate-300 to-slate-200",
  gold:   "from-yellow-500 via-amber-400 to-yellow-300",
};

const tierBgColors = {
  bronze: "bg-amber-900/20",
  silver: "bg-slate-400/20",
  gold:   "bg-yellow-500/20",
};

function getBadge(type: string, tier: string): BadgeDefinition {
  const color =
    tier === "gold"   ? "#F5A623" :
    tier === "silver" ? "#94A3B8" :
                        "#CD7F32";

  const definitions: Record<string, BadgeDefinition> = {
    pioneer: {
      label: "Town Pioneer",
      description: "First to file a permit in a new CT town",
      color: "#F5A623",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="12" y1="8" x2="12" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M12 8 L30 14 L12 20 Z" fill="currentColor" opacity="0.9"/>
          <circle cx="12" cy="34" r="2" fill="currentColor" opacity="0.5"/>
        </svg>
      ),
    },
    explorer: {
      label: "Explorer",
      description: "Filed a permit in a town with verified forms",
      color: "#94A3B8",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" opacity="0.3"/>
          <path d="M20 8 L22 18 L20 20 L18 18 Z" fill="currentColor"/>
          <path d="M32 20 L22 22 L20 20 L22 18 Z" fill="currentColor" opacity="0.4"/>
          <path d="M20 32 L18 22 L20 20 L22 22 Z" fill="currentColor" opacity="0.4"/>
          <path d="M8 20 L18 18 L20 20 L18 22 Z" fill="currentColor" opacity="0.4"/>
          <circle cx="20" cy="20" r="2" fill="currentColor"/>
        </svg>
      ),
    },
    first_permit: {
      label: "First Steps",
      description: "Filed your first permit application",
      color: "#CD7F32",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="6" width="20" height="26" rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
          <path d="M15 20 L18 23 L25 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="15" y1="13" x2="25" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
        </svg>
      ),
    },
    multi_town: {
      label: "Multi-Town",
      description: "Filed permits in 3 or more CT towns",
      color: "#1B4FD8",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22 C12 18 8 16 8 12 C8 9.8 9.8 8 12 8 C14.2 8 16 9.8 16 12 C16 16 12 22 12 22Z" fill="currentColor" opacity="0.6"/>
          <circle cx="12" cy="12" r="2" fill="white"/>
          <path d="M20 26 C20 21 16 19 16 15 C16 12.2 17.8 10 20 10 C22.2 10 24 12.2 24 15 C24 19 20 26 20 26Z" fill="currentColor"/>
          <circle cx="20" cy="15" r="2" fill="white"/>
          <path d="M28 22 C28 18 24 16 24 12 C24 9.8 25.8 8 28 8 C30.2 8 32 9.8 32 12 C32 16 28 22 28 22Z" fill="currentColor" opacity="0.6"/>
          <circle cx="28" cy="12" r="2" fill="white"/>
        </svg>
      ),
    },
    speed_demon: {
      label: "Speed Demon",
      description: "Filed a permit within 10 minutes of signing up",
      color: "#00C896",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M23 6 L14 22 L20 22 L17 34 L26 18 L20 18 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
        </svg>
      ),
    },
    helper: {
      label: "Community Helper",
      description: "Contributed permit data that helped other operators",
      color: "#8B5CF6",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="15" cy="12" r="4" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.2"/>
          <path d="M8 28 C8 22 11 20 15 20 C19 20 22 22 22 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <circle cx="25" cy="12" r="4" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.2"/>
          <path d="M18 28 C18 22 21 20 25 20 C29 20 32 22 32 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
        </svg>
      ),
    },
    health_inspection: {
      label: "Clean Bill",
      description: "Uploaded a verified health inspection report",
      color: "#00C896",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 6 L32 11 L32 22 C32 28 26 33 20 35 C14 33 8 28 8 22 L8 11 Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2"/>
          <path d="M15 20 L20 14 L25 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <line x1="17" y1="20" x2="23" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="20" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    verified_operator: {
      label: "Verified Operator",
      description: "Data vault is 85%+ complete — fully permit-ready",
      color: "#1B4FD8",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 4 L24 8 L30 7 L32 13 L38 16 L36 22 L38 28 L32 31 L30 37 L24 36 L20 40 L16 36 L10 37 L8 31 L2 28 L4 22 L2 16 L8 13 L10 7 L16 8 Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M13 20 L17 24 L27 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    food_type: {
      label: "Cuisine Expert",
      description: "Filed permits for your signature cuisine",
      color: "#F5A623",
      svg: (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 6 L14 16 C14 18 16 20 16 20 L16 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="11" y1="6" x2="11" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          <line x1="17" y1="6" x2="17" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          <path d="M26 6 C26 6 29 10 29 14 C29 17 27 19 27 19 L27 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      ),
    },
  };

  return definitions[type] ?? definitions.first_permit;
}

export function BadgeCard({ badge, town, badgeType, tier, isLocked = false, unlockHint, onClick }: BadgeCardProps) {
  const type = badge?.badgeType || badgeType || "first_permit";
  const badgeTier = badge?.tier || tier || "bronze";
  const def = getBadge(type, badgeTier);

  if (isLocked) {
    return (
      <Card
        className="aspect-square p-4 flex flex-col items-center justify-center gap-2 opacity-50 cursor-default"
        data-testid={`badge-locked-${type}`}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center bg-muted/50 grayscale"
          style={{ color: def.color }}
        >
          <div className="w-9 h-9 opacity-40">{def.svg}</div>
        </div>
        <p className="text-xs font-medium text-center leading-tight text-muted-foreground">{def.label}</p>
        {unlockHint && (
          <p className="text-[10px] text-muted-foreground text-center leading-tight px-1">{unlockHint}</p>
        )}
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
        className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${tierGradients[badgeTier as keyof typeof tierGradients]} shadow-lg`}
        style={{ color: def.color }}
      >
        <div
          className="w-9 h-9"
          style={{ filter: `drop-shadow(0 0 6px ${def.color})` }}
        >
          {def.svg}
        </div>
      </div>
      <p className="text-xs font-semibold text-center leading-tight">{def.label}</p>
      {town && (
        <p className="text-[10px] text-muted-foreground text-center truncate w-full">{town.townName}</p>
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
          <div className="w-14 h-14 rounded-2xl bg-muted animate-pulse" />
          <div className="w-16 h-4 bg-muted rounded animate-pulse" />
          <div className="w-12 h-3 bg-muted rounded animate-pulse" />
        </Card>
      ))}
    </>
  );
}
