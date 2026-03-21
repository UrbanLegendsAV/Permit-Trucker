import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, ChevronRight, Trophy, FileText, ArrowRight, Sparkles, ShieldCheck, MapPin, Clock3 } from "lucide-react";
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
      window.location.href = "/auth";
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

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ profileId, docIndex }: { profileId: string; docIndex: number }) => {
      return apiRequest("DELETE", `/api/profiles/${profileId}/documents/${docIndex}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({ title: "Document deleted", description: "The document has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
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
  const activeProfiles = profiles.length;
  const approvedPermits = permits.filter((permit) => permit.status === "approved").length;
  const pendingPermits = permits.filter((permit) => permit.status === "pending" || permit.status === "draft").length;
  const totalDocuments = profiles.reduce((sum, profile) => sum + (profile.uploadsJson?.documents?.length || 0), 0);
  const profilesWithParsedData = profiles.filter((profile) => Boolean(profile.parsedDataLog)).length;
  const readinessScore = activeProfiles === 0 ? 0 : Math.round((profilesWithParsedData / activeProfiles) * 100);
  const townsCovered = new Set(permits.map((permit) => permit.townId).filter(Boolean)).size;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-background pb-20">
      <TopHeader />
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <section className="premium-panel hero-wash relative overflow-hidden p-6 md:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-[34%] bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_62%)] md:block" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Badge className="bg-white/12 text-foreground border-white/10 backdrop-blur">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Owner Ops
                </Badge>
                <span className="section-kicker">Permit command center</span>
              </div>
              <div className="space-y-3">
                <h1 className="font-display text-3xl md:text-5xl font-semibold leading-tight tracking-tight">
                  Build permits faster{user?.firstName ? `, ${user.firstName}` : ""}.
                </h1>
                <p className="max-w-2xl text-sm md:text-base text-muted-foreground">
                  {profiles.length === 0
                    ? "Set up your first truck profile and we’ll turn your documents, menu, and operations into a permit-ready system."
                    : `You’re managing ${permits.length} permit${permits.length !== 1 ? "s" : ""}, ${activeProfiles} vehicle${activeProfiles !== 1 ? "s" : ""}, and ${townsCovered || 0} town${townsCovered === 1 ? "" : "s"} from one workspace.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => setLocation(profiles.length === 0 ? "/onboarding" : "/new-permit")}
                  className="h-12 rounded-full px-6 text-sm font-semibold shadow-lg"
                  data-testid="button-new-permit"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {profiles.length === 0 ? "Add Your First Vehicle" : "Start New Permit"}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-full px-6 text-sm"
                  onClick={() => setLocation("/profile")}
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Improve Permit Readiness
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="metric-tile">
                <p className="section-kicker">Readiness</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-3xl font-semibold">{readinessScore}%</p>
                    <p className="text-sm text-muted-foreground">profiles analyzed</p>
                  </div>
                  <ShieldCheck className="w-8 h-8 text-emerald-400" />
                </div>
              </div>
              <div className="metric-tile">
                <p className="section-kicker">Permit Load</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-3xl font-semibold">{permits.length}</p>
                    <p className="text-sm text-muted-foreground">{pendingPermits} still in motion</p>
                  </div>
                  <Clock3 className="w-8 h-8 text-primary" />
                </div>
              </div>
              <div className="metric-tile">
                <p className="section-kicker">Approvals</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-3xl font-semibold">{approvedPermits}</p>
                    <p className="text-sm text-muted-foreground">approved or active</p>
                  </div>
                  <Trophy className="w-8 h-8 text-amber-400" />
                </div>
              </div>
              <div className="metric-tile">
                <p className="section-kicker">Documents</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-3xl font-semibold">{totalDocuments}</p>
                    <p className="text-sm text-muted-foreground">uploaded to your vault</p>
                  </div>
                  <FileText className="w-8 h-8 text-sky-400" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="premium-subpanel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="section-kicker">Next Best Move</p>
                <h2 className="font-display text-2xl font-semibold mt-2">Keep the machine learning from you.</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  Every edit to your profile, documents, and permit history improves autofill quality across future towns.
                </p>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                State of the truck
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border soft-divider bg-background/70 p-4">
                <p className="section-kicker">Profile Vault</p>
                <p className="mt-2 font-semibold">{profilesWithParsedData}/{activeProfiles || 1} synced</p>
                <p className="mt-1 text-sm text-muted-foreground">Analyze missing documents and store the legal details once.</p>
              </div>
              <div className="rounded-2xl border soft-divider bg-background/70 p-4">
                <p className="section-kicker">Permit Focus</p>
                <p className="mt-2 font-semibold">{pendingPermits} permit{pendingPermits === 1 ? "" : "s"} need attention</p>
                <p className="mt-1 text-sm text-muted-foreground">Push current applications through before adding more towns.</p>
              </div>
              <div className="rounded-2xl border soft-divider bg-background/70 p-4">
                <p className="section-kicker">Territory</p>
                <p className="mt-2 font-semibold">{townsCovered || 0} town{townsCovered === 1 ? "" : "s"} covered</p>
                <p className="mt-1 text-sm text-muted-foreground">Every new town you file in strengthens PermitPilot’s map.</p>
              </div>
            </div>
          </Card>

          <Card className="premium-subpanel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Momentum</p>
                <h2 className="font-display text-2xl font-semibold mt-2">This week’s operating snapshot</h2>
              </div>
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-2xl border soft-divider bg-background/70 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Town coverage</p>
                  <p className="text-xs text-muted-foreground">Where your permits can already move fast</p>
                </div>
                <span className="font-display text-2xl font-semibold">{townsCovered}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border soft-divider bg-background/70 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Badges earned</p>
                  <p className="text-xs text-muted-foreground">Proof of trust and momentum on the network</p>
                </div>
                <span className="font-display text-2xl font-semibold">{badges.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border soft-divider bg-background/70 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Vehicles in system</p>
                  <p className="text-xs text-muted-foreground">Profiles ready for repeat filings</p>
                </div>
                <span className="font-display text-2xl font-semibold">{activeProfiles}</span>
              </div>
            </div>
          </Card>
        </section>

        {profiles.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4 gap-4">
              <div>
                <p className="section-kicker">Fleet</p>
                <h2 className="font-display text-2xl font-semibold mt-1">Your Vehicles</h2>
              </div>
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
                    onDeleteDocument={(profileId, docIndex) => deleteDocumentMutation.mutate({ profileId, docIndex })}
                  />
                ))
              )}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-end justify-between mb-4 gap-4">
            <div>
              <p className="section-kicker">Applications</p>
              <h2 className="font-display text-2xl font-semibold flex items-center gap-2 mt-1">
              <FileText className="w-5 h-5 text-primary" />
              Recent Permits
              </h2>
            </div>
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
            <Card className="premium-subpanel p-8 text-center">
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
          <div className="flex items-end justify-between mb-4 gap-4">
            <div>
              <p className="section-kicker">Recognition</p>
              <h2 className="font-display text-2xl font-semibold flex items-center gap-2 mt-1">
              <Trophy className="w-5 h-5 text-amber-500" />
              Badges
              </h2>
            </div>
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
            <Card className="premium-subpanel p-6">
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
