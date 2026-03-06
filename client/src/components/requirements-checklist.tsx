import { useState } from "react";
import { Check, Info, ExternalLink, AlertTriangle, FileText, Download, Loader2, Wand2, Bot, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Town, TownForm, Profile, DataVault } from "@shared/schema";

interface RequirementsChecklistProps {
  town: Town;
  progress: Record<string, boolean>;
  onToggle: (key: string) => void;
  profile?: Profile;
}

interface RequirementItem {
  key: string;
  label: string;
  description: string;
  required: boolean;
  agency?: string;
}

const requirementDetails: Record<string, { label: string; description: string; agency?: string }> = {
  coi: {
    label: "Certificate of Insurance (COI)",
    description: "General liability insurance certificate naming the town as additional insured. Typically $1M per occurrence.",
    agency: "Insurance Provider",
  },
  background: {
    label: "Background Check",
    description: "Criminal background check for the applicant. Processing time varies by jurisdiction.",
    agency: "Police Department",
  },
  healthInspection: {
    label: "Health Department Inspection",
    description: "Food safety inspection of your mobile unit. Schedule in advance.",
    agency: "Health Department",
  },
  fireInspection: {
    label: "Fire Safety Inspection",
    description: "Fire extinguisher, suppression system, and propane inspection.",
    agency: "Fire Department",
  },
  vehicleInspection: {
    label: "Vehicle Inspection",
    description: "DOT compliance and vehicle safety inspection.",
    agency: "DMV/Police",
  },
  commissaryLetter: {
    label: "Commissary Agreement",
    description: "Letter from licensed commissary kitchen confirming food storage and prep agreement.",
    agency: "Commissary",
  },
  menuRequired: {
    label: "Menu Submission",
    description: "Complete menu with all items, ingredients, and pricing.",
  },
};

const categoryLabels: Record<string, string> = {
  temporary_permit: "Temporary Permit",
  seasonal_permit: "Seasonal Permit",
  yearly_permit: "Yearly/Annual Permit",
  plan_review: "Plan Review",
  license_renewal: "License Renewal",
  checklist: "Checklist",
  health_inspection: "Health Inspection",
  fire_safety: "Fire Safety",
  other: "Other",
};

export function RequirementsChecklist({ town, progress, onToggle, profile }: RequirementsChecklistProps) {
  const requirements = (town.requirementsJson || {}) as Record<string, unknown>;
  const { toast } = useToast();
  const [generatingFormId, setGeneratingFormId] = useState<string | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [portalUsername, setPortalUsername] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [automationStatus, setAutomationStatus] = useState<string | null>(null);
  
  const { data: formsResponse, isLoading: formsLoading } = useQuery<{ fillableForms: TownForm[], forms: TownForm[] }>({
    queryKey: [`/api/towns/${town.id}/forms`],
  });
  const forms = formsResponse?.forms || [];

  const { data: vault } = useQuery<DataVault>({
    queryKey: ["/api/vault"],
    enabled: !!profile,
  });

  // Forms with fileData can be auto-filled (Datalab can fill even flat PDFs)
  const canAutoFill = (form: TownForm): boolean => {
    return !!form.fileData;
  };

  const handleGeneratePreFill = async (form: TownForm) => {
    if (!profile) {
      toast({
        title: "No Profile Selected",
        description: "Please select a vehicle profile to pre-fill the form.",
        variant: "destructive",
      });
      return;
    }

    if (!canAutoFill(form)) {
      toast({
        title: "Form Not Available",
        description: `Auto-fill is not configured for "${form.name}". Use "View PDF" to download the blank form.`,
        variant: "destructive",
      });
      return;
    }

    setGeneratingFormId(form.id);
    
    try {
      // Use new database-backed endpoint with form ID directly
      // apiRequest throws on non-2xx responses, so no need to check response.ok
      const response = await apiRequest("POST", `/api/towns/${town.id}/forms/${form.id}/generate`, {
        profileId: profile.id,
        includeDocuments: false,
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.name?.replace(/[^a-zA-Z0-9]/g, "_") || "filled_form"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Form Generated",
        description: `"${form.name}" has been filled with your profile data and downloaded.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate the filled form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingFormId(null);
    }
  };

  const handleStartAIAssist = async () => {
    if (!town.portalUrl) {
      toast({
        title: "No Portal Available",
        description: "This town doesn't have an online portal configured.",
        variant: "destructive",
      });
      return;
    }

    if (!profile) {
      toast({
        title: "Profile Required",
        description: "Please select a vehicle profile first to use AI Portal Assistant.",
        variant: "destructive",
      });
      return;
    }

    if (!vault) {
      try {
        await apiRequest("POST", `/api/vault/sync/${profile.id}`);
        toast({
          title: "Data Synced",
          description: "Your profile data has been synced. Please try again.",
        });
        return;
      } catch (e) {
        console.warn("Vault sync failed, proceeding with profile data");
      }
    }

    setShowCredentialsModal(true);
  };

  const handleRunAutomation = async () => {
    if (!portalUsername || !portalPassword) {
      toast({
        title: "Credentials Required",
        description: "Please enter your portal login credentials.",
        variant: "destructive",
      });
      return;
    }

    if (!vault?.id) {
      toast({
        title: "Data Vault Required",
        description: "Please upload at least one document so your profile data is available for form filling.",
        variant: "destructive",
      });
      return;
    }

    setIsRunningAutomation(true);
    setAutomationStatus("Storing credentials securely...");

    try {
      const credResponse = await apiRequest("POST", "/api/portal-credentials", {
        townId: town.id,
        username: portalUsername,
        password: portalPassword,
      });

      if (!credResponse.ok) {
        const errData = await credResponse.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to store credentials");
      }

      const credential = await credResponse.json();

      if (!credential.id) {
        throw new Error("Credential was saved but no ID was returned");
      }

      setAutomationStatus("Creating automation job...");

      const jobResponse = await apiRequest("POST", "/api/submissions/portal-automation", {
        townId: town.id,
        vaultId: vault.id,
        credentialId: credential.id,
      });

      if (!jobResponse.ok) {
        const errData = await jobResponse.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to create automation job");
      }

      const job = await jobResponse.json();
      setAutomationStatus("Running portal automation...");

      const executeResponse = await apiRequest("POST", `/api/submissions/${job.id}/execute`);

      if (!executeResponse.ok) {
        const error = await executeResponse.json();
        throw new Error(error.message || "Automation failed");
      }

      setAutomationStatus("Automation complete!");
      toast({
        title: "Portal Automation Complete",
        description: `Successfully filled ${town.townName}'s permit portal with your data.`,
      });

      setShowCredentialsModal(false);
      setPortalUsername("");
      setPortalPassword("");
    } catch (error: any) {
      setAutomationStatus(null);
      toast({
        title: "Automation Failed",
        description: error.message || "Could not complete portal automation.",
        variant: "destructive",
      });
    } finally {
      setIsRunningAutomation(false);
    }
  };
  
  const items: RequirementItem[] = Object.entries(requirements)
    .filter(([key, value]) => typeof value === "boolean" && value && requirementDetails[key])
    .map(([key]) => ({
      key,
      required: true,
      ...requirementDetails[key],
    }));

  const completedCount = items.filter(item => progress[item.key]).length;
  const progressPercent = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  const fees = requirements.fees as { yearly?: number; temporary?: number; seasonal?: number } | undefined;

  return (
    <div className="space-y-4" data-testid="requirements-checklist">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Requirements Checklist</h3>
        <Badge variant="outline" data-testid="badge-progress-count">
          {completedCount} / {items.length}
        </Badge>
      </div>

      <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid="progress-bar">
        <div 
          className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          data-testid="progress-bar-fill"
        />
      </div>

      {items.length === 0 ? (
        <Card className="p-6 text-center" data-testid="requirements-unknown">
          <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
          <p className="font-medium">Requirements Unknown</p>
          <p className="text-sm text-muted-foreground mt-1">
            Be a pioneer! Help us gather requirements for {town.townName}.
          </p>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {items.map((item) => (
            <AccordionItem 
              key={item.key} 
              value={item.key}
              className="border rounded-lg overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  id={item.key}
                  checked={progress[item.key] || false}
                  onCheckedChange={() => onToggle(item.key)}
                  data-testid={`checkbox-${item.key}`}
                />
                <label
                  htmlFor={item.key}
                  className={`flex-1 font-medium cursor-pointer ${
                    progress[item.key] ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {item.label}
                </label>
                <AccordionTrigger className="p-0 hover:no-underline">
                  <Info className="w-4 h-4 text-muted-foreground" />
                </AccordionTrigger>
              </div>
              <AccordionContent className="px-4 pb-3 pt-0">
                <div className="pl-7 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                  {item.agency && (
                    <Badge variant="secondary" className="text-xs">
                      Contact: {item.agency}
                    </Badge>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {fees && Object.keys(fees).length > 0 && (
        <Card className="p-4" data-testid="fees-card">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Estimated Fees
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            {fees.yearly && (
              <div className="p-2 bg-muted rounded-lg" data-testid="fee-yearly">
                <p className="text-lg font-bold">${fees.yearly}</p>
                <p className="text-xs text-muted-foreground">Yearly</p>
              </div>
            )}
            {fees.temporary && (
              <div className="p-2 bg-muted rounded-lg" data-testid="fee-temporary">
                <p className="text-lg font-bold">${fees.temporary}</p>
                <p className="text-xs text-muted-foreground">Temporary</p>
              </div>
            )}
            {fees.seasonal && (
              <div className="p-2 bg-muted rounded-lg" data-testid="fee-seasonal">
                <p className="text-lg font-bold">${fees.seasonal}</p>
                <p className="text-xs text-muted-foreground">Seasonal</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {town.portalUrl && (
        <Card className="p-4 border-primary/20 bg-primary/5" data-testid="ai-assist-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">AI Portal Assistant</p>
                <p className="text-xs text-muted-foreground">Auto-fill online portal forms</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleStartAIAssist}
              data-testid="button-ai-assist"
            >
              <Bot className="w-4 h-4 mr-1" />
              Start AI Assist
            </Button>
          </div>
        </Card>
      )}

      {formsLoading ? (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading official forms...</span>
          </div>
        </Card>
      ) : forms.length > 0 && (
        <Card className="p-4" data-testid="forms-card">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Official Forms for {town.townName}
          </h4>
          <div className="space-y-3">
            {forms.map((form) => (
              <div 
                key={form.id} 
                className="p-3 bg-muted/50 rounded-lg space-y-2"
                data-testid={`form-${form.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{form.name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <Badge variant="outline" className="text-xs">
                        {categoryLabels[form.category || "other"]}
                      </Badge>
                      {form.isFillable && (
                        <Badge variant="secondary" className="text-xs">Fillable</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(form.fileData || form.externalUrl) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (form.fileData) {
                          const blob = new Blob(
                            [Uint8Array.from(atob(form.fileData), c => c.charCodeAt(0))],
                            { type: form.fileType || 'application/pdf' }
                          );
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                        } else if (form.externalUrl) {
                          window.open(form.externalUrl, "_blank");
                        }
                      }}
                      data-testid={`button-download-form-${form.id}`}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      {form.fileData ? "View PDF" : "View Form"}
                    </Button>
                  )}
                  {canAutoFill(form) && profile && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleGeneratePreFill(form)}
                      disabled={generatingFormId !== null}
                      data-testid={`button-prefill-form-${form.id}`}
                    >
                      {generatingFormId === form.id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4 mr-1" />
                      )}
                      {generatingFormId === form.id ? "Generating..." : "Generate Filled Form"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {profile 
              ? `Using data from "${profile.vehicleName || 'Your Vehicle'}" to generate filled forms. Auto-fill is available for forms showing the "Generate Filled Form" button.`
              : "Select a vehicle to enable form auto-fill with your profile data."}
          </p>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center italic">
        Always verify requirements directly with official town sources.
      </p>

      <Dialog open={showCredentialsModal} onOpenChange={setShowCredentialsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Portal Login Required</DialogTitle>
            <DialogDescription>
              Enter your {town.townName} permit portal credentials. Your credentials are encrypted and stored securely.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {automationStatus && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
                {automationStatus}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="portal-username">Portal Email/Username</Label>
              <Input
                id="portal-username"
                type="email"
                placeholder="your@email.com"
                value={portalUsername}
                onChange={(e) => setPortalUsername(e.target.value)}
                disabled={isRunningAutomation}
                data-testid="input-portal-username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="portal-password">Portal Password</Label>
              <Input
                id="portal-password"
                type="password"
                placeholder="Your portal password"
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.target.value)}
                disabled={isRunningAutomation}
                data-testid="input-portal-password"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              The automation will fill forms using your saved profile data. You'll still need to review and submit the final application.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCredentialsModal(false);
                setPortalUsername("");
                setPortalPassword("");
                setAutomationStatus(null);
              }}
              disabled={isRunningAutomation}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRunAutomation}
              disabled={isRunningAutomation || !portalUsername || !portalPassword}
              data-testid="button-run-automation"
            >
              {isRunningAutomation ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Automation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
