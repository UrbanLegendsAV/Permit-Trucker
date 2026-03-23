import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Truck, Caravan, ArrowLeft, ArrowRight, Check, Globe, Eye, EyeOff,
  MapPin, Plus, Trash2, Upload, Loader2, CheckCircle2, Circle, Sparkles, X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const steps = ["Vehicle Type", "Business Info", "Your Documents", "Fill Gaps", "Visibility"];

const SUPPLIER_SUGGESTIONS = ["Ki Brasil market", "Restaurant Depot", "Costco", "Price Rite", "CTOWN"];

const DOC_ZONES = [
  { id: "health-permit", label: "Health Permit / Vendor License", badge: "Required for permits", required: true },
  { id: "commissary-letter", label: "Commissary Agreement", badge: "Required for permits", required: true },
  { id: "trailer-diagram", label: "Truck / Trailer Diagram", badge: "Required for permits", required: true },
  { id: "menu", label: "Menu", badge: "Helps fill applications", required: false },
  { id: "supplier-list", label: "Food Suppliers List", badge: "Helps fill applications", required: false },
  { id: "food-manager-cert", label: "Food Manager Certificate", badge: "Recommended", required: false },
  { id: "permit-application", label: "Past Permit Application", badge: "Fastest setup", required: false },
];

// Maps vault missing field labels → input metadata
const VAULT_FIELD_INPUTS: Record<string, { key: string; label: string; placeholder: string; inputType?: string }> = {
  "Business Name": { key: "businessName", label: "Business Name", placeholder: "e.g. Brazilian BBQ Boys" },
  "Owner Name": { key: "ownerName", label: "Owner / Applicant Name", placeholder: "Full legal name" },
  "Phone Number": { key: "phone", label: "Phone Number", placeholder: "(203) 555-0100" },
  "Email Address": { key: "email", label: "Email Address", placeholder: "you@example.com", inputType: "email" },
  "Mailing Address": { key: "mailingStreet", label: "Mailing Address", placeholder: "123 Main St, Bridgeport, CT 06601" },
  "Commissary Name": { key: "commissaryName", label: "Commissary Name", placeholder: "Name of your commissary kitchen" },
  "Commissary Address": { key: "commissaryAddress", label: "Commissary Address", placeholder: "Full commissary address" },
};

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    onboarding,
    currentStep,
    setOnboardingField,
    setCurrentStep,
    resetOnboarding,
  } = useAppStore();

  // Local state for the new doc-first flow
  const [draftProfileId, setDraftProfileId] = useState<string | null>(null);
  const [docParsing, setDocParsing] = useState<Record<string, boolean>>({});
  const [vaultScore, setVaultScore] = useState<number | null>(null);
  const [vaultMissing, setVaultMissing] = useState<string[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [skipDocs, setSkipDocs] = useState(false);
  const [gapFillValues, setGapFillValues] = useState<Record<string, string>>({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Create draft profile after step 1 ─────────────────────────────────────
  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/profiles", {
        userId: user?.id,
        vehicleType: onboarding.vehicleType,
        vehicleName: onboarding.vehicleName ||
          (onboarding.vehicleType === "trailer" ? "My Food Trailer" : "My Food Truck"),
        menuType: onboarding.menuType || undefined,
      });
      return res.json();
    },
    onSuccess: (profile) => {
      setDraftProfileId(profile.id);
      setCurrentStep(2);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not start setup. Please try again.", variant: "destructive" });
    },
  });

  // ── Finish — save gap data, suppliers, public profile ─────────────────────
  const finishMutation = useMutation({
    mutationFn: async () => {
      const profileId = draftProfileId;
      if (!profileId) throw new Error("No draft profile");

      const operationsData: Record<string, unknown> = {
        ...(onboarding.commissaryPhone && { commissaryPhone: onboarding.commissaryPhone }),
        ...(onboarding.hasCommissaryContract && { hasCommissaryContract: onboarding.hasCommissaryContract }),
        ...(onboarding.overnightParkingAddress && { overnightParkingAddress: onboarding.overnightParkingAddress }),
        ...(onboarding.overnightParkingAuthorized && { overnightParkingAuthorized: onboarding.overnightParkingAuthorized }),
        ...(onboarding.electricitySource && { electricitySource: onboarding.electricitySource }),
        ...(onboarding.generatorInfo && { generatorInfo: onboarding.generatorInfo }),
        ...(onboarding.wasteWaterDisposal && { wasteWaterDisposal: onboarding.wasteWaterDisposal }),
        ...(onboarding.handWashingSetup && { handWashingSetup: onboarding.handWashingSetup }),
        ...(onboarding.truckInteriorDescription && { truckInteriorDescription: onboarding.truckInteriorDescription }),
        ...(onboarding.garbageSetup && { garbageSetup: onboarding.garbageSetup }),
      };

      await apiRequest("PATCH", `/api/profiles/${profileId}`, {
        ...(onboarding.commissaryName && { commissaryName: onboarding.commissaryName }),
        ...(onboarding.commissaryAddress && { commissaryAddress: onboarding.commissaryAddress }),
        uploadsJson: { documents: onboarding.documents },
        operationsData,
      });

      // Save gap fill fields to vault
      for (const [fieldLabel, value] of Object.entries(gapFillValues)) {
        const fieldInfo = VAULT_FIELD_INPUTS[fieldLabel];
        if (fieldInfo && value.trim()) {
          try {
            await apiRequest("PATCH", "/api/vault/field", { field: fieldInfo.key, value: value.trim() });
          } catch { /* non-fatal */ }
        }
      }

      // Save suppliers
      for (const s of onboarding.suppliers) {
        if (s.name.trim()) {
          await apiRequest("POST", "/api/suppliers", {
            supplierName: s.name.trim(),
            suppliesWhat: s.suppliesWhat.trim() || undefined,
            profileId,
          });
        }
      }

      // Sync vault
      await apiRequest("POST", `/api/profiles/${profileId}/sync-vault`, {});

      // Create public profile if opted in
      if (onboarding.wantsPublicProfile) {
        await apiRequest("POST", "/api/public-profiles", {
          profileId,
          isPublic: true,
          businessName: onboarding.publicBusinessName || onboarding.vehicleName,
          description: onboarding.publicDescription,
        });
      }

      return { id: profileId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-public-profile"] });
      resetOnboarding();
      toast({
        title: "You're all set!",
        description: `Your permit data vault is ${vaultScore ?? 0}% complete. Time to file your first permit!`,
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    },
  });

  // ── Doc upload helpers ─────────────────────────────────────────────────────
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleDocUpload = async (zoneId: string, file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const newDoc = { name: file.name, type: file.type, url: dataUrl, folder: zoneId };
    // Replace existing doc in same zone (one per zone)
    const updatedDocs = [...onboarding.documents.filter((d) => d.folder !== zoneId), newDoc];
    setOnboardingField("documents", updatedDocs);

    if (!draftProfileId) return;

    setDocParsing((prev) => ({ ...prev, [zoneId]: true }));
    try {
      await apiRequest("PATCH", `/api/profiles/${draftProfileId}`, {
        uploadsJson: { documents: updatedDocs },
      });
      const docIndex = updatedDocs.length - 1;
      const parseRes = await apiRequest(
        "POST",
        `/api/profiles/${draftProfileId}/parse-document/${docIndex}`,
        {}
      );
      const parseData = await parseRes.json();
      if (parseData.vaultCompleteness) {
        setVaultScore(parseData.vaultCompleteness.score ?? null);
        setVaultMissing(parseData.vaultCompleteness.missingFields ?? []);
      }
    } catch { /* non-fatal */ } finally {
      setDocParsing((prev) => ({ ...prev, [zoneId]: false }));
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const canProceed = () => {
    switch (currentStep) {
      case 0: return onboarding.vehicleType !== null;
      case 1: return onboarding.vehicleName.trim().length > 0;
      default: return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      createDraftMutation.mutate();
    } else if (currentStep === 2) {
      setCurrentStep(3);
      if (draftProfileId && !skipDocs) {
        setVaultLoading(true);
        try {
          const res = await apiRequest("GET", `/api/vault?profileId=${draftProfileId}`);
          if (res.ok) {
            const data = await res.json();
            setVaultScore(data.completeness?.score ?? 0);
            setVaultMissing(data.completeness?.missingFields ?? []);
          }
        } catch { /* non-fatal */ } finally {
          setVaultLoading(false);
        }
      }
    } else if (currentStep === steps.length - 1) {
      finishMutation.mutate();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      setLocation("/dashboard");
    }
  };

  const handleSkipDocs = () => {
    setSkipDocs(true);
    setVaultScore(0);
    setVaultMissing(Object.keys(VAULT_FIELD_INPUTS));
    setCurrentStep(3);
  };

  const isPending = createDraftMutation.isPending || finishMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="workflow-shell flex flex-col">
      <header className="workflow-header h-14">
        <div className="flex items-center h-full px-4 max-w-5xl mx-auto">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back" className="text-white hover:bg-white/5 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="flex-1 text-center font-display font-semibold text-white">Add Your Vehicle</h1>
          <div className="w-9" />
        </div>
      </header>

      {/* Thin progress bar */}
      <div className="w-full h-0.5 bg-white/10">
        <div
          className="h-0.5 bg-[#1B4FD8] transition-all duration-500 ease-out"
          style={{ width: `${Math.round((currentStep / (steps.length - 1)) * 100)}%` }}
        />
      </div>
      <div className="max-w-5xl mx-auto w-full px-4 pt-6">
        <div className="workflow-hero px-6 py-7 md:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="section-kicker text-white/60">Owner setup</p>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Build the permit-ready profile once, then reuse it town after town.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#B6C3DA] md:text-base">
                This setup turns your business into a reusable permit machine. We’ll pull what we can from your documents, flag the gaps, and get you ready for autofill.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="ops-kpi">
                <p className="section-kicker">Current step</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white">{steps[currentStep]}</p>
                <p className="text-sm text-[#8897B2]">guided workflow</p>
              </div>
              <div className="ops-kpi">
                <p className="section-kicker">Progress</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white">{currentStep + 1}/{steps.length}</p>
                <p className="text-sm text-[#8897B2]">stages completed</p>
              </div>
              <div className="ops-kpi">
                <p className="section-kicker">Vault score</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white">{vaultScore ?? 0}%</p>
                <p className="text-sm text-[#8897B2]">permit data readiness</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 pt-3 pb-1 max-w-5xl mx-auto w-full flex items-center justify-between">
        <p className="text-xs font-medium text-[#8897B2]">{steps[currentStep]}</p>
        <p className="text-xs text-[#8897B2]">{currentStep + 1} / {steps.length}</p>
      </div>

      <main className="flex-1 px-4 pb-32 max-w-5xl mx-auto w-full">
        <div className="workflow-step-frame">

        {/* ── Step 0: Vehicle Type ─────────────────────────────────────────── */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">What type of vehicle?</h2>
              <p className="text-muted-foreground">Select your food service vehicle type</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card
                className={`p-6 cursor-pointer transition-all ${
                  onboarding.vehicleType === "truck" ? "ring-2 ring-primary bg-primary/5" : "hover-elevate"
                }`}
                onClick={() => setOnboardingField("vehicleType", "truck")}
                data-testid="card-truck"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                    onboarding.vehicleType === "truck" ? "bg-primary/20" : "bg-muted"
                  }`}>
                    <Truck className={`w-8 h-8 ${onboarding.vehicleType === "truck" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className="font-semibold">Food Truck</span>
                </div>
              </Card>

              <Card
                className={`p-6 cursor-pointer transition-all ${
                  onboarding.vehicleType === "trailer" ? "ring-2 ring-primary bg-primary/5" : "hover-elevate"
                }`}
                onClick={() => setOnboardingField("vehicleType", "trailer")}
                data-testid="card-trailer"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                    onboarding.vehicleType === "trailer" ? "bg-primary/20" : "bg-muted"
                  }`}>
                    <Caravan className={`w-8 h-8 ${onboarding.vehicleType === "trailer" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <span className="font-semibold">Food Trailer</span>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ── Step 1: Business Info ────────────────────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">Tell us about your business</h2>
              <p className="text-muted-foreground">Just the basics — we'll learn the rest from your documents.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vehicleName">Business / Truck Name *</Label>
                <Input
                  id="vehicleName"
                  placeholder="e.g. Brazilian BBQ Boys"
                  value={onboarding.vehicleName}
                  onChange={(e) => setOnboardingField("vehicleName", e.target.value)}
                  className="h-12"
                  data-testid="input-vehicle-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menuType">Cuisine Type</Label>
                <Input
                  id="menuType"
                  placeholder="e.g. Mexican, BBQ, Ice Cream"
                  value={onboarding.menuType}
                  onChange={(e) => setOnboardingField("menuType", e.target.value)}
                  className="h-12"
                  data-testid="input-menu-type"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Upload Documents ─────────────────────────────────────── */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div className="text-center mb-2">
              <h2 className="font-display text-2xl font-bold mb-2">Let's learn about your business</h2>
              <p className="text-muted-foreground text-sm">
                Upload your documents and we'll fill out your permit applications automatically.
              </p>
            </div>

            {DOC_ZONES.map((zone) => {
              const diagramLabel = onboarding.vehicleType === "trailer" ? "Trailer Diagram" : "Truck Diagram";
              const label = zone.id === "trailer-diagram" ? diagramLabel : zone.label;
              const uploaded = onboarding.documents.find((d) => d.folder === zone.id);
              const parsing = docParsing[zone.id];

              return (
                <Card key={zone.id} className={`p-4 ${uploaded ? "border-green-500/50 bg-green-500/5" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-medium">{label}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            zone.badge === "Required for permits"
                              ? "border-primary/50 text-primary"
                              : "border-muted-foreground/30 text-muted-foreground"
                          }`}
                        >
                          {zone.badge}
                        </Badge>
                      </div>
                      {uploaded ? (
                        <p className="text-xs text-muted-foreground truncate">{uploaded.name}</p>
                      ) : !zone.required ? (
                        <span className="text-xs text-muted-foreground/60">Optional</span>
                      ) : null}
                    </div>

                    <div className="shrink-0">
                      {parsing ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Reading...</span>
                        </div>
                      ) : uploaded ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[zone.id]?.click()}
                          className="h-8 text-xs"
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Upload
                        </Button>
                      )}
                    </div>

                    {uploaded && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 shrink-0"
                        onClick={() =>
                          setOnboardingField("documents", onboarding.documents.filter((d) => d.folder !== zone.id))
                        }
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>

                  <input
                    ref={(el) => { fileInputRefs.current[zone.id] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocUpload(zone.id, file);
                      e.target.value = "";
                    }}
                  />
                </Card>
              );
            })}

            <button
              type="button"
              onClick={handleSkipDocs}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline py-2"
            >
              Skip all and enter manually →
            </button>
          </div>
        )}

        {/* ── Step 3: Smart Gap Fill ───────────────────────────────────────── */}
        {currentStep === 3 && (
          vaultLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">Analyzing your documents...</p>
            </div>
          ) : vaultScore !== null && vaultScore >= 85 ? (
            /* ── 85%+ — Success screen ────────────────────────────────── */
            <div className="space-y-6 text-center">
              <div className="py-8">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="font-display text-2xl font-bold mb-2">We found everything we need!</h2>
                <p className="text-muted-foreground text-sm">
                  Your documents contained everything needed for permit applications.
                </p>
              </div>
              <Card className="p-4 text-left space-y-2">
                {["Business Name", "Commissary", "Menu", "Owner Info", "Address"].map((field) => (
                  <div key={field} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{field} — <span className="text-green-500">found ✓</span></span>
                  </div>
                ))}
              </Card>
            </div>
          ) : vaultScore !== null && vaultScore >= 60 ? (
            /* ── 60–84% — Show only missing fields ───────────────────── */
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="font-display text-2xl font-bold mb-2">Just a few more details</h2>
                <p className="text-muted-foreground text-sm">
                  We couldn't find these from your documents — fill them in below.
                </p>
              </div>
              <div className="space-y-4">
                {vaultMissing.filter((f) => VAULT_FIELD_INPUTS[f]).map((fieldLabel) => {
                  const field = VAULT_FIELD_INPUTS[fieldLabel];
                  return (
                    <div key={fieldLabel} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Circle className="w-3 h-3 text-amber-500 shrink-0" />
                        <Label>{field.label}</Label>
                      </div>
                      <Input
                        type={field.inputType || "text"}
                        placeholder={field.placeholder}
                        value={gapFillValues[fieldLabel] ?? ""}
                        onChange={(e) =>
                          setGapFillValues((prev) => ({ ...prev, [fieldLabel]: e.target.value }))
                        }
                        className="h-12"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── < 60% or skip docs — Full form ──────────────────────── */
            <div className="space-y-8">
              <div className="text-center mb-6">
                <h2 className="font-display text-2xl font-bold mb-2">Suppliers & Operations</h2>
                <p className="text-muted-foreground text-sm">Used to auto-fill health permit applications</p>
              </div>

              {/* Contact fields that are missing */}
              {vaultMissing.filter((f) => VAULT_FIELD_INPUTS[f]).length > 0 && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Contact Information</Label>
                  {vaultMissing.filter((f) => VAULT_FIELD_INPUTS[f]).map((fieldLabel) => {
                    const field = VAULT_FIELD_INPUTS[fieldLabel];
                    return (
                      <div key={fieldLabel} className="space-y-2">
                        <Label className="text-sm">{field.label}</Label>
                        <Input
                          type={field.inputType || "text"}
                          placeholder={field.placeholder}
                          value={gapFillValues[fieldLabel] ?? ""}
                          onChange={(e) =>
                            setGapFillValues((prev) => ({ ...prev, [fieldLabel]: e.target.value }))
                          }
                          className="h-10"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* FOOD SUPPLIERS */}
              <div className="space-y-3">
                <div>
                  <Label className="text-base font-semibold">Food Suppliers</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Appears on health permit applications (Question 4)</p>
                </div>
                {onboarding.suppliers.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <Input
                        placeholder="Supplier name (e.g. Restaurant Depot)"
                        value={s.name}
                        onChange={(e) => {
                          const updated = [...onboarding.suppliers];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setOnboardingField("suppliers", updated);
                        }}
                        className="h-10"
                      />
                      <Input
                        placeholder="What they supply (e.g. meats, produce)"
                        value={s.suppliesWhat}
                        onChange={(e) => {
                          const updated = [...onboarding.suppliers];
                          updated[i] = { ...updated[i], suppliesWhat: e.target.value };
                          setOnboardingField("suppliers", updated);
                        }}
                        className="h-10"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setOnboardingField("suppliers", onboarding.suppliers.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOnboardingField("suppliers", [...onboarding.suppliers, { name: "", suppliesWhat: "" }])
                  }
                >
                  <Plus className="w-4 h-4 mr-2" /> Add supplier
                </Button>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUPPLIER_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted"
                      onClick={() =>
                        setOnboardingField("suppliers", [...onboarding.suppliers, { name: s, suppliesWhat: "" }])
                      }
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* COMMISSARY */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Commissary</Label>
                {!onboarding.commissaryName && (
                  <Input
                    placeholder="Commissary name"
                    value={onboarding.commissaryName}
                    onChange={(e) => setOnboardingField("commissaryName", e.target.value)}
                    className="h-10"
                  />
                )}
                {onboarding.commissaryName && (
                  <p className="text-sm text-muted-foreground">
                    Commissary: <strong>{onboarding.commissaryName}</strong>
                  </p>
                )}
                <Input
                  placeholder="Commissary address"
                  value={onboarding.commissaryAddress}
                  onChange={(e) => setOnboardingField("commissaryAddress", e.target.value)}
                  className="h-10"
                />
                <Input
                  placeholder="Commissary phone"
                  value={onboarding.commissaryPhone}
                  onChange={(e) => setOnboardingField("commissaryPhone", e.target.value)}
                  className="h-10"
                />
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Commissary contract on file?</Label>
                      <p className="text-xs text-muted-foreground">Do you have a written commissary agreement?</p>
                    </div>
                    <Switch
                      checked={onboarding.hasCommissaryContract}
                      onCheckedChange={(v) => setOnboardingField("hasCommissaryContract", v)}
                    />
                  </div>
                </Card>
              </div>

              {/* ELECTRICITY */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Electricity Source</Label>
                <Select
                  value={onboarding.electricitySource}
                  onValueChange={(v) => setOnboardingField("electricitySource", v)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="How is electricity provided?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Generator (gas)">Generator (gas)</SelectItem>
                    <SelectItem value="Generator (propane)">Generator (propane)</SelectItem>
                    <SelectItem value="Shore power (venue provided)">Shore power (venue provided)</SelectItem>
                    <SelectItem value="Solar">Solar</SelectItem>
                    <SelectItem value="None needed">None needed</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {onboarding.electricitySource?.startsWith("Generator") && (
                  <Input
                    placeholder="Generator make/model (e.g. Honda EU2200i)"
                    value={onboarding.generatorInfo}
                    onChange={(e) => setOnboardingField("generatorInfo", e.target.value)}
                    className="h-10"
                  />
                )}
              </div>

              {/* WASTEWATER */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Wastewater Disposal</Label>
                <Textarea
                  placeholder="Where is wastewater disposed?"
                  value={onboarding.wasteWaterDisposal}
                  onChange={(e) => setOnboardingField("wasteWaterDisposal", e.target.value)}
                  onFocus={(e) => {
                    if (!e.target.value)
                      setOnboardingField("wasteWaterDisposal", "Disposed of at commissary via their wastewater disposal systems");
                  }}
                  rows={2}
                />
              </div>

              {/* HAND WASHING */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Hand Washing Setup</Label>
                <Textarea
                  placeholder="Describe your hand washing setup"
                  value={onboarding.handWashingSetup}
                  onChange={(e) => setOnboardingField("handWashingSetup", e.target.value)}
                  onFocus={(e) => {
                    if (!e.target.value)
                      setOnboardingField("handWashingSetup", "Portable hand washing station with soap, paper towels, and a gravity-fed water container with a catch bucket");
                  }}
                  rows={2}
                />
              </div>

              {/* INTERIOR */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Interior Surfaces</Label>
                <Textarea
                  placeholder="Describe floors, walls, and ceiling"
                  value={onboarding.truckInteriorDescription}
                  onChange={(e) => setOnboardingField("truckInteriorDescription", e.target.value)}
                  onFocus={(e) => {
                    if (!e.target.value)
                      setOnboardingField("truckInteriorDescription", "Stainless steel walls and ceiling, rubber non-slip flooring, LED lighting throughout");
                  }}
                  rows={2}
                />
              </div>

              {/* GARBAGE */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Garbage Disposal</Label>
                <Textarea
                  placeholder="Describe garbage disposal setup"
                  value={onboarding.garbageSetup}
                  onChange={(e) => setOnboardingField("garbageSetup", e.target.value)}
                  onFocus={(e) => {
                    if (!e.target.value)
                      setOnboardingField("garbageSetup", "Two 32-gallon covered garbage containers inside the truck, additional containers provided by event organizer at the event site");
                  }}
                  rows={2}
                />
              </div>
            </div>
          )
        )}

        {/* ── Step 4: Public Visibility ────────────────────────────────────── */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">Public Visibility</h2>
              <p className="text-muted-foreground">Let customers find your food truck on our Discover map</p>
            </div>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    onboarding.wantsPublicProfile ? "bg-primary/20" : "bg-muted"
                  }`}>
                    {onboarding.wantsPublicProfile ? (
                      <Eye className="w-6 h-6 text-primary" />
                    ) : (
                      <EyeOff className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <Label className="font-medium">Show on Discover Map</Label>
                    <p className="text-sm text-muted-foreground">Let customers find you</p>
                  </div>
                </div>
                <Switch
                  checked={onboarding.wantsPublicProfile}
                  onCheckedChange={(checked) => setOnboardingField("wantsPublicProfile", checked)}
                  data-testid="switch-public-profile"
                />
              </div>

              {onboarding.wantsPublicProfile && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div className="space-y-2">
                    <Label htmlFor="publicBusinessName">Business Name</Label>
                    <Input
                      id="publicBusinessName"
                      placeholder="Your food truck name"
                      value={onboarding.publicBusinessName || onboarding.vehicleName}
                      onChange={(e) => setOnboardingField("publicBusinessName", e.target.value)}
                      className="h-12"
                      data-testid="input-public-business-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="publicDescription">Brief Description</Label>
                    <Textarea
                      id="publicDescription"
                      placeholder="Tell customers about your food..."
                      value={onboarding.publicDescription}
                      onChange={(e) => setOnboardingField("publicDescription", e.target.value)}
                      rows={3}
                      data-testid="input-public-description"
                    />
                  </div>
                  <Card className="p-3 bg-muted/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      You can set your location and hours in your profile after registration.
                    </p>
                  </Card>
                </div>
              )}
            </Card>

            <Card className="p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                <Globe className="w-4 h-4 inline mr-2" />
                {onboarding.wantsPublicProfile
                  ? "Your truck will appear on our Discover map for customers to find."
                  : "You can enable visibility later from your profile settings."}
              </p>
            </Card>
          </div>
        )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#0A0F1E]/88 p-4 backdrop-blur-xl safe-area-inset-bottom">
        <div className="flex gap-4 max-w-5xl mx-auto">
          <Button variant="outline" onClick={handleBack} className="h-12 flex-1 border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white" data-testid="button-step-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed() || isPending}
            className="h-12 flex-1 bg-[#1B4FD8] text-white hover:bg-[#1B4FD8]/90"
            data-testid="button-step-next"
          >
            {isPending ? (
              "Saving..."
            ) : currentStep === steps.length - 1 ? (
              <><Check className="w-4 h-4 mr-2" />Finish</>
            ) : currentStep === 2 ? (
              <>Analyze & Continue<ArrowRight className="w-4 h-4 ml-2" /></>
            ) : (
              <>Next<ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
