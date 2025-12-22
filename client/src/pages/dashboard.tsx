import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, ChevronRight, Trophy, FileText, Truck, ArrowRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { TopHeader } from "@/components/top-header";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleCard, VehicleCardSkeleton } from "@/components/vehicle-card";
import { PermitCard, PermitCardSkeleton } from "@/components/permit-card";
import { BadgeCard, BadgeCardSkeleton } from "@/components/badge-card";
import type { Profile, Permit, Badge as BadgeType, Town } from "@shared/schema";

export default function Dashboard() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      return apiRequest("DELETE", `/api/profiles/${profileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      toast({ title: "Vehicle deleted", description: "Your vehicle has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete vehicle.", variant: "destructive" });
    },
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
    enabled: isAuthenticated,
  });

  const { data: permits = [], isLoading: permitsLoading } = useQuery<Permit[]>({
    queryKey: ["/api/permits"],
    enabled: isAuthenticated,
  });

  const { data: badges = [], isLoading: badgesLoading } = useQuery<BadgeType[]>({
    queryKey: ["/api/badges"],
    enabled: isAuthenticated,
  });

  const { data: towns = [] } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
    enabled: isAuthenticated,
  });

  const getTownForPermit = (permit: Permit) => 
    towns.find(t => t.id === permit.townId) || null;

  const recentPermits = permits.slice(0, 3);
  const recentBadges = badges.slice(0, 3);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader />
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 md:p-8">
          <div className="relative z-10">
            <h1 className="font-display text-2xl md:text-3xl font-bold mb-2">
              Welcome back{user?.firstName ? `, ${user.firstName}` : ""}!
            </h1>
            <p className="text-muted-foreground mb-6">
              {profiles.length === 0 
                ? "Get started by adding your first vehicle."
                : `You have ${permits.length} permit${permits.length !== 1 ? "s" : ""} across ${profiles.length} vehicle${profiles.length !== 1 ? "s" : ""}.`
              }
            </p>
            <Button 
              onClick={() => setLocation(profiles.length === 0 ? "/onboarding" : "/new-permit")}
              className="h-12 px-6"
              data-testid="button-new-permit"
            >
              <Plus className="w-5 h-5 mr-2" />
              {profiles.length === 0 ? "Add Your Vehicle" : "New Permit"}
            </Button>
          </div>
          <div className="absolute right-4 bottom-4 opacity-10">
            <Truck className="w-32 h-32" />
          </div>
        </section>

        {profiles.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold">Your Vehicles</h2>
              <Link href="/profile">
                <Button variant="ghost" size="sm" data-testid="link-all-vehicles">
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {profilesLoading ? (
                <VehicleCardSkeleton count={2} />
              ) : (
                profiles.map(profile => (
                  <VehicleCard
                    key={profile.id}
                    profile={profile}
                    permitCount={permits.filter(p => p.profileId === profile.id).length}
                    onClick={() => setLocation(`/profile/${profile.id}`)}
                    onEdit={(p) => setLocation(`/profile/${p.id}/edit`)}
                    onDelete={(id) => deleteProfileMutation.mutate(id)}
                  />
                ))
              )}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Recent Permits
            </h2>
            <Link href="/permits">
              <Button variant="ghost" size="sm" data-testid="link-all-permits">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          
          {permitsLoading ? (
            <div className="space-y-3">
              <PermitCardSkeleton count={3} />
            </div>
          ) : permits.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Permits Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start your first permit application to see it here.
              </p>
              <Button onClick={() => setLocation(profiles.length === 0 ? "/onboarding" : "/new-permit")} data-testid="button-start-first-permit">
                {profiles.length === 0 ? "Add Vehicle First" : "Start Application"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentPermits.map(permit => (
                <PermitCard
                  key={permit.id}
                  permit={permit}
                  town={getTownForPermit(permit)}
                  onClick={() => setLocation(`/permits/${permit.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Badges
            </h2>
            <Link href="/badges">
              <Button variant="ghost" size="sm" data-testid="link-all-badges">
                View Gallery
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          
          {badgesLoading ? (
            <div className="grid grid-cols-3 gap-3">
              <BadgeCardSkeleton count={3} />
            </div>
          ) : badges.length === 0 ? (
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <Trophy className="w-7 h-7 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Earn Your First Badge</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete a permit application to earn badges!
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {recentBadges.map(badge => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  town={towns.find(t => t.id === badge.townId)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <MobileNav />
    </div>
  );
}
