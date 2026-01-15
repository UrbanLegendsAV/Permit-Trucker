import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { TopHeader } from "@/components/top-header";
import { MobileNav } from "@/components/mobile-nav";
import { BadgeCard, BadgeCardSkeleton } from "@/components/badge-card";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, Crown, Star } from "lucide-react";
import type { Badge as BadgeType, Town } from "@shared/schema";

const allBadgeTypes = [
  { type: "first_permit", tier: "bronze" },
  { type: "pioneer", tier: "gold" },
  { type: "multi_town", tier: "silver" },
  { type: "speed_demon", tier: "bronze" },
  { type: "helper", tier: "bronze" },
];

interface LeaderboardEntry {
  userId: string;
  name: string;
  badgeCount: number;
  pioneerCount: number;
}

export default function BadgesPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/auth";
    }
  }, [authLoading, isAuthenticated]);

  const { data: badges = [], isLoading: badgesLoading } = useQuery<BadgeType[]>({
    queryKey: ["/api/badges"],
    enabled: isAuthenticated,
  });

  const { data: towns = [] } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
    enabled: isAuthenticated,
  });

  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard"],
    enabled: isAuthenticated,
  });

  const earnedBadgeTypes = new Set(badges.map(b => b.badgeType));

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title="Badges" />
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-orange-500/10">
          <Trophy className="w-10 h-10 text-amber-500" />
          <div>
            <h1 className="font-display text-2xl font-bold">Your Achievements</h1>
            <p className="text-muted-foreground">
              {badges.length} badge{badges.length !== 1 ? "s" : ""} earned
            </p>
          </div>
        </div>

        <Tabs defaultValue="gallery" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="gallery" className="h-10" data-testid="tab-gallery">
              <Medal className="w-4 h-4 mr-2" />
              Gallery
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="h-10" data-testid="tab-leaderboard">
              <Crown className="w-4 h-4 mr-2" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gallery" className="mt-6">
            {badgesLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <BadgeCardSkeleton count={6} />
              </div>
            ) : (
              <div className="space-y-8">
                <section>
                  <h2 className="font-semibold mb-4 flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    Earned Badges
                  </h2>
                  {badges.length === 0 ? (
                    <Card className="p-8 text-center">
                      <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No Badges Yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Complete permit applications to earn your first badge!
                      </p>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {badges.map(badge => (
                        <BadgeCard
                          key={badge.id}
                          badge={badge}
                          town={towns.find(t => t.id === badge.townId)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="font-semibold mb-4 text-muted-foreground">
                    Badges to Unlock
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {allBadgeTypes
                      .filter(b => !earnedBadgeTypes.has(b.type as any))
                      .map(b => (
                        <BadgeCard
                          key={b.type}
                          badgeType={b.type}
                          tier={b.tier}
                          isLocked
                        />
                      ))}
                  </div>
                </section>
              </div>
            )}
          </TabsContent>

          <TabsContent value="leaderboard" className="mt-6">
            <Card className="divide-y divide-border">
              {leaderboard.length === 0 ? (
                <div className="p-8 text-center">
                  <Crown className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Be the First!</h3>
                  <p className="text-sm text-muted-foreground">
                    Start earning badges to appear on the leaderboard.
                  </p>
                </div>
              ) : (
                leaderboard.map((entry, index) => (
                  <div
                    key={entry.userId}
                    className="flex items-center gap-4 p-4"
                    data-testid={`leaderboard-row-${index}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0
                        ? "bg-gradient-to-br from-amber-500 to-yellow-400 text-black"
                        : index === 1
                        ? "bg-gradient-to-br from-slate-300 to-slate-200 text-black"
                        : index === 2
                        ? "bg-gradient-to-br from-amber-700 to-amber-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{entry.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {entry.pioneerCount} pioneer badge{entry.pioneerCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{entry.badgeCount}</p>
                      <p className="text-xs text-muted-foreground">total</p>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}
