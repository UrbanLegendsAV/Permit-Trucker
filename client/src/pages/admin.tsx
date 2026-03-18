import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Shield, Users, MapPin, Settings, DollarSign, Loader2, Save, Trash2, Plus, ArrowLeft, MessageSquare, CheckCircle, XCircle, Star, FileText, Upload, Award, Download, Mail, AlertTriangle, Send, Bot, Inbox, Activity, ChevronLeft, ChevronRight as ChevronRightIcon, Globe2 } from "lucide-react";
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
import type { Config, Town, Review, TownForm } from "@shared/schema";

interface UserData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
}

interface ReviewData extends Review {
  businessName: string | null;
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

  const { data: adminReviews = [], isLoading: reviewsLoading } = useQuery<ReviewData[]>({
    queryKey: ["/api/admin/reviews"],
    enabled: roleData?.role === "admin" || roleData?.role === "owner",
  });

  const { data: townForms = [], isLoading: formsLoading } = useQuery<(TownForm & { townName?: string })[]>({
    queryKey: ["/api/admin/forms"],
    enabled: roleData?.role === "admin" || roleData?.role === "owner",
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
          <TabsList className="flex w-full overflow-x-auto gap-1 h-auto p-1 scrollbar-none">
            <TabsTrigger value="pricing" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-pricing">
              <DollarSign className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Pricing</span>
            </TabsTrigger>
            <TabsTrigger value="towns" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-towns">
              <MapPin className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Towns</span>
            </TabsTrigger>
            <TabsTrigger value="forms" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-forms">
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Forms</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-reviews">
              <MessageSquare className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Reviews</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-users">
              <Users className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="outreach" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-outreach">
              <Mail className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Outreach</span>
            </TabsTrigger>
            <TabsTrigger value="orchestrator" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-orchestrator">
              <Bot className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Orchestrator</span>
            </TabsTrigger>
            <TabsTrigger value="crawler" className="flex-shrink-0 text-xs px-3 py-2 h-9" data-testid="tab-crawler">
              <Globe2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Crawler</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pricing">
            <PricingTab configs={configs} isLoading={configsLoading} />
          </TabsContent>

          <TabsContent value="towns">
            <TownsTab towns={towns} isLoading={townsLoading} isOwner={isOwner} />
          </TabsContent>

          <TabsContent value="forms">
            <FormsTab forms={townForms} towns={towns} isLoading={formsLoading} />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewsTab reviews={adminReviews} isLoading={reviewsLoading} />
          </TabsContent>

          <TabsContent value="users">
            <UsersTab users={users} isLoading={usersLoading} isOwner={isOwner} />
          </TabsContent>

          <TabsContent value="outreach">
            <OutreachTab />
          </TabsContent>

          <TabsContent value="orchestrator">
            <OrchestratorTab />
          </TabsContent>

          <TabsContent value="crawler">
            <CrawlerTab towns={towns} />
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

const formCategories = [
  { value: "temporary_permit", label: "Temporary Permit" },
  { value: "seasonal_permit", label: "Seasonal Permit" },
  { value: "yearly_permit", label: "Yearly Permit" },
  { value: "plan_review", label: "Plan Review" },
  { value: "license_renewal", label: "License Renewal" },
  { value: "checklist", label: "Checklist" },
  { value: "health_inspection", label: "Health Inspection" },
  { value: "fire_safety", label: "Fire Safety" },
  { value: "other", label: "Other" },
];

function FormsTab({ 
  forms, 
  towns, 
  isLoading 
}: { 
  forms: (TownForm & { townName?: string })[]; 
  towns: Town[]; 
  isLoading: boolean 
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTown, setSelectedTown] = useState<string>("");
  const [selectedFormId, setSelectedFormId] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const uploadPdfMutation = useMutation({
    mutationFn: async ({ formId, fileData, fileName, fileType }: { formId: string; fileData: string; fileName: string; fileType: string }) => {
      return apiRequest("PATCH", `/api/admin/forms/${formId}/upload`, { fileData, fileName, fileType });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/towns"] });
      setSelectedFormId("");
      if (data.badge) {
        toast({ 
          title: "Pioneer Badge Earned!", 
          description: `You earned the ${data.badge.townName} ${data.badge.state} Pioneer Badge for uploading the first form!`,
        });
      } else {
        toast({ title: "PDF Uploaded", description: "Form PDF has been uploaded successfully." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload PDF.", variant: "destructive" });
    },
  });

  const downloadPdfMutation = useMutation({
    mutationFn: async (formId: string) => {
      return apiRequest("POST", `/api/admin/town-forms/${formId}/download-pdf`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      toast({ 
        title: "PDF Downloaded", 
        description: `Downloaded ${data.fileName} (${data.sizeKB}KB) from external source.` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to download PDF from external URL.", variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, formId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      toast({ title: "Error", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      await uploadPdfMutation.mutateAsync({
        formId,
        fileData: base64,
        fileName: file.name,
        fileType: file.type,
      });
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredForms = selectedTown 
    ? forms.filter(f => f.townId === selectedTown)
    : forms;

  const formsWithPdf = forms.filter(f => f.fileData).length;
  const formsWithoutPdf = forms.filter(f => !f.fileData).length;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Form Upload Statistics</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-md">
            <p className="text-2xl font-bold">{forms.length}</p>
            <p className="text-sm text-muted-foreground">Total Forms</p>
          </div>
          <div className="text-center p-4 bg-green-500/10 rounded-md">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formsWithPdf}</p>
            <p className="text-sm text-muted-foreground">With PDF</p>
          </div>
          <div className="text-center p-4 bg-yellow-500/10 rounded-md">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{formsWithoutPdf}</p>
            <p className="text-sm text-muted-foreground">Need PDF</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <h3 className="font-semibold">Manage Forms</h3>
          <Select value={selectedTown || "all"} onValueChange={(v) => setSelectedTown(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48" data-testid="select-town-filter">
              <SelectValue placeholder="Filter by town" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Towns</SelectItem>
              {towns.map(town => (
                <SelectItem key={town.id} value={town.id}>
                  {town.townName}, {town.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {filteredForms.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No forms found</p>
          ) : (
            filteredForms.map((form) => {
              const town = towns.find(t => t.id === form.townId);
              return (
                <div 
                  key={form.id} 
                  className="p-4 bg-muted/50 rounded-md space-y-3"
                  data-testid={`form-row-${form.id}`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{form.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {town?.townName}, {town?.state} | {formCategories.find(c => c.value === form.category)?.label || 'Other'}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {form.fileData ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            PDF Uploaded
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                            <Upload className="w-3 h-3 mr-1" />
                            Needs PDF
                          </Badge>
                        )}
                        {form.isFillable && (
                          <Badge variant="outline">Fillable</Badge>
                        )}
                        {form.uploadedBy && (
                          <Badge variant="outline">
                            <Award className="w-3 h-3 mr-1" />
                            Pioneer Uploaded
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {form.fileData ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const blob = new Blob(
                              [Uint8Array.from(atob(form.fileData!), c => c.charCodeAt(0))],
                              { type: form.fileType || 'application/pdf' }
                            );
                            window.open(URL.createObjectURL(blob), "_blank");
                          }}
                          data-testid={`button-view-pdf-${form.id}`}
                        >
                          View PDF
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          {form.externalUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadPdfMutation.mutate(form.id)}
                              disabled={downloadPdfMutation.isPending}
                              data-testid={`button-download-pdf-${form.id}`}
                            >
                              {downloadPdfMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Download className="w-4 h-4 mr-1" />
                              )}
                              Fetch PDF
                            </Button>
                          )}
                          <label>
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => handleFileUpload(e, form.id)}
                              disabled={uploading || uploadPdfMutation.isPending}
                              data-testid={`input-upload-pdf-${form.id}`}
                            />
                            <Button
                              size="sm"
                              variant="default"
                              asChild
                              disabled={uploading || uploadPdfMutation.isPending}
                            >
                              <span>
                                {uploading ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4 mr-1" />
                                )}
                                Upload PDF
                              </span>
                            </Button>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Card className="p-4 bg-muted/30">
        <div className="flex items-start gap-3">
          <Award className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Pioneer Badge System</p>
            <p className="text-xs text-muted-foreground">
              The first user to upload a PDF form for a town earns the Pioneer Badge for that town.
              Subsequent users who apply for permits in that town earn the Explorer Badge.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ReviewsTab({ reviews, isLoading }: { reviews: ReviewData[]; isLoading: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const updateStatusMutation = useMutation({
    mutationFn: async ({ reviewId, status }: { reviewId: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/reviews/${reviewId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      toast({ title: "Review Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update review.", variant: "destructive" });
    },
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      return apiRequest("DELETE", `/api/admin/reviews/${reviewId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      toast({ title: "Review Deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete review.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredReviews = filter === "all" 
    ? reviews 
    : reviews.filter(r => r.status === filter);

  const pendingCount = reviews.filter(r => r.status === "pending").length;

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400">Approved</Badge>;
      case "denied":
        return <Badge variant="secondary" className="bg-red-500/10 text-red-600 dark:text-red-400">Denied</Badge>;
      default:
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Pending</Badge>;
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h3 className="font-semibold">Review Moderation ({reviews.length})</h3>
        {pendingCount > 0 && (
          <Badge variant="destructive">{pendingCount} pending</Badge>
        )}
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32" data-testid="select-review-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {filteredReviews.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No reviews found</p>
        ) : (
          filteredReviews.map((review) => (
            <div key={review.id} className="p-4 bg-muted/50 rounded-md space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{review.businessName || "Unknown Business"}</p>
                    {getStatusBadge(review.status)}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <Star 
                        key={i} 
                        className={`w-3 h-3 ${i < review.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} 
                      />
                    ))}
                    <span className="text-sm text-muted-foreground ml-2">
                      by {review.reviewerName || "Anonymous"}
                    </span>
                  </div>
                </div>
              </div>
              
              {review.text && (
                <p className="text-sm text-muted-foreground">{review.text}</p>
              )}

              <div className="flex items-center gap-2 pt-2 flex-wrap">
                {review.status !== "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate({ reviewId: review.id, status: "approved" })}
                    disabled={updateStatusMutation.isPending}
                    data-testid={`button-approve-${review.id}`}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                )}
                {review.status !== "denied" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate({ reviewId: review.id, status: "denied" })}
                    disabled={updateStatusMutation.isPending}
                    data-testid={`button-deny-${review.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Deny
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteReviewMutation.mutate(review.id)}
                  disabled={deleteReviewMutation.isPending}
                  data-testid={`button-delete-review-${review.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
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

// ── Outreach Tab ─────────────────────────────────────────────────────────────

type OutreachResult = {
  name: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  email?: string;
  error?: string;
};

type OutreachSummary = {
  sent: number;
  failed: number;
  skipped: number;
  results: OutreachResult[];
};

type DirectoryTruck = {
  id: number;
  slug: string;
  name: string;
  status: string | null;
  outreachSent: boolean | null;
  website: string | null;
  email: string | null;
};

function OutreachTab() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");
  const [testSlug, setTestSlug] = useState("");
  const [runResults, setRunResults] = useState<OutreachSummary | null>(null);

  const { data: trucks = [] } = useQuery<DirectoryTruck[]>({
    queryKey: ["/api/directory"],
    queryFn: () => fetch("/api/directory").then((r) => r.json()),
  });

  const unclaimed = trucks.filter((t) => t.status === "unclaimed");
  const withContact = unclaimed.filter((t) => t.website || t.email);
  const alreadySent = unclaimed.filter((t) => t.outreachSent);

  const testMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/outreach/test", { email: testEmail, slug: testSlug }),
    onSuccess: () => {
      toast({ title: "Test email sent!", description: `Sent to ${testEmail}` });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const runMutation = useMutation<OutreachSummary>({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/outreach").then((r: any) => r),
    onSuccess: (data) => {
      setRunResults(data);
      const sent = data?.sent ?? 0;
      const failed = data?.failed ?? 0;
      const skipped = data?.skipped ?? 0;
      toast({ title: `Outreach complete — ${sent} sent, ${failed} failed, ${skipped} skipped` });
    },
    onError: (err: any) => {
      toast({ title: "Outreach failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          Food Truck Outreach Agent
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-2">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{unclaimed.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Unclaimed trucks</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary">{withContact.length}</p>
            <p className="text-xs text-muted-foreground mt-1">With website/email</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{alreadySent.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Already contacted</p>
          </div>
        </div>
      </Card>

      {/* Test Send */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Send className="w-4 h-4" /> Send Test Email
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="your@email.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={testSlug} onValueChange={setTestSlug}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Select a truck" />
            </SelectTrigger>
            <SelectContent>
              {trucks.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => testMutation.mutate()}
            disabled={!testEmail || !testSlug || testMutation.isPending}
          >
            {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Test"}
          </Button>
        </div>
      </Card>

      {/* Run Outreach */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Mail className="w-4 h-4" /> Run Outreach Agent
        </h3>
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            This will email all unclaimed trucks that haven't been contacted yet. Max 50/day. Can only run once every 24 hours.
          </p>
        </div>
        <Button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="bg-primary"
        >
          {runMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
          ) : (
            <><Mail className="w-4 h-4 mr-2" /> Run Outreach Agent</>
          )}
        </Button>

        {/* Results */}
        {runResults && (
          <div className="mt-6">
            <div className="flex gap-4 mb-4 text-sm">
              <span className="text-green-600 font-medium">✓ {runResults.sent ?? 0} sent</span>
              <span className="text-red-500 font-medium">✗ {runResults.failed ?? 0} failed</span>
              <span className="text-muted-foreground">— {runResults.skipped ?? 0} skipped</span>
            </div>
            {(runResults?.results ?? []).length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(runResults.results ?? []).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                  <span className="font-medium">{r.name}</span>
                  <div className="flex items-center gap-2">
                    {r.email && <span className="text-muted-foreground text-xs">{r.email}</span>}
                    <Badge
                      variant={r.status === "sent" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {r.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Orchestrator Tab ───────────────────────────────────────────────────────

interface InboundEmailRow {
  id: number;
  from: string | null;
  subject: string | null;
  intent: string | null;
  truckSlug: string | null;
  replySent: boolean | null;
  handledAt: string | null;
  createdAt: string | null;
}

interface AgentLogRow {
  id: number;
  agentName: string;
  action: string;
  success: boolean;
  durationMs: number | null;
  createdAt: string | null;
  relatedTruckSlug: string | null;
}

interface OrchestratorStats {
  totalEmails: number;
  claimed: number;
  permitInquiries: number;
  optOuts: number;
}

function OrchestratorTab() {
  const { toast } = useToast();
  const [emailPage, setEmailPage] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [testBody, setTestBody] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [classifyResult, setClassifyResult] = useState<{ intent: string; subAgent: string } | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  const { data: stats } = useQuery<OrchestratorStats>({
    queryKey: ["/api/admin/orchestrator/stats"],
    queryFn: () => fetch("/api/admin/orchestrator/stats", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: emails = [] } = useQuery<InboundEmailRow[]>({
    queryKey: ["/api/admin/orchestrator/emails", emailPage],
    queryFn: () => fetch(`/api/admin/orchestrator/emails?page=${emailPage}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: agentLogRows = [] } = useQuery<AgentLogRow[]>({
    queryKey: ["/api/admin/orchestrator/logs", logPage],
    queryFn: () => fetch(`/api/admin/orchestrator/logs?page=${logPage}`, { credentials: "include" }).then(r => r.json()),
  });

  const handleClassify = async () => {
    if (!testBody.trim() && !testSubject.trim()) return;
    setIsClassifying(true);
    setClassifyResult(null);
    try {
      const res = await fetch("/api/admin/orchestrator/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: testSubject, bodyText: testBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Classification failed");
      setClassifyResult(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsClassifying(false);
    }
  };

  const intentColor: Record<string, string> = {
    claim_listing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    catering_reply: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    permit_inquiry: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    opt_out: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    general_inquiry: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    spam: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          Orchestrator — Inbound Email Agent
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Emails", value: stats?.totalEmails ?? "—", color: "text-foreground" },
            { label: "Claimed via Email", value: stats?.claimed ?? "—", color: "text-blue-500" },
            { label: "Permit Inquiries", value: stats?.permitInquiries ?? "—", color: "text-green-500" },
            { label: "Opt-Outs", value: stats?.optOuts ?? "—", color: "text-amber-500" },
          ].map((s) => (
            <div key={s.label} className="bg-muted/50 rounded-lg p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Inbound Emails */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Inbox className="w-4 h-4" /> Recent Inbound Emails
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setEmailPage(p => Math.max(0, p - 1))} disabled={emailPage === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Page {emailPage + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => setEmailPage(p => p + 1)} disabled={emails.length < 20}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {emails.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No inbound emails yet. Configure SendGrid Inbound Parse to route replies here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2 font-medium">From</th>
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Intent</th>
                  <th className="pb-2 font-medium">Truck</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {emails.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-3 max-w-[140px] truncate text-muted-foreground text-xs">{e.from || "—"}</td>
                    <td className="py-2 pr-3 max-w-[180px] truncate text-xs">{e.subject || "—"}</td>
                    <td className="py-2 pr-3">
                      {e.intent ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${intentColor[e.intent] || "bg-muted text-muted-foreground"}`}>
                          {e.intent.replace(/_/g, " ")}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">pending</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{e.truckSlug || "—"}</td>
                    <td className="py-2 pr-3">
                      {e.replySent
                        ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Replied</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Agent Logs */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" /> Agent Logs
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setLogPage(p => Math.max(0, p - 1))} disabled={logPage === 0}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Page {logPage + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => setLogPage(p => p + 1)} disabled={agentLogRows.length < 20}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {agentLogRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">No agent logs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium">Success</th>
                  <th className="pb-2 font-medium">Duration</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agentLogRows.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        {l.agentName}
                      </span>
                    </td>
                    <td className="py-2 pr-3 max-w-[240px] truncate text-xs text-muted-foreground">{l.action}</td>
                    <td className="py-2 pr-3">
                      {l.success
                        ? <CheckCircle className="w-4 h-4 text-green-500" />
                        : <XCircle className="w-4 h-4 text-destructive" />}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {l.durationMs != null ? `${l.durationMs}ms` : "—"}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Test Orchestrator (dry run) */}
      <Card className="p-6">
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <Bot className="w-4 h-4" /> Test Orchestrator — Dry Run
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Classifies intent using Claude claude-sonnet-4-6. Does NOT send any email or update the database.</p>
        <div className="space-y-3">
          <Input
            placeholder="Subject (optional)"
            value={testSubject}
            onChange={(e) => setTestSubject(e.target.value)}
          />
          <textarea
            className="w-full min-h-[100px] p-3 rounded-md border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Paste email body here..."
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
          />
          <Button
            onClick={handleClassify}
            disabled={(!testBody.trim() && !testSubject.trim()) || isClassifying}
          >
            {isClassifying ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Classifying...</>
            ) : (
              <><Bot className="w-4 h-4 mr-2" />Classify Intent</>
            )}
          </Button>
        </div>
        {classifyResult && (
          <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Intent</span>
              <span className={`text-sm px-2 py-0.5 rounded-full font-semibold ${intentColor[classifyResult.intent] || "bg-muted"}`}>
                {classifyResult.intent.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase">Sub-agent</span>
              <p className="text-sm text-foreground mt-0.5">{classifyResult.subAgent}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── CrawlerTab ────────────────────────────────────────────────────────────────

type CrawlerStats = {
  totalTowns: number;
  townsWithForms: number;
  townsWithoutForms: number;
  totalFormsDiscovered: number;
  recentCrawls: Array<{ townId: string; townName: string | null; formsFound: number; crawledAt: string | null }>;
};

type EnrichResult = {
  trucksUpdated: number;
  fieldCounts: Record<string, number>;
};

type DiscoveryPreview = {
  totalTrucks: number;
  unclaimed: number;
  autoDiscovered: number;
  manual: number;
  lastDiscoveryRun: string | null;
};

type DiscoveryResult = {
  discovered: number;
  added: number;
  duplicates: number;
  errors: number;
  trucks: Array<{ name: string; slug: string; status: "added" | "duplicate" | "error"; source: string }>;
};

function CrawlerTab({ towns }: { towns: Town[] }) {
  const { toast } = useToast();
  const [selectedTownId, setSelectedTownId] = useState("");
  const [forceRecrawl, setForceRecrawl] = useState(false);
  const [crawlResult, setCrawlResult] = useState<{ message: string; ok: boolean } | null>(null);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [discoverySource, setDiscoverySource] = useState<"all" | "duckduckgo" | "yelp" | "directories">("all");
  const [discoveryMax, setDiscoveryMax] = useState(50);
  const [discoveryTown, setDiscoveryTown] = useState("");
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);

  const { data: stats, refetch: refetchStats } = useQuery<CrawlerStats>({
    queryKey: ["/api/admin/crawler/stats"],
    queryFn: () => fetch("/api/admin/crawler/stats", { credentials: "include" }).then((r) => r.json()),
  });

  const crawlMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/towns/${selectedTownId}/discover-forms`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: forceRecrawl }),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "Crawl failed");
        return data;
      }),
    onSuccess: (data: any) => {
      setCrawlResult({ message: `Found ${data.formsFound ?? 0} forms, downloaded ${data.downloaded ?? 0}`, ok: true });
      refetchStats();
      toast({ title: "Crawl complete", description: `${data.formsFound ?? 0} forms found` });
    },
    onError: (err: any) => {
      setCrawlResult({ message: err.message, ok: false });
      toast({ title: "Crawl failed", description: err.message, variant: "destructive" });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: () =>
      fetch("/api/admin/enrich-trucks", {
        method: "POST",
        credentials: "include",
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "Enrichment failed");
        return data as EnrichResult;
      }),
    onSuccess: (data) => {
      setEnrichResult(data);
      toast({ title: "Enrichment complete", description: `${data.trucksUpdated} trucks updated` });
    },
    onError: (err: any) => {
      toast({ title: "Enrichment failed", description: err.message, variant: "destructive" });
    },
  });

  const { data: discoveryPreview, refetch: refetchDiscovery } = useQuery<DiscoveryPreview>({
    queryKey: ["/api/admin/discover-trucks/preview"],
    queryFn: () => fetch("/api/admin/discover-trucks/preview", { credentials: "include" }).then((r) => r.json()),
  });

  const discoveryMutation = useMutation({
    mutationFn: () =>
      fetch("/api/admin/discover-trucks/run-sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxNew: discoveryMax, source: discoverySource, targetTown: discoveryTown || undefined }),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || "Discovery failed");
        return data as DiscoveryResult;
      }),
    onSuccess: (data) => {
      setDiscoveryResult(data);
      refetchDiscovery();
      toast({ title: "Discovery complete", description: `${data.added} new trucks added` });
    },
    onError: (err: any) => {
      toast({ title: "Discovery failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-primary" />
          Form Crawler Coverage
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold">{stats?.totalTowns ?? 169}</p>
            <p className="text-xs text-muted-foreground mt-1">Total CT Towns</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats?.townsWithForms ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Towns with Forms</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{stats?.townsWithoutForms ?? 169}</p>
            <p className="text-xs text-muted-foreground mt-1">Towns without Forms</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats?.totalFormsDiscovered ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Forms Discovered</p>
          </div>
        </div>
      </Card>

      {/* Single town crawler */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Globe2 className="w-4 h-4" /> Crawl a Specific Town
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <Select value={selectedTownId} onValueChange={setSelectedTownId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a town..." />
            </SelectTrigger>
            <SelectContent>
              {towns.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.townName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!selectedTownId || crawlMutation.isPending}
            onClick={() => { setCrawlResult(null); crawlMutation.mutate(); }}
          >
            {crawlMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Crawling...</>
            ) : (
              "Run Crawler"
            )}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={forceRecrawl}
            onChange={(e) => setForceRecrawl(e.target.checked)}
            className="rounded"
          />
          Bypass 24hr cooldown (force re-crawl)
        </label>
        {crawlResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${crawlResult.ok ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-red-500/10 text-red-600 border border-red-500/20"}`}>
            {crawlResult.ok ? "✓ " : "✗ "}{crawlResult.message}
          </div>
        )}
      </Card>

      {/* Food Truck Discovery */}
      <Card className="p-6">
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <Globe2 className="w-4 h-4" /> Food Truck Discovery
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Proactively scan Google, Instagram, and CT directories to find new Connecticut food trucks and seed them as unclaimed listings.
        </p>

        {/* Preview stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold">{discoveryPreview?.totalTrucks ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Trucks</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-amber-500">{discoveryPreview?.unclaimed ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Unclaimed</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-primary">{discoveryPreview?.autoDiscovered ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-Discovered</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mt-1">Last Run</p>
            <p className="text-xs font-medium mt-0.5 truncate">
              {discoveryPreview?.lastDiscoveryRun
                ? new Date(discoveryPreview.lastDiscoveryRun).toLocaleDateString()
                : "Never"}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-3 flex-wrap">
          {/* Town selector */}
          <select
            value={discoveryTown}
            onChange={(e) => setDiscoveryTown(e.target.value)}
            className="border border-input rounded-md px-3 py-2 text-sm bg-background min-w-[160px]"
          >
            <option value="">All of Connecticut</option>
            {towns.map((t) => (
              <option key={t.id} value={t.townName}>{t.townName}</option>
            ))}
          </select>

          {/* Source selector */}
          <select
            value={discoverySource}
            onChange={(e) => setDiscoverySource(e.target.value as typeof discoverySource)}
            className="border border-input rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="all">All Sources</option>
            <option value="duckduckgo">DuckDuckGo Search</option>
            <option value="yelp">Yelp Search</option>
            <option value="directories">CT Directories</option>
          </select>

          {/* Max results */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Max:</label>
            <input
              type="number"
              min={1}
              max={200}
              value={discoveryMax}
              onChange={(e) => setDiscoveryMax(Math.min(200, Math.max(1, Number(e.target.value))))}
              className="border border-input rounded-md px-3 py-2 text-sm bg-background w-20"
            />
          </div>

          <Button
            onClick={() => { setDiscoveryResult(null); discoveryMutation.mutate(); }}
            disabled={discoveryMutation.isPending}
            className="sm:ml-auto"
          >
            {discoveryMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {discoveryTown ? `Scanning ${discoveryTown}...` : "Scanning Connecticut..."}
              </>
            ) : (
              discoveryTown ? `Discover Trucks in ${discoveryTown}` : "Discover New Trucks"
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Select a town for targeted results, or leave blank to search all of CT. New trucks are added as 'Unclaimed' — run <strong>Outreach</strong> to contact them.
        </p>

        {/* Results */}
        {discoveryResult && (
          <div className="mt-2 space-y-3">
            <div className={`p-3 rounded-lg text-sm font-medium ${discoveryResult.added > 0 ? "bg-green-500/10 border border-green-500/20 text-green-600" : "bg-muted border border-border text-muted-foreground"}`}>
              Found {discoveryResult.discovered} trucks — {discoveryResult.added} added, {discoveryResult.duplicates} duplicates skipped
              {discoveryResult.errors > 0 && `, ${discoveryResult.errors} errors`}
            </div>
            {discoveryResult.trucks.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryResult.trucks.map((t, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{t.name}</td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">{t.source}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            t.status === "added"
                              ? "bg-green-500/10 text-green-600"
                              : t.status === "duplicate"
                              ? "bg-muted text-muted-foreground"
                              : "bg-red-500/10 text-red-600"
                          }`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Truck Profile Enrichment */}
      <Card className="p-6">
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <Globe2 className="w-4 h-4" /> Truck Profile Enrichment
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Crawl each truck's website to auto-fill empty profile fields (phone, email, social handles, description). Only fills fields that are currently blank.
        </p>
        <Button
          onClick={() => { setEnrichResult(null); enrichMutation.mutate(); }}
          disabled={enrichMutation.isPending}
        >
          {enrichMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enriching...</>
          ) : (
            "Enrich All Trucks"
          )}
        </Button>
        {enrichResult && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-600">
            <p className="font-medium">Updated {enrichResult.trucksUpdated} trucks</p>
            {Object.keys(enrichResult.fieldCounts).length > 0 && (
              <p className="mt-1 text-xs">
                {Object.entries(enrichResult.fieldCounts)
                  .map(([field, count]) => `${field} (${count})`)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Recent crawl history */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Recent Crawl History</h3>
        {!stats?.recentCrawls?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No crawls yet. Run a crawler above to discover forms.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Town</th>
                  <th className="pb-2 font-medium text-muted-foreground">Forms Found</th>
                  <th className="pb-2 font-medium text-muted-foreground">Crawled</th>
                  <th className="pb-2 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentCrawls.map((row) => (
                  <tr key={row.townId} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-medium">{row.townName ?? row.townId}</td>
                    <td className="py-2.5">
                      <Badge variant="secondary">{row.formsFound}</Badge>
                    </td>
                    <td className="py-2.5 text-muted-foreground text-xs">
                      {row.crawledAt ? new Date(row.crawledAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => document.getElementById("tab-forms")?.click()}
                      >
                        View Forms
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
