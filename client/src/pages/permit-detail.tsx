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
  ExternalLink,
  Globe,
  Copy,
  ClipboardCheck,
  Lock,
  CreditCard,
  Sparkles,
} from "lucide-react";
import type { Permit, Town, Profile, TownForm } from "@shared/schema";
import { format } from "date-fns";
import { PermitValidation } from "@/components/permit-validation";

type PermitWithDetails = Permit & {
  town?: Town | null;
  profile?: Profile | null;
  forms?: TownForm[];
};

type BillingStatus = {
  hasActiveSubscription: boolean;
  subscriptionStatus: string;
  planName: string;
  monthlyPrice: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
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
  const [autoFilledCount, setAutoFilledCount] = useState(0);
  const [showPortalAssist, setShowPortalAssist] = useState(false);
  const [portalAssistFormId, setPortalAssistFormId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [portalPromptText, setPortalPromptText] = useState("");
  const [portalPromptAnswers, setPortalPromptAnswers] = useState<Array<{ id: string; prompt: string; answer: string; readyToCopy: boolean; source?: string; dataKey?: string | null }>>([]);
  const [portalPromptLoading, setPortalPromptLoading] = useState(false);
  const [fetchingFormId, setFetchingFormId] = useState<string | null>(null);
  const [generatedPacketUrl, setGeneratedPacketUrl] = useState<string | null>(null);
  const [generatedPacketFilename, setGeneratedPacketFilename] = useState<string>("");
  // ViewPoint credential dialog
  const [showCredDialog, setShowCredDialog] = useState(false);
  const [viewPointFormId, setViewPointFormId] = useState<string | null>(null);
  const [vpUsername, setVpUsername] = useState("");
  const [vpPassword, setVpPassword] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  // Portal automation result
  const [runningPortalAuto, setRunningPortalAuto] = useState(false);
  const [portalAutoResult, setPortalAutoResult] = useState<{
    screenshotBase64: string | null;
    filledCount: number;
    error: string | null;
    portalUrl: string;
  } | null>(null);
  const [showPortalResult, setShowPortalResult] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/auth";
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

  const { data: billingStatus, refetch: refetchBillingStatus } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    const billingState = new URLSearchParams(window.location.search).get("billing");
    if (billingState === "success") {
      fetch("/api/billing/refresh", {
        method: "POST",
        credentials: "include",
      })
        .then(() => refetchBillingStatus())
        .then(() => {
          toast({
            title: "Checkout complete",
            description: "We refreshed your PermitPilot Pro access.",
          });
        })
        .catch(() => {
          toast({
            title: "Checkout complete",
            description: "We couldn’t confirm billing yet, but you can refresh in a moment.",
          });
        });
    }
  }, [refetchBillingStatus, toast]);

  const [discoveryPollCount, setDiscoveryPollCount] = useState(0);
  const maxDiscoveryPolls = 6;

  const { data: townFormsResponse } = useQuery<{
    fillableForms: TownForm[];
    forms: TownForm[];
    discoveryStarted?: boolean;
    discoveryInProgress?: boolean;
    message?: string;
  }>({
    queryKey: ["/api/towns", permit?.townId, "forms"],
    enabled: isAuthenticated && !!permit?.townId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const isDiscovering = data?.discoveryStarted || data?.discoveryInProgress;
      if (isDiscovering && discoveryPollCount < maxDiscoveryPolls) {
        return 5000;
      }
      return false;
    },
  });

  const isDiscovering = !!(townFormsResponse?.discoveryStarted || townFormsResponse?.discoveryInProgress);

  useEffect(() => {
    if (isDiscovering) {
      setDiscoveryPollCount(prev => prev + 1);
    } else if (townFormsResponse && !isDiscovering) {
      setDiscoveryPollCount(0);
    }
  }, [townFormsResponse, isDiscovering]);

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

  // Check if a form can be processed into a permit package.
  // Fillable PDFs get direct field injection; flat PDFs get a supplemental answer sheet.
  const canAutoFill = (form: TownForm): boolean => {
    return !!form.fileData;
  };

  // Check if a form is portal-based (SeamlessDocs, OpenGov, ViewPoint)
  const isPortalForm = (form: TownForm): boolean => {
    const url = form.externalUrl || form.sourceUrl || "";
    return url.includes("seamlessdocs") || url.includes("opengov") || url.includes("viewpoint");
  };

  // Get portal provider name
  const getPortalProvider = (form: TownForm): string => {
    const url = form.externalUrl || form.sourceUrl || "";
    if (url.includes("seamlessdocs")) return "SeamlessDocs";
    if (url.includes("opengov")) return "OpenGov";
    if (url.includes("viewpoint")) return "ViewPoint";
    return "Portal";
  };

  // Handle portal submission (copy-paste assist)
  const handlePortalAssist = (formId: string) => {
    setPortalAssistFormId(formId);
    setShowPortalAssist(true);
    setCopiedField(null);
    setPortalPromptText("");
    setPortalPromptAnswers([]);
  };

  // Check if a form uses ViewPoint specifically
  const isViewPointForm = (form: TownForm): boolean => {
    const url = form.externalUrl || form.sourceUrl || "";
    return url.includes("viewpoint");
  };

  // ViewPoint automation remains in the codebase, but the main product flow now uses
  // guided copy-paste assistance for all portal-based permits.
  const handleViewPointFormClick = async (formId: string) => {
    if (!permit?.townId) return;
    setViewPointFormId(formId);
    try {
      const res = await fetch(`/api/portal-credentials?townId=${permit.townId}`, { credentials: "include" });
      const data = await res.json();
      if (data.exists && data.credentialId) {
        await runViewPointAutomation(formId, data.credentialId);
      } else {
        setVpUsername("");
        setVpPassword("");
        setShowCredDialog(true);
      }
    } catch {
      toast({ title: "Error", description: "Could not check portal credentials.", variant: "destructive" });
    }
  };

  const runViewPointAutomation = async (formId: string, credentialId?: string) => {
    if (!permit?.townId || !permit?.profileId) {
      toast({ title: "Missing data", description: "Profile and town required for portal automation.", variant: "destructive" });
      return;
    }
    setRunningPortalAuto(true);
    setShowCredDialog(false);
    try {
      const res = await fetch(`/api/towns/${permit.townId}/forms/${formId}/portal-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profileId: permit.profileId,
          permitId: permit.id,
          eventData: getEventData(),
          userAnswers: {},
          submitForm: false,
          ...(credentialId ? { credentialId } : {}),
        }),
      });
      const data = await res.json();
      const form = townForms.find((f) => f.id === formId);
      const url = (data.portalUrl) || form?.externalUrl || form?.sourceUrl || town?.portalUrl || "";
      if (res.ok && data.success) {
        setPortalAutoResult({ screenshotBase64: data.screenshotBase64 || null, filledCount: data.filledFields?.length || 0, error: null, portalUrl: url });
      } else {
        setPortalAutoResult({ screenshotBase64: null, filledCount: 0, error: data.message || "Portal automation failed", portalUrl: url });
      }
      setShowPortalResult(true);
    } catch (err: any) {
      const form = townForms.find((f) => f.id === formId);
      const url = form?.externalUrl || form?.sourceUrl || town?.portalUrl || "";
      setPortalAutoResult({ screenshotBase64: null, filledCount: 0, error: err.message || "Connection error", portalUrl: url });
      setShowPortalResult(true);
    } finally {
      setRunningPortalAuto(false);
    }
  };

  const handleSaveAndRunCreds = async () => {
    if (!vpUsername || !vpPassword || !permit?.townId || !viewPointFormId) return;
    setSavingCreds(true);
    try {
      const res = await fetch("/api/portal-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ townId: permit.townId, username: vpUsername, password: vpPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save credentials");
      await runViewPointAutomation(viewPointFormId, data.id);
    } catch (err: any) {
      toast({ title: "Error saving credentials", description: err.message, variant: "destructive" });
    } finally {
      setSavingCreds(false);
    }
  };

  const copyToClipboard = async (value: string, fieldKey: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard", variant: "destructive" });
    }
  };

  const startCheckout = async () => {
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          successUrl: `${window.location.origin}/permits/${permitId}?billing=success`,
          cancelUrl: `${window.location.origin}/permits/${permitId}?billing=cancelled`,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to start checkout");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      toast({
        title: "Billing setup incomplete",
        description: "Stripe keys still need to be added before checkout can open.",
        variant: "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Checkout unavailable",
        description: error.message || "Could not start Stripe checkout.",
        variant: "destructive",
      });
    }
  };

  const getPortalAssistData = (): Array<{ label: string; value: string; key: string }> => {
    const parsedData = profile?.parsedDataLog as Record<string, any> | null;
    const fields: Array<{ label: string; value: string; key: string }> = [];
    
    const addField = (label: string, value: string | undefined | null, key: string) => {
      if (value && value.trim()) fields.push({ label, value: value.trim(), key });
    };

    addField("Business Name", parsedData?.contact_info?.business_name?.value, "business_name");
    addField("Owner / Applicant Name", parsedData?.contact_info?.applicant_name?.value || parsedData?.contact_info?.owner_name?.value, "owner_name");
    addField("Phone", parsedData?.contact_info?.phone?.value, "phone");
    addField("Email", parsedData?.contact_info?.email?.value, "email");
    addField("Mailing Address", parsedData?.contact_info?.mailing_address?.value, "mailing_address");
    addField("VIN / License Plate", profile?.vinPlate || parsedData?.vehicle_info?.vin?.value, "vin");
    addField("Commissary Name", parsedData?.commissary_info?.commissary_name?.value || profile?.commissaryName, "commissary_name");
    addField("Commissary Address", parsedData?.commissary_info?.commissary_address?.value || profile?.commissaryAddress, "commissary_address");
    addField("Menu Items", parsedData?.menu_and_prep?.food_items_list?.value, "menu_items");
    addField("Water Supply", parsedData?.operations?.water_supply_type?.value, "water_supply");

    if (permit?.eventName) addField("Event Name", permit.eventName, "event_name");
    if (permit?.eventAddress) addField("Event Location", `${permit.eventAddress}${permit?.eventCity ? `, ${permit.eventCity}` : ''}`, "event_location");
    if (permit?.eventDate) addField("Event Date", new Date(permit.eventDate).toLocaleDateString(), "event_date");
    if (permit?.eventContactName) addField("Event Contact", permit.eventContactName, "event_contact");
    if (permit?.eventContactPhone) addField("Event Contact Phone", permit.eventContactPhone, "event_contact_phone");

    return fields;
  };

  const analyzePortalPrompts = async () => {
    if (!permit?.profileId || !portalPromptText.trim()) {
      toast({ title: "Paste portal questions first", description: "Paste the form labels/questions from the portal page so we can order your answers.", variant: "destructive" });
      return;
    }

    setPortalPromptLoading(true);
    try {
      const response = await fetch("/api/portal-assist/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profileId: permit.profileId,
          pastedText: portalPromptText,
          townId: permit.townId,
          formId: portalAssistFormId,
          eventData: getEventData(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402) {
          toast({
            title: "PermitPilot Pro required",
            description: data.message || "Portal Assist is part of the paid permit workflow.",
          });
          await startCheckout();
          return;
        }
        throw new Error(data.message || "Failed to analyze portal prompts");
      }
      setPortalPromptAnswers(data.answers || []);
      toast({
        title: "Portal answers prepared",
        description: `${data.matchedCount || 0} of ${data.promptsCount || 0} prompts matched to your saved data.`,
      });
    } catch (error: any) {
      toast({ title: "Analysis failed", description: error.message || "Could not prepare portal answers.", variant: "destructive" });
    } finally {
      setPortalPromptLoading(false);
    }
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
          setUnansweredQuestions(analysis.unansweredQuestions);
          setAutoFilledCount(analysis.answeredFields || 0);
          setUserAnswers({});
          setPendingFormId(formId);
          setShowQuestionnaire(true);
          setAnalyzingForm(false);
          setGeneratingTemplateId(null);
          return;
        }
      } else if (analyzeResponse.status === 402) {
        const billingError = await analyzeResponse.json();
        toast({
          title: "PermitPilot Pro required",
          description: billingError.message || "PDF autofill is part of the paid permit workflow.",
        });
        await startCheckout();
        return;
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
          permitId,
          profileId: permit.profileId, 
          includeDocuments: true, 
          eventData: getEventData(),
          userAnswers: answers 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 402) {
          toast({
            title: "PermitPilot Pro required",
            description: error.message || "PDF autofill is part of the paid permit workflow.",
          });
          await startCheckout();
          return;
        }
        throw new Error(error.message || "Failed to generate permit package");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      const dlFilename = filenameMatch?.[1] || `PermitPilot-${town?.townName || 'permit'}-${new Date().toISOString().slice(0,10)}.pdf`;

      // Trigger immediate download
      const a = document.createElement("a");
      a.href = url;
      a.download = dlFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Store for "Download Again" button
      setGeneratedPacketUrl(url);
      setGeneratedPacketFilename(dlFilename);

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
    <div className="app-shell min-h-screen bg-background pb-20">
      <TopHeader title="Permit Details" />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="premium-panel hero-wash overflow-hidden p-5 md:p-7">
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/permits")} data-testid="button-back" className="rounded-full border border-white/10 bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </Button>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-white/12 text-foreground border-white/10">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Permit workflow
                  </Badge>
                  <span className="section-kicker">Town filing workspace</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-display text-2xl md:text-4xl font-semibold tracking-tight">
                    {formatPermitType(permit.permitType)}
                  </h1>
                  <Badge className={getStatusColor(permit.status || "draft")}>
                    {(permit.status || "draft").charAt(0).toUpperCase() + (permit.status || "draft").slice(1)}
                  </Badge>
                </div>
                <p className="text-sm md:text-base text-muted-foreground">
                  {town?.townName}, {town?.state} • {permit.eventName || "Event details still being refined"}
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="metric-tile">
                    <p className="section-kicker">Town</p>
                    <p className="mt-2 text-base font-semibold">{town?.townName || "Unassigned"}</p>
                    <p className="text-sm text-muted-foreground">permit source of truth</p>
                  </div>
                  <div className="metric-tile">
                    <p className="section-kicker">Vehicle</p>
                    <p className="mt-2 text-base font-semibold">{profile?.vehicleName || profile?.menuType || "Profile linked"}</p>
                    <p className="text-sm text-muted-foreground">{profile?.vehicleType ? `${profile.vehicleType} profile` : "owner profile ready"}</p>
                  </div>
                  <div className="metric-tile">
                    <p className="section-kicker">Applied</p>
                    <p className="mt-2 text-base font-semibold">
                      {permit.appliedDate ? format(new Date(permit.appliedDate), "MMM d, yyyy") : "Draft state"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {permit.expiryDate ? `expires ${format(new Date(permit.expiryDate), "MMM d, yyyy")}` : "ready for packet generation"}
                    </p>
                  </div>
                </div>
              </div>

              {!isEditing ? (
                <div className="flex gap-2 self-start">
                  <Button variant="outline" onClick={handleEdit} data-testid="button-edit-permit" className="rounded-full">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" data-testid="button-delete-permit" className="rounded-full">
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
                <div className="flex gap-2 self-start">
                  <Button variant="outline" onClick={handleCancel} data-testid="button-cancel-edit" className="rounded-full">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-permit" className="rounded-full">
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save
                  </Button>
                </div>
	              )}
	            </div>
	          </div>
	        </section>

        {permitId && (
          <PermitValidation permitId={permitId} />
        )}

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-full bg-card/70 p-1 premium-subpanel">
            <TabsTrigger value="details" data-testid="tab-details">Event Details</TabsTrigger>
            <TabsTrigger value="forms" data-testid="tab-forms">
              {isDiscovering ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Forms
                </span>
              ) : (
                `Forms (${forms.length})`
              )}
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">My Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <Card className="premium-subpanel">
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

            <Card className="premium-subpanel">
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
            {generatedPacketUrl && (
              <div className="mb-4 premium-subpanel border-emerald-400/20 bg-emerald-500/10 p-3 flex items-center justify-between">
                <span className="text-sm text-green-700 dark:text-green-300 font-medium">Packet generated!</span>
                <Button size="sm" variant="outline" onClick={() => {
                  const a = document.createElement('a');
                  a.href = generatedPacketUrl;
                  a.download = generatedPacketFilename;
                  a.click();
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Again
                </Button>
              </div>
            )}
            {billingStatus && !billingStatus.hasActiveSubscription && (
              <Card className="premium-subpanel border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-600" />
                        <p className="font-medium">
                          {billingStatus.planName} unlocks PDF autofill and portal copy-paste assist
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        The paid workflow covers auto-filled PDF permit packets and ordered portal answers for browser-based town applications.
                      </p>
                      <Badge variant="outline" className="w-fit">
                        ${billingStatus.monthlyPrice.toFixed(2)}/month
                      </Badge>
                    </div>
                    <Button onClick={startCheckout} data-testid="button-start-checkout">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Unlock PermitPilot Pro
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="premium-subpanel">
              <CardHeader>
                <CardTitle className="text-lg">Required Forms for {town?.townName}</CardTitle>
              </CardHeader>
              <CardContent>
                {isDiscovering ? (
                  <div className="text-center py-8" data-testid="discovery-loading">
                    <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
                    <p className="font-medium">Searching for official forms...</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This may take up to 30 seconds. We're checking {town?.townName}'s website for permit applications.
                    </p>
                  </div>
                ) : forms.length === 0 ? (
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
                            <div className="flex items-center gap-2 flex-wrap">
                              {form.category && (
                                <span className="text-sm text-muted-foreground">
                                  {form.category.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                                </span>
                              )}
                              {!form.category && (
                                <span className="text-sm text-muted-foreground">
                                  {form.isAiDiscovered ? "AI Discovered" : "Permit Form"}
                                </span>
                              )}
                              {form.fileData && form.isFillable && (
                                <Badge variant="outline" className="text-xs">Fillable Form</Badge>
                              )}
                              {form.fileData && !form.isFillable && (
                                <Badge variant="secondary" className="text-xs">Flat PDF + Answer Sheet</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {form.fileData && (
                            <Button
                              size="sm"
                              disabled={generatingTemplateId !== null || Boolean(billingStatus && !billingStatus.hasActiveSubscription)}
                              onClick={() => handleGeneratePacket(form.id)}
                              data-testid={`button-generate-form-${form.id}`}
                            >
                              {generatingTemplateId === form.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4 mr-2" />
                              )}
                              {form.isFillable ? "Generate" : "Build Packet"}
                            </Button>
                          )}
                          {form.fileData && (
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
                          )}
                          {form.sourceUrl && !form.fileData && !isPortalForm(form) && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={fetchingFormId === form.id}
                                onClick={async () => {
                                  setFetchingFormId(form.id);
                                  try {
                                    const res = await apiRequest("POST", `/api/towns/${permit?.townId}/forms/${form.id}/fetch-pdf`);
                                    const data = await res.json();
                                    if (data.success) {
                                      toast({ title: "PDF Ready", description: `${form.name} is now available.` });
                                      queryClient.invalidateQueries({ queryKey: ["/api/towns", permit?.townId, "forms"] });
                                    }
                                  } catch {
                                    toast({ 
                                      title: "Could not fetch PDF", 
                                      description: "The source may be unavailable. Try visiting the town website directly.",
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setFetchingFormId(null);
                                  }
                                }}
                                data-testid={`button-fetch-pdf-${form.id}`}
                              >
                                {fetchingFormId === form.id ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4 mr-2" />
                                )}
                                {fetchingFormId === form.id ? "Fetching..." : "Fetch PDF"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(form.sourceUrl!, '_blank')}
                                title="Open source URL"
                                data-testid={`button-visit-source-${form.id}`}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                          {isPortalForm(form) && isViewPointForm(form) && (
                            <Button
                              size="sm"
                              onClick={() => handleViewPointFormClick(form.id)}
                              disabled={runningPortalAuto}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1"
                            >
                              {runningPortalAuto && viewPointFormId === form.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Globe className="w-3 h-3" />
                              )}
                              Auto-fill Portal
                            </Button>
                          )}
                          {isPortalForm(form) && !isViewPointForm(form) && (
                            <Badge variant="outline" className="text-xs">
                              <Globe className="w-3 h-3 mr-1" />
                              {getPortalProvider(form)}
                            </Badge>
                          )}
                          {!form.fileData && !form.sourceUrl && !isPortalForm(form) && (
                            <Badge variant="secondary">Not Available</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="premium-subpanel">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Generate Permit Packet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border soft-divider bg-background/70 p-4">
                    <p className="section-kicker">PDF autofill</p>
                    <p className="mt-2 text-sm font-semibold">Direct on fillable forms</p>
                    <p className="mt-1 text-xs text-muted-foreground">Best case for towns with structured PDFs.</p>
                  </div>
                  <div className="rounded-2xl border soft-divider bg-background/70 p-4">
                    <p className="section-kicker">Flat municipal PDFs</p>
                    <p className="mt-2 text-sm font-semibold">Answer sheet appended</p>
                    <p className="mt-1 text-xs text-muted-foreground">Still useful when towns publish non-editable packets.</p>
                  </div>
                  <div className="rounded-2xl border soft-divider bg-background/70 p-4">
                    <p className="section-kicker">Portal towns</p>
                    <p className="mt-2 text-sm font-semibold">Copy-paste assistant</p>
                    <p className="mt-1 text-xs text-muted-foreground">Answers stay ordered so owners can move page by page.</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Generate a permit-ready PDF package. Fillable PDFs are auto-filled directly, and flat municipal PDFs include a structured answer sheet appended to the packet.
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
                              <div className="text-xs text-muted-foreground">
                                {form.category || "Form"}{form.isFillable ? "" : " • Includes answer sheet for flat PDF"}
                              </div>
                            </div>
                          </Button>
                        ))}
                      {townForms.filter((f) => canAutoFill(f)).length === 0 && (
                        <p className="text-sm text-muted-foreground py-2">
                          No form templates with PDF data available for {town?.townName} yet. Forms may still be loading from discovery.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Portal Assist Section */}
            {(townForms.filter((f) => isPortalForm(f)).length > 0 || town?.portalUrl) && (
            <Card className="premium-subpanel">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                    Portal Assist
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    PDF permits are the only forms we auto-fill. For portal towns, paste the questions from each portal page and we’ll return your answers in the same order so you can copy and paste them fast.
                  </p>
                  {!profile?.parsedDataLog ? (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        Your profile needs analyzed documents before using Portal Assist.
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
                      {townForms
                        .filter((form) => isPortalForm(form))
                        .map((form) => (
                          <Button
                            key={form.id}
                            onClick={() => handlePortalAssist(form.id)}
                            variant="outline"
                            disabled={Boolean(billingStatus && !billingStatus.hasActiveSubscription)}
                            className="justify-start h-auto py-3 w-full"
                            data-testid={`button-portal-assist-${form.id}`}
                          >
                            <ClipboardCheck className="w-4 h-4 mr-3" />
                            <div className="text-left flex-1">
                              <div className="font-medium">{form.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Paste the portal questions from {getPortalProvider(form)} and get ordered copy-ready answers
                              </div>
                            </div>
                            <Badge variant="outline" className="ml-2 text-xs shrink-0">Assistant</Badge>
                          </Button>
                        ))}
                      {town?.portalUrl && townForms.filter((f) => isPortalForm(f)).length === 0 && (
                        <Button
                          onClick={() => {
                            setPortalAssistFormId(null);
                            setShowPortalAssist(true);
                            setCopiedField(null);
                          }}
                          variant="outline"
                          disabled={Boolean(billingStatus && !billingStatus.hasActiveSubscription)}
                          className="justify-start h-auto py-3"
                          data-testid="button-portal-assist-generic"
                        >
                          <ClipboardCheck className="w-4 h-4 mr-3" />
                          <div className="text-left flex-1">
                            <div className="font-medium">Open Town Portal</div>
                            <div className="text-xs text-muted-foreground">Copy-paste your data into the portal</div>
                          </div>
                          <ExternalLink className="w-4 h-4 ml-2 opacity-50" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-4 mt-4">
            <Card className="premium-subpanel">
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

            <Card className="premium-subpanel">
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
              {autoFilledCount > 0 && (
                <span className="block mb-2 text-green-600 dark:text-green-400 font-medium" data-testid="text-auto-filled-count">
                  {autoFilledCount} {autoFilledCount === 1 ? 'field' : 'fields'} will be auto-filled from your profile
                </span>
              )}
              Please answer the remaining {unansweredQuestions.length} {unansweredQuestions.length === 1 ? 'question' : 'questions'} below.
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

      {/* ViewPoint Credential Dialog */}
      <Dialog open={showCredDialog} onOpenChange={setShowCredDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Portal Login Required</DialogTitle>
            <DialogDescription>
              Enter your ViewPoint portal account credentials. These are stored encrypted and never shared.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vp-username">Username / Email</Label>
              <Input
                id="vp-username"
                value={vpUsername}
                onChange={(e) => setVpUsername(e.target.value)}
                placeholder="your@email.com"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vp-password">Password</Label>
              <Input
                id="vp-password"
                type="password"
                value={vpPassword}
                onChange={(e) => setVpPassword(e.target.value)}
                placeholder="Your portal password"
                autoComplete="current-password"
                onKeyDown={(e) => { if (e.key === "Enter" && vpUsername && vpPassword) handleSaveAndRunCreds(); }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              These credentials are AES-256 encrypted and only used to auto-fill this form on your behalf.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCredDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSaveAndRunCreds}
              disabled={!vpUsername || !vpPassword || savingCreds}
            >
              {savingCreds && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save &amp; Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Automation Result Dialog */}
      <Dialog open={showPortalResult} onOpenChange={setShowPortalResult}>
        <DialogContent className="max-w-xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {portalAutoResult?.error
                ? <AlertCircle className="w-5 h-5 text-destructive" />
                : <CheckCircle className="w-5 h-5 text-green-500" />}
              {portalAutoResult?.error ? "Automation Failed" : "Form Pre-filled"}
            </DialogTitle>
            <DialogDescription>
              {portalAutoResult?.error
                ? portalAutoResult.error
                : `Review the pre-filled form — we filled ${portalAutoResult?.filledCount ?? 0} fields`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            {portalAutoResult?.screenshotBase64 && (
              <img
                src={`data:image/png;base64,${portalAutoResult.screenshotBase64}`}
                alt="Pre-filled portal form screenshot"
                className="w-full rounded-lg border mb-4"
              />
            )}
            {portalAutoResult?.error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{portalAutoResult.error}</p>
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowPortalResult(false)}>Close</Button>
            {portalAutoResult?.error ? (
              <Button
                onClick={() => {
                  setShowPortalResult(false);
                  if (viewPointFormId) handlePortalAssist(viewPointFormId);
                }}
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Use Copy-Paste Instead
              </Button>
            ) : (
              portalAutoResult?.portalUrl && (
                <Button onClick={() => window.open(portalAutoResult.portalUrl, "_blank")}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Portal to Submit
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Assist Copy-Paste Modal */}
      <Dialog open={showPortalAssist} onOpenChange={setShowPortalAssist}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              Portal Assist
            </DialogTitle>
            <DialogDescription>
              Paste the questions from the current portal page and we’ll return answers in the same order. This keeps portal permits fast without pretending to automate the whole site.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-4 pr-4">
              <div className="space-y-2">
                <Label htmlFor="portal-prompts">Paste portal questions or labels</Label>
                <Textarea
                  id="portal-prompts"
                  value={portalPromptText}
                  onChange={(e) => setPortalPromptText(e.target.value)}
                  placeholder={"Example:\nBusiness name\nOwner name\nMailing address\nPhone number\nEvent location"}
                  className="min-h-[140px]"
                />
                <div className="flex gap-2">
                  <Button onClick={analyzePortalPrompts} disabled={portalPromptLoading}>
                    {portalPromptLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
                    Prepare ordered answers
                  </Button>
                  <Button variant="outline" onClick={() => { setPortalPromptText(""); setPortalPromptAnswers([]); }}>
                    Clear
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Best practice: paste one page at a time before hitting “Next” in the town portal.
                </p>
              </div>

              {(portalPromptAnswers.length > 0 ? portalPromptAnswers : getPortalAssistData().map((field) => ({ id: field.key, prompt: field.label, answer: field.value, readyToCopy: true }))).map((field) => (
                <button
                  key={field.id}
                  onClick={() => field.answer && copyToClipboard(field.answer, field.id)}
                  className="w-full text-left p-3 rounded-md border hover-elevate active-elevate-2 transition-colors"
                  data-testid={`portal-assist-field-${field.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">{field.prompt}</p>
                        {"source" in field && field.source === "learned" && (
                          <Badge variant="outline" className="text-[10px]">Learned for this town</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium break-words">{field.answer || "No saved answer yet — update your profile or answer this manually."}</p>
                    </div>
                    <div className="flex-shrink-0 mt-1">
                      {copiedField === field.id ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : !field.answer ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {portalPromptAnswers.length === 0 && getPortalAssistData().length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No profile data available. Please upload and analyze documents first.
                </p>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => setShowPortalAssist(false)}
            >
              Close
            </Button>
            <Button 
              onClick={() => {
                const portalForm = portalAssistFormId ? townForms.find(f => f.id === portalAssistFormId) : null;
                const url = portalForm?.externalUrl || portalForm?.sourceUrl || town?.portalUrl;
                if (url) {
                  window.open(url, "_blank");
                } else {
                  toast({ title: "No portal URL", description: "No portal URL available for this town.", variant: "destructive" });
                }
              }}
              data-testid="button-open-portal"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Portal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
