import { useEffect, useRef, useState } from "react";
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
import { Plus, LogOut, User, Mail, Truck, Shield, HelpCircle, Settings, ChevronRight, RefreshCw, Upload, AlertCircle, CheckCircle2, XCircle, PenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Profile, Permit } from "@shared/schema";

export default function ProfilePage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
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

  const syncVaultMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const res = await fetch(`/api/profiles/${profileId}/sync-vault`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Permit data updated", description: "Your next PDF will use the latest information." });
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Could not sync to data vault.", variant: "destructive" });
    },
  });

  const parsePastPermitMutation = useMutation({
    mutationFn: async ({ profileId, file }: { profileId: string; file: File }) => {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const res = await fetch(`/api/profiles/${profileId}/parse-past-permit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      if (!res.ok) throw new Error('Parse failed');
      return res.json() as Promise<{ extracted: Record<string, string>; fieldCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({
        title: `Extracted ${data.fieldCount} fields from your past permit`,
        description: "Your permit data has been updated. Your next application will use this information.",
      });
    },
    onError: () => {
      toast({ title: "Parse Failed", description: "Could not extract data from the PDF.", variant: "destructive" });
    },
  });

  const saveVaultFieldMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      const res = await fetch("/api/vault/field", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ field, value }),
      });
      if (!res.ok) throw new Error("Failed to save field");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vault"] });
      setManualEntryField(null);
      setManualEntryValue("");
      toast({ title: "Saved", description: "Vault field updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save field.", variant: "destructive" });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeParseProfileId, setActiveParseProfileId] = useState<string | null>(null);
  const [manualEntryField, setManualEntryField] = useState<string | null>(null);
  const [manualEntryValue, setManualEntryValue] = useState("");

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
    enabled: isAuthenticated,
  });

  const { data: permits = [] } = useQuery<Permit[]>({
    queryKey: ["/api/permits"],
    enabled: isAuthenticated,
  });

  const { data: vaultData } = useQuery<Record<string, any> | null>({
    queryKey: ["/api/vault"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const res = await fetch("/api/vault", { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch vault");
      return res.json();
    },
  });

  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: isAuthenticated,
  });

  const isAdmin = roleData?.role === "admin" || roleData?.role === "owner";

  // Compute vault completeness score
  const VAULT_FIELDS = [
    { key: "businessName", label: "Business Name" },
    { key: "ownerName", label: "Owner Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "mailingStreet", label: "Mailing Address" },
    { key: "commissaryName", label: "Commissary Name" },
    { key: "commissaryAddress", label: "Commissary Address" },
    { key: "menuDescription", label: "Menu Description" },
    { key: "waterSupplyType", label: "Water Supply" },
    { key: "hotHoldingMethod", label: "Hot Holding Method" },
    { key: "coldHoldingMethod", label: "Cold Holding Method" },
    { key: "foodSuppliers", label: "Food Suppliers" },
    { key: "electricitySource", label: "Electricity Source" },
    { key: "wasteWaterDisposal", label: "Wastewater Disposal" },
    { key: "handWashingSetup", label: "Hand Washing Setup" },
    { key: "truckInteriorDescription", label: "Interior Surfaces" },
    { key: "garbageSetup", label: "Garbage Setup" },
  ] as const;

  const filledCount = vaultData ? VAULT_FIELDS.filter(f => vaultData[f.key]).length : 0;
  const completenessScore = Math.round((filledCount / VAULT_FIELDS.length) * 100);
  const missingFields = vaultData ? VAULT_FIELDS.filter(f => !vaultData[f.key]).map(f => f.label) : [];

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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-xl font-bold truncate">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : "PermitPilot User"}
                </h2>
                {roleData?.role === "owner" && (
                  <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-xs">Owner</Badge>
                )}
                {roleData?.role === "admin" && (
                  <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-xs">Admin</Badge>
                )}
              </div>
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
                <div key={profile.id} className="space-y-1">
                  <VehicleCard
                    profile={profile}
                    permitCount={permits.filter(p => p.profileId === profile.id).length}
                    onClick={() => setLocation(`/profile/${profile.id}`)}
                    onEdit={(p) => setLocation(`/profile/${p.id}/edit`)}
                    onDelete={(id) => deleteProfileMutation.mutate(id)}
                    onDeleteDocument={(profileId, docIndex) => deleteDocumentMutation.mutate({ profileId, docIndex })}
                    onUpdateDocumentCategory={(profileId, docIndex, category) => updateDocumentCategoryMutation.mutate({ profileId, docIndex, category })}
                  />
                  <div className="flex gap-2 justify-end flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncVaultMutation.mutate(profile.id)}
                      disabled={syncVaultMutation.isPending}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {syncVaultMutation.isPending ? "Syncing..." : "Sync Permit Data"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setActiveParseProfileId(profile.id); fileInputRef.current?.click(); }}
                      disabled={parsePastPermitMutation.isPending}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {parsePastPermitMutation.isPending && activeParseProfileId === profile.id ? "Extracting..." : "Upload Past Permit"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Vault completeness score */}
        {vaultData && (
          <>
            <Separator />
            <section>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Permit Data
              </h3>
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {completenessScore >= 80 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className="font-medium">
                      {completenessScore >= 80 ? "Permit Data: " : "Permit Data: "}
                      <span className={completenessScore >= 80 ? "text-green-600" : completenessScore >= 50 ? "text-amber-600" : "text-red-600"}>
                        {completenessScore}% complete
                      </span>
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${completenessScore >= 80 ? "bg-green-500" : completenessScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${completenessScore}%` }}
                  />
                </div>
                {missingFields.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Missing fields — tap to enter manually:</p>
                    {VAULT_FIELDS.filter(f => !vaultData?.[f.key]).map(f => (
                      <div key={f.key} className="rounded-md border px-3 py-2 text-sm">
                        {manualEntryField === f.key ? (
                          <div className="flex items-center gap-2">
                            <Input
                              autoFocus
                              className="h-7 text-xs flex-1"
                              placeholder={`Enter ${f.label}...`}
                              value={manualEntryValue}
                              onChange={e => setManualEntryValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter" && manualEntryValue.trim()) {
                                  saveVaultFieldMutation.mutate({ field: f.key, value: manualEntryValue.trim() });
                                }
                                if (e.key === "Escape") { setManualEntryField(null); setManualEntryValue(""); }
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={!manualEntryValue.trim() || saveVaultFieldMutation.isPending}
                              onClick={() => saveVaultFieldMutation.mutate({ field: f.key, value: manualEntryValue.trim() })}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => { setManualEntryField(null); setManualEntryValue(""); }}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="flex-1 text-muted-foreground">{f.label}</span>
                            <button
                              className="text-xs text-primary flex items-center gap-1 hover:underline"
                              onClick={() => { setManualEntryField(f.key); setManualEntryValue(""); }}
                            >
                              <PenLine className="w-3 h-3" />
                              Enter manually
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>
          </>
        )}

        {/* Hidden file input for past permit upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && activeParseProfileId) {
              parsePastPermitMutation.mutate({ profileId: activeParseProfileId, file });
            }
            e.target.value = "";
          }}
        />

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
          PermitPilot v1.0.0 — Always verify permits with official sources
        </p>
      </main>

      <MobileNav />
    </div>
  );
}
