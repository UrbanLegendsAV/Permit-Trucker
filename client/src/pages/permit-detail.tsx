import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { TopHeader } from "@/components/top-header";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  FileText,
  Download,
  Calendar,
  MapPin,
  Clock,
  Phone,
  User,
  Edit2,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Truck,
  Utensils,
  Package,
  Trash2,
} from "lucide-react";
import type { Permit, Town, Profile, TownForm } from "@shared/schema";
import { format } from "date-fns";
import { PermitValidation } from "@/components/permit-validation";

type PermitWithDetails = Permit & {
  town?: Town | null;
  profile?: Profile | null;
  forms?: TownForm[];
};

export default function PermitDetailPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/permits/:id");
  const permitId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPermit, setEditedPermit] = useState<Partial<Permit>>({});
  const [generatingTemplateId, setGeneratingTemplateId] = useState<string | null>(null);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [unansweredQuestions, setUnansweredQuestions] = useState<Array<{
    fieldName: string;
    fieldType: string;
    label: string;
    dataKey: string | null;
  }>>([]);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [pendingFormId, setPendingFormId] = useState<string | null>(null);
  const [analyzingForm, setAnalyzingForm] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: permit, isLoading: permitLoading } = useQuery<PermitWithDetails>({
    queryKey: ["/api/permits", permitId],
    enabled: isAuthenticated && !!permitId,
  });

  const { data: towns = [] } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
    enabled: isAuthenticated,
  });

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
    enabled: isAuthenticated,
  });

  const { data: townFormsResponse } = useQuery<{ fillableForms: TownForm[], forms: TownForm[] }>({
    queryKey: ["/api/towns", permit?.townId, "forms"],
    enabled: isAuthenticated && !!permit?.townId,
  });
  const townForms = townFormsResponse?.forms || [];

  // Using townForms from database instead of hardcoded pdfTemplates

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Permit>) => {
      return apiRequest("PATCH", `/api/permits/${permitId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permits", permitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      setIsEditing(false);
      toast({ title: "Saved", description: "Permit details updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update permit.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/permits/${permitId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      toast({ title: "Deleted", description: "Permit application deleted." });
      setLocation("/permits");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete permit.", variant: "destructive" });
    },
  });

  const town = permit?.town || towns.find(t => t.id === permit?.townId);
  const profile = permit?.profile || profiles.find(p => p.id === permit?.profileId);
  const forms = permit?.forms || townForms;

  const handleEdit = () => {
    setEditedPermit({
      eventName: permit?.eventName || "",
      eventDate: permit?.eventDate,
      eventEndDate: permit?.eventEndDate,
      eventAddress: permit?.eventAddress || "",
      eventCity: permit?.eventCity || "",
      eventContactName: permit?.eventContactName || "",
      eventContactPhone: permit?.eventContactPhone || "",
      notes: permit?.notes || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(editedPermit);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedPermit({});
  };

  // Check if a form can be auto-filled (has fileData and is marked fillable)
  const canAutoFill = (form: TownForm): boolean => {
    return !!(form.isFillable && form.fileData);
  };

  // Format event data helper
  const getEventData = () => ({
    eventName: permit?.eventName || undefined,
    eventAddress: permit?.eventAddress 
      ? `${permit.eventAddress}${permit?.eventCity ? `, ${permit.eventCity}` : ''}`
      : undefined,
    eventDates: permit?.eventDate 
      ? `${new Date(permit.eventDate).toLocaleDateString()}${permit?.eventEndDate ? ` - ${new Date(permit.eventEndDate).toLocaleDateString()}` : ''}`
      : undefined,
    hoursOfOperation: permit?.eventHours && Array.isArray(permit.eventHours) 
      ? permit.eventHours.map((h: any) => `${h.start} - ${h.end}`).join(', ')
      : undefined,
    personInCharge: permit?.eventContactName || undefined,
    licenseType: permit?.permitType === "temporary" ? "temporary" as const : "seasonal" as const,
  });

  const handleGeneratePacket = async (formId: string) => {
    if (!permit?.profileId) {
      toast({ 
        title: "No Profile", 
        description: "This permit has no vehicle profile linked. Please link a profile first.", 
        variant: "destructive" 
      });
      return;
    }

    if (!permit?.townId) {
      toast({ 
        title: "No Town", 
        description: "This permit has no town linked.", 
        variant: "destructive" 
      });
      return;
    }

    // First, analyze form for unanswered questions
    setAnalyzingForm(true);
    setGeneratingTemplateId(formId);
    
    try {
      const analyzeResponse = await fetch(`/api/towns/${permit.townId}/forms/${formId}/analyze-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profileId: permit.profileId, eventData: getEventData() }),
      });

      if (analyzeResponse.ok) {
        const analysis = await analyzeResponse.json();
        
        if (analysis.unansweredQuestions && analysis.unansweredQuestions.length > 0) {
          // Show questionnaire modal
          setUnansweredQuestions(analysis.unansweredQuestions);
          setUserAnswers({});
          setPendingFormId(formId);
          setShowQuestionnaire(true);
          setAnalyzingForm(false);
          setGeneratingTemplateId(null);
          return;
        }
      }
      
      // No unanswered questions, proceed with generation
      await generatePdfWithAnswers(formId, {});
    } catch (error: any) {
      toast({ 
        title: "Analysis Failed", 
        description: "Could not analyze form. Generating with available data.",
        variant: "destructive" 
      });
      // Try generating anyway
      await generatePdfWithAnswers(formId, {});
    } finally {
      setAnalyzingForm(false);
    }
  };

  const generatePdfWithAnswers = async (formId: string, answers: Record<string, string>) => {
    if (!permit?.townId || !permit?.profileId) return;
    
    setGeneratingTemplateId(formId);
    try {
      const response = await fetch(`/api/towns/${permit.townId}/forms/${formId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          profileId: permit.profileId, 
          includeDocuments: true, 
          eventData: getEventData(),
          userAnswers: answers 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate permit package");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${town?.townName || "permit"}_package.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ 
        title: "Package Generated", 
        description: "Your permit package has been downloaded with your information pre-filled." 
      });
    } catch (error: any) {
      toast({ 
        title: "Generation Failed", 
        description: error.message || "Failed to generate permit package. Make sure your profile has analyzed documents.",
        variant: "destructive" 
      });
    } finally {
      setGeneratingTemplateId(null);
      setShowQuestionnaire(false);
      setPendingFormId(null);
    }
  };

  const handleSubmitAnswers = () => {
    if (pendingFormId) {
      generatePdfWithAnswers(pendingFormId, userAnswers);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "pending":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "draft":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "rejected":
      case "expired":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatPermitType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  if (authLoading || permitLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <TopHeader title="Permit Not Found" />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Permit Not Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This permit doesn't exist or you don't have access to it.
            </p>
            <Button onClick={() => setLocation("/permits")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Permits
            </Button>
          </Card>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title="Permit Details" />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/permits")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-xl font-bold">
                {formatPermitType(permit.permitType)}
              </h1>
              <Badge className={getStatusColor(permit.status || "draft")}>
                {(permit.status || "draft").charAt(0).toUpperCase() + (permit.status || "draft").slice(1)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {town?.townName}, {town?.state}
            </p>
          </div>
          {!isEditing ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEdit} data-testid="button-edit-permit">
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-delete-permit">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Permit Application?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this permit application and all associated data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="bg-destructive text-destructive-foreground"
                    >
                      {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-permit">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          )}
        </div>

        {permitId && (
          <PermitValidation permitId={permitId} />
        )}

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" data-testid="tab-details">Event Details</TabsTrigger>
            <TabsTrigger value="forms" data-testid="tab-forms">Forms ({forms.length})</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">My Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Event Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="eventName">Event Name</Label>
                        <Input
                          id="eventName"
                          value={editedPermit.eventName || ""}
                          onChange={e => setEditedPermit({ ...editedPermit, eventName: e.target.value })}
                          placeholder="e.g., Bethel Town Fair"
                          data-testid="input-event-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eventDate">Event Date</Label>
                        <Input
                          id="eventDate"
                          type="date"
                          value={editedPermit.eventDate ? format(new Date(editedPermit.eventDate), "yyyy-MM-dd") : ""}
                          onChange={e => setEditedPermit({ ...editedPermit, eventDate: e.target.value ? new Date(e.target.value) : undefined })}
                          data-testid="input-event-date"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="eventAddress">Event Address</Label>
                        <Input
                          id="eventAddress"
                          value={editedPermit.eventAddress || ""}
                          onChange={e => setEditedPermit({ ...editedPermit, eventAddress: e.target.value })}
                          placeholder="123 Main Street"
                          data-testid="input-event-address"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eventCity">City</Label>
                        <Input
                          id="eventCity"
                          value={editedPermit.eventCity || ""}
                          onChange={e => setEditedPermit({ ...editedPermit, eventCity: e.target.value })}
                          placeholder="Bethel"
                          data-testid="input-event-city"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="eventContactName">Contact Name</Label>
                        <Input
                          id="eventContactName"
                          value={editedPermit.eventContactName || ""}
                          onChange={e => setEditedPermit({ ...editedPermit, eventContactName: e.target.value })}
                          placeholder="John Doe"
                          data-testid="input-contact-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eventContactPhone">Contact Phone</Label>
                        <Input
                          id="eventContactPhone"
                          value={editedPermit.eventContactPhone || ""}
                          onChange={e => setEditedPermit({ ...editedPermit, eventContactPhone: e.target.value })}
                          placeholder="(555) 123-4567"
                          data-testid="input-contact-phone"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={editedPermit.notes || ""}
                        onChange={e => setEditedPermit({ ...editedPermit, notes: e.target.value })}
                        placeholder="Any additional notes..."
                        data-testid="input-notes"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 mt-1 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Event Name</p>
                        <p className="font-medium">{permit.eventName || "Not specified"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 mt-1 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Event Date</p>
                        <p className="font-medium">
                          {permit.eventDate ? format(new Date(permit.eventDate), "MMMM d, yyyy") : "Not specified"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 mt-1 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">
                          {permit.eventAddress || permit.eventCity
                            ? `${permit.eventAddress || ""}${permit.eventAddress && permit.eventCity ? ", " : ""}${permit.eventCity || ""}`
                            : "Not specified"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <User className="w-4 h-4 mt-1 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Contact</p>
                        <p className="font-medium">{permit.eventContactName || "Not specified"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="w-4 h-4 mt-1 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{permit.eventContactPhone || "Not specified"}</p>
                      </div>
                    </div>
                    {permit.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm">{permit.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Application Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Permit Type</span>
                  <span className="font-medium">{formatPermitType(permit.permitType)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Town</span>
                  <span className="font-medium">{town?.townName}, {town?.state}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Applied</span>
                  <span className="font-medium">
                    {permit.appliedDate ? format(new Date(permit.appliedDate), "MMM d, yyyy") : "Draft"}
                  </span>
                </div>
                {permit.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires</span>
                    <span className="font-medium">{format(new Date(permit.expiryDate), "MMM d, yyyy")}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forms" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Required Forms for {town?.townName}</CardTitle>
              </CardHeader>
              <CardContent>
                {forms.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No forms uploaded for this town yet.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Check back later or contact the town directly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {forms.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center justify-between p-4 border rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-md">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{form.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {form.category?.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {form.fileData ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = `data:${form.fileType || "application/pdf"};base64,${form.fileData}`;
                                link.download = form.fileName || `${form.name}.pdf`;
                                link.click();
                              }}
                              data-testid={`button-download-form-${form.id}`}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          ) : (
                            <Badge variant="secondary">Not Available</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Generate Permit Packet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate a pre-filled permit application with your profile information and supporting documents.
                </p>
                {!profile?.parsedDataLog ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      Your profile needs analyzed documents before generating a permit packet. 
                      Please upload and analyze your documents first.
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-3" 
                      onClick={() => setLocation("/profile")}
                    >
                      Go to Profile
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Select a form template to generate your pre-filled application:
                    </p>
                    <div className="grid gap-2">
                      {townForms
                        .filter((form) => canAutoFill(form))
                        .map((form) => (
                          <Button
                            key={form.id}
                            onClick={() => handleGeneratePacket(form.id)}
                            disabled={generatingTemplateId !== null}
                            variant="outline"
                            className="justify-start h-auto py-3"
                            data-testid={`button-generate-${form.id}`}
                          >
                            {generatingTemplateId === form.id ? (
                              <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4 mr-3" />
                            )}
                            <div className="text-left">
                              <div className="font-medium">{form.name}</div>
                              <div className="text-xs text-muted-foreground">{form.category || "Form"}</div>
                            </div>
                          </Button>
                        ))}
                      {townForms.filter((f) => canAutoFill(f)).length === 0 && (
                        <p className="text-sm text-muted-foreground py-2">
                          No fillable form templates available for {town?.townName} yet. Upload forms in the admin dashboard.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Vehicle Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profile ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle Name</span>
                      <span className="font-medium">{profile.vehicleName || profile.extractedData?.businessName || "Not specified"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle Type</span>
                      <span className="font-medium capitalize">{profile.vehicleType}</span>
                    </div>
                    {(profile.vinPlate || profile.extractedData?.vin) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VIN/Plate</span>
                        <span className="font-medium font-mono text-xs">{profile.vinPlate || profile.extractedData?.vin}</span>
                      </div>
                    )}
                    {profile.menuType && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Menu Type</span>
                        <span className="font-medium">{profile.menuType}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Truck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No vehicle profile linked</p>
                    <Button variant="outline" className="mt-3" onClick={() => setLocation("/profile")}>
                      Go to Profile
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Utensils className="w-5 h-5" />
                  Uploaded Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profile?.uploadsJson?.documents && profile.uploadsJson.documents.length > 0 ? (
                  <div className="space-y-2">
                    {profile.uploadsJson.documents.map((doc: { name: string; type: string; url: string }, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{doc.name || doc.type}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {doc.type?.replace(/_/g, " ")}
                            </p>
                          </div>
                        </div>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No documents uploaded yet</p>
                    <Button variant="outline" className="mt-3" onClick={() => setLocation("/profile")}>
                      Upload Documents
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />

      {/* Questionnaire Modal for unanswered form questions */}
      <Dialog open={showQuestionnaire} onOpenChange={setShowQuestionnaire}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Additional Information Needed</DialogTitle>
            <DialogDescription>
              Please answer the following questions to complete your permit application.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh] pr-4">
            <div className="space-y-4">
              {unansweredQuestions.map((question, idx) => (
                <div key={question.fieldName} className="space-y-2">
                  <Label htmlFor={`question-${idx}`} className="text-sm font-medium">
                    {question.label}
                  </Label>
                  <Textarea
                    id={`question-${idx}`}
                    placeholder="Enter your answer..."
                    value={userAnswers[question.fieldName] || ""}
                    onChange={(e) => setUserAnswers(prev => ({
                      ...prev,
                      [question.fieldName]: e.target.value
                    }))}
                    className="min-h-[60px]"
                    data-testid={`input-question-${idx}`}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowQuestionnaire(false);
                setPendingFormId(null);
              }}
              data-testid="button-skip-questions"
            >
              Skip
            </Button>
            <Button 
              onClick={handleSubmitAnswers}
              disabled={generatingTemplateId !== null}
              data-testid="button-submit-answers"
            >
              {generatingTemplateId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate PDF"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
