import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { TopHeader } from "@/components/top-header";
import { MobileNav } from "@/components/mobile-nav";
import { VehicleCard, VehicleCardSkeleton } from "@/components/vehicle-card";
import { PublicProfileSection } from "@/components/public-profile-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Plus, LogOut, User, Mail, Truck, Shield, HelpCircle, Settings, ChevronRight } from "lucide-react";
import type { Profile, Permit } from "@shared/schema";

export default function ProfilePage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
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

  const updateDocumentCategoryMutation = useMutation({
    mutationFn: async ({ profileId, docIndex, category }: { profileId: string; docIndex: number; category: string }) => {
      return apiRequest("PATCH", `/api/profiles/${profileId}/documents/${docIndex}/category`, { category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update document category.", variant: "destructive" });
    },
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
    enabled: isAuthenticated,
  });

  const { data: permits = [] } = useQuery<Permit[]>({
    queryKey: ["/api/permits"],
    enabled: isAuthenticated,
  });

  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: isAuthenticated,
  });

  const isAdmin = roleData?.role === "admin" || roleData?.role === "owner";

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title="Profile" />
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold truncate">
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : "PermitTruck User"}
              </h2>
              <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />
                {user?.email || "No email"}
              </p>
            </div>
          </div>
        </Card>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Your Vehicles
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/onboarding")}
              data-testid="button-add-vehicle"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Vehicle
            </Button>
          </div>

          {profilesLoading ? (
            <div className="space-y-3">
              <VehicleCardSkeleton count={2} />
            </div>
          ) : profiles.length === 0 ? (
            <Card className="p-6 text-center">
              <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Vehicles Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your first food truck or trailer to get started.
              </p>
              <Button onClick={() => setLocation("/onboarding")} data-testid="button-add-first-vehicle">
                <Plus className="w-4 h-4 mr-2" />
                Add Your Vehicle
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {profiles.map(profile => (
                <VehicleCard
                  key={profile.id}
                  profile={profile}
                  permitCount={permits.filter(p => p.profileId === profile.id).length}
                  onClick={() => setLocation(`/profile/${profile.id}`)}
                  onEdit={(p) => setLocation(`/profile/${p.id}/edit`)}
                  onDelete={(id) => deleteProfileMutation.mutate(id)}
                  onDeleteDocument={(profileId, docIndex) => deleteDocumentMutation.mutate({ profileId, docIndex })}
                  onUpdateDocumentCategory={(profileId, docIndex, category) => updateDocumentCategoryMutation.mutate({ profileId, docIndex, category })}
                />
              ))}
            </div>
          )}
        </section>

        {profiles.length > 0 && (
          <>
            <Separator />
            <section>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Public Profile
              </h3>
              <PublicProfileSection vehicleProfile={profiles[0]} />
            </section>
          </>
        )}

        <Separator />

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Settings
          </h3>
          
          <Card className="divide-y divide-border">
            {isAdmin && (
              <button
                className="w-full flex items-center gap-3 p-4 text-left hover-elevate transition-colors"
                onClick={() => setLocation("/admin")}
                data-testid="button-admin-dashboard"
              >
                <Settings className="w-5 h-5 text-primary" />
                <span className="flex-1">Admin Dashboard</span>
                <Badge variant="secondary" className="text-xs">
                  {roleData?.role}
                </Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            
            <button
              className="w-full flex items-center gap-3 p-4 text-left hover-elevate transition-colors"
              data-testid="button-account-settings"
            >
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1">Account Settings</span>
            </button>
            
            <button
              className="w-full flex items-center gap-3 p-4 text-left hover-elevate transition-colors"
              data-testid="button-privacy"
            >
              <Shield className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1">Privacy & Data</span>
            </button>
            
            <button
              className="w-full flex items-center gap-3 p-4 text-left hover-elevate transition-colors"
              data-testid="button-help"
            >
              <HelpCircle className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1">Help & Support</span>
            </button>
          </Card>
        </section>

        <Button
          variant="outline"
          className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          PermitTruck v1.0.0 - Always verify permits with official sources
        </p>
      </main>

      <MobileNav />
    </div>
  );
}
