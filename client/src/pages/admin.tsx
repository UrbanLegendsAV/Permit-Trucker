import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Shield, Users, MapPin, Settings, DollarSign, Loader2, Save, Trash2, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Config, Town } from "@shared/schema";

interface UserData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
  });

  const { data: configs = [], isLoading: configsLoading } = useQuery<Config[]>({
    queryKey: ["/api/admin/configs"],
    enabled: roleData?.role === "admin" || roleData?.role === "owner",
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<UserData[]>({
    queryKey: ["/api/admin/users"],
    enabled: roleData?.role === "admin" || roleData?.role === "owner",
  });

  const { data: towns = [], isLoading: townsLoading } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
  });

  const isAdmin = roleData?.role === "admin" || roleData?.role === "owner";
  const isOwner = roleData?.role === "owner";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You need admin privileges to access this page.
          </p>
          <Button onClick={() => setLocation("/dashboard")} data-testid="button-go-dashboard">
            Go to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center h-full px-4 max-w-4xl mx-auto gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display font-semibold">Admin Dashboard</h1>
          <Badge variant="secondary" className="ml-auto">
            <Shield className="w-3 h-3 mr-1" />
            {roleData?.role}
          </Badge>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto pb-20">
        <Tabs defaultValue="pricing" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pricing" data-testid="tab-pricing">
              <DollarSign className="w-4 h-4 mr-2" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="towns" data-testid="tab-towns">
              <MapPin className="w-4 h-4 mr-2" />
              Towns
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pricing">
            <PricingTab configs={configs} isLoading={configsLoading} />
          </TabsContent>

          <TabsContent value="towns">
            <TownsTab towns={towns} isLoading={townsLoading} isOwner={isOwner} />
          </TabsContent>

          <TabsContent value="users">
            <UsersTab users={users} isLoading={usersLoading} isOwner={isOwner} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function PricingTab({ configs, isLoading }: { configs: Config[]; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [proPrice, setProPrice] = useState(() => {
    const config = configs.find((c) => c.key === "pro_price");
    return config ? parseInt(config.value) : 99;
  });
  
  const [basicPrice, setBasicPrice] = useState(() => {
    const config = configs.find((c) => c.key === "basic_price");
    return config ? parseInt(config.value) : 0;
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      return apiRequest("POST", "/api/admin/configs", { key, value, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/configs"] });
      toast({ title: "Config Updated", description: "Pricing has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update config.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateConfigMutation.mutate({ key: "pro_price", value: String(proPrice), description: "Pro plan monthly price" });
    updateConfigMutation.mutate({ key: "basic_price", value: String(basicPrice), description: "Basic plan monthly price" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold mb-6">Subscription Pricing</h2>
      
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Basic Plan</Label>
            <span className="text-2xl font-bold">${basicPrice}/mo</span>
          </div>
          <Slider
            value={[basicPrice]}
            onValueChange={([val]) => setBasicPrice(val)}
            min={0}
            max={50}
            step={1}
            data-testid="slider-basic-price"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Pro Plan</Label>
            <span className="text-2xl font-bold">${proPrice}/mo</span>
          </div>
          <Slider
            value={[proPrice]}
            onValueChange={([val]) => setProPrice(val)}
            min={10}
            max={200}
            step={1}
            data-testid="slider-pro-price"
          />
        </div>

        <Button 
          onClick={handleSave} 
          disabled={updateConfigMutation.isPending}
          className="w-full"
          data-testid="button-save-pricing"
        >
          {updateConfigMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Pricing
        </Button>
      </div>

      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="font-medium mb-4">All Configs</h3>
        <div className="space-y-2">
          {configs.map((config) => (
            <div key={config.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
              <span className="font-mono">{config.key}</span>
              <span>{config.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function TownsTab({ towns, isLoading, isOwner }: { towns: Town[]; isLoading: boolean; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingTown, setEditingTown] = useState<string | null>(null);
  const [newTown, setNewTown] = useState({ state: "CT", county: "", townName: "" });

  const createTownMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/towns", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/towns"] });
      setNewTown({ state: "CT", county: "", townName: "" });
      toast({ title: "Town Created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create town.", variant: "destructive" });
    },
  });

  const updateTownMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/admin/towns/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/towns"] });
      setEditingTown(null);
      toast({ title: "Town Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update town.", variant: "destructive" });
    },
  });

  const deleteTownMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/towns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/towns"] });
      toast({ title: "Town Deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete town.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Add New Town</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <Label>State</Label>
            <Select value={newTown.state} onValueChange={(v) => setNewTown({ ...newTown, state: v })}>
              <SelectTrigger data-testid="select-new-town-state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CT">Connecticut</SelectItem>
                <SelectItem value="NY">New York</SelectItem>
                <SelectItem value="NJ">New Jersey</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>County</Label>
            <Input
              value={newTown.county}
              onChange={(e) => setNewTown({ ...newTown, county: e.target.value })}
              placeholder="County name"
              data-testid="input-new-town-county"
            />
          </div>
          <div>
            <Label>Town Name</Label>
            <Input
              value={newTown.townName}
              onChange={(e) => setNewTown({ ...newTown, townName: e.target.value })}
              placeholder="Town name"
              data-testid="input-new-town-name"
            />
          </div>
        </div>
        <Button
          onClick={() => createTownMutation.mutate(newTown)}
          disabled={!newTown.county || !newTown.townName || createTownMutation.isPending}
          data-testid="button-add-town"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Town
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Manage Towns ({towns.length})</h3>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {towns.map((town) => (
            <div key={town.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <div>
                <p className="font-medium">{town.townName}</p>
                <p className="text-sm text-muted-foreground">
                  {town.county} County, {town.state} | Confidence: {town.confidenceScore}%
                </p>
              </div>
              <div className="flex gap-2">
                {isOwner && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => deleteTownMutation.mutate(town.id)}
                    disabled={deleteTownMutation.isPending}
                    data-testid={`button-delete-town-${town.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function UsersTab({ users, isLoading, isOwner }: { users: UserData[]; isLoading: boolean; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update role.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4">User Management ({users.length})</h3>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
            <div>
              <p className="font-medium">
                {user.firstName || user.lastName 
                  ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                  : "Unknown User"}
              </p>
              <p className="text-sm text-muted-foreground">{user.email || "No email"}</p>
            </div>
            {isOwner ? (
              <Select
                value={user.role || "user"}
                onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role })}
              >
                <SelectTrigger className="w-32" data-testid={`select-role-${user.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">{user.role || "user"}</Badge>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
