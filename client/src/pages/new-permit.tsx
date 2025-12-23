import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Calendar, FileText, ExternalLink, Printer, Check, AlertTriangle, MapPin, Clock, User, Phone } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { apiRequest } from "@/lib/queryClient";
import { ProgressStepper } from "@/components/progress-stepper";
import { TownSearch } from "@/components/town-search";
import { RequirementsChecklist } from "@/components/requirements-checklist";
import { SignatureCanvas } from "@/components/signature-canvas";
import { ConfidenceIndicator } from "@/components/confidence-indicator";
import { PermitPacket } from "@/components/permit-packet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Profile, Town } from "@shared/schema";

const getSteps = (permitType: string | null) => {
  if (permitType === "temporary") {
    return ["Type", "Location", "Event", "Requirements", "Submit"];
  }
  return ["Type", "Location", "Requirements", "Submit"];
};

const permitTypes = [
  {
    value: "yearly",
    label: "Yearly Permit",
    description: "Year-round operation in one town",
    icon: Calendar,
  },
  {
    value: "temporary",
    label: "Temporary / Event",
    description: "Single event or short-term operation",
    icon: FileText,
  },
  {
    value: "seasonal",
    label: "Seasonal / Market",
    description: "Farmers markets or seasonal locations",
    icon: Calendar,
  },
];

export default function NewPermit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const {
    newPermit,
    permitStep,
    setNewPermitField,
    setPermitStep,
    toggleChecklistItem,
    resetNewPermit,
  } = useAppStore();

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });

  const { data: towns = [], isLoading: townsLoading } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
  });

  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [showPacket, setShowPacket] = useState(false);

  useEffect(() => {
    if (profiles.length > 0 && !selectedProfile) {
      setSelectedProfile(profiles[0].id);
      setNewPermitField("profileId", profiles[0].id);
    }
  }, [profiles, selectedProfile, setNewPermitField]);

  const createPermitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/permits", {
        userId: user?.id,
        profileId: selectedProfile,
        townId: newPermit.townId,
        permitType: newPermit.permitType,
        status: "draft",
        checklistProgress: newPermit.checklistProgress,
        signatureData: newPermit.signatureData,
        isPioneer: (newPermit.town?.confidenceScore || 50) < 60,
        eventName: newPermit.eventName || null,
        eventDate: newPermit.eventDate ? new Date(newPermit.eventDate) : null,
        eventEndDate: newPermit.eventEndDate ? new Date(newPermit.eventEndDate) : null,
        eventAddress: newPermit.eventAddress || null,
        eventCity: newPermit.eventCity || null,
        eventHours: newPermit.eventHoursStart && newPermit.eventHoursEnd
          ? [{ start: newPermit.eventHoursStart, end: newPermit.eventHoursEnd }]
          : null,
        eventContactName: newPermit.eventContactName || null,
        eventContactPhone: newPermit.eventContactPhone || null,
        notes: newPermit.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/badges"] });
      resetNewPermit();
      toast({
        title: "Permit Created!",
        description: "Your permit application has been saved.",
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create permit. Please try again.",
        variant: "destructive",
      });
    },
  });

  const steps = getSteps(newPermit.permitType);
  const isTemporary = newPermit.permitType === "temporary";
  const currentStepName = steps[permitStep] || "Type";

  const canProceed = () => {
    switch (currentStepName) {
      case "Type":
        return newPermit.permitType !== null;
      case "Location":
        return newPermit.townId !== null;
      case "Event":
        return newPermit.eventDate !== '';
      case "Requirements":
        return true;
      case "Submit":
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (permitStep < steps.length - 1) {
      setPermitStep(permitStep + 1);
    }
  };

  const handleBack = () => {
    if (permitStep > 0) {
      setPermitStep(permitStep - 1);
    } else {
      resetNewPermit();
      setLocation("/dashboard");
    }
  };

  const handleTownSelect = (town: Town) => {
    setNewPermitField("townId", town.id);
    setNewPermitField("town", town);
  };

  if (profiles.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold mb-2">Add a Vehicle First</h2>
          <p className="text-muted-foreground mb-6">
            You need to add at least one vehicle before creating a permit.
          </p>
          <Button onClick={() => setLocation("/onboarding")} data-testid="button-add-vehicle">
            Add Your Vehicle
          </Button>
        </Card>
      </div>
    );
  }

  const currentProfile = profiles.find(p => p.id === selectedProfile);

  if (showPacket && newPermit.town && currentProfile && newPermit.permitType) {
    return (
      <PermitPacket
        town={newPermit.town}
        profile={currentProfile}
        permitType={newPermit.permitType}
        signature={newPermit.signatureData}
        onClose={() => setShowPacket(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center h-full px-4 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="flex-1 text-center font-display font-semibold">
            New Permit
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto w-full">
        <ProgressStepper steps={steps} currentStep={permitStep} className="mb-8" />
      </div>

      <main className="flex-1 px-4 pb-32 max-w-lg mx-auto w-full">
        {currentStepName === "Type" && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Permit Type
              </h2>
              <p className="text-muted-foreground">
                What kind of permit do you need?
              </p>
            </div>

            {profiles.length > 1 && (
              <div className="space-y-2 mb-6">
                <label className="text-sm font-medium">Select Vehicle</label>
                <Select
                  value={selectedProfile || ""}
                  onValueChange={(value) => {
                    setSelectedProfile(value);
                    setNewPermitField("profileId", value);
                  }}
                >
                  <SelectTrigger className="h-12" data-testid="select-vehicle">
                    <SelectValue placeholder="Choose a vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.vehicleName || `My ${profile.vehicleType}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3">
              {permitTypes.map((type) => (
                <Card
                  key={type.value}
                  className={`p-4 cursor-pointer transition-all ${
                    newPermit.permitType === type.value
                      ? "ring-2 ring-primary bg-primary/5"
                      : "hover-elevate"
                  }`}
                  onClick={() => setNewPermitField("permitType", type.value as any)}
                  data-testid={`card-permit-${type.value}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      newPermit.permitType === type.value ? "bg-primary/20" : "bg-muted"
                    }`}>
                      <type.icon className={`w-6 h-6 ${
                        newPermit.permitType === type.value ? "text-primary" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{type.label}</h3>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {currentStepName === "Location" && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Select Location
              </h2>
              <p className="text-muted-foreground">
                Where do you want to operate?
              </p>
            </div>

            <div className="space-y-2 mb-4">
              <label className="text-sm font-medium">State</label>
              <Select
                value={newPermit.state}
                onValueChange={(value) => setNewPermitField("state", value)}
              >
                <SelectTrigger className="h-12" data-testid="select-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CT">Connecticut</SelectItem>
                  <SelectItem value="NY" disabled>New York (Coming Soon)</SelectItem>
                  <SelectItem value="NJ" disabled>New Jersey (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <TownSearch
              towns={towns}
              selectedState={newPermit.state}
              selectedTownId={newPermit.townId}
              onSelectTown={handleTownSelect}
              isLoading={townsLoading}
            />

            {newPermit.town && (
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{newPermit.town.townName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {newPermit.town.county} County, {newPermit.town.state}
                    </p>
                  </div>
                  <ConfidenceIndicator score={newPermit.town.confidenceScore || 50} />
                </div>
              </Card>
            )}
          </div>
        )}

        {currentStepName === "Event" && newPermit.town && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Event Details
              </h2>
              <p className="text-muted-foreground">
                Tell us about your event or operation
              </p>
            </div>

            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  value={newPermit.eventName}
                  onChange={(e) => setNewPermitField("eventName", e.target.value)}
                  placeholder="e.g., Bethel Town Fair, Weekly Market"
                  data-testid="input-event-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="eventDate">Start Date *</Label>
                  <Input
                    id="eventDate"
                    type="date"
                    value={newPermit.eventDate}
                    onChange={(e) => setNewPermitField("eventDate", e.target.value)}
                    data-testid="input-event-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventEndDate">End Date</Label>
                  <Input
                    id="eventEndDate"
                    type="date"
                    value={newPermit.eventEndDate}
                    onChange={(e) => setNewPermitField("eventEndDate", e.target.value)}
                    data-testid="input-event-end-date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="eventAddress">Event Address</Label>
                <Input
                  id="eventAddress"
                  value={newPermit.eventAddress}
                  onChange={(e) => setNewPermitField("eventAddress", e.target.value)}
                  placeholder="123 Main Street"
                  data-testid="input-event-address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="eventCity">City</Label>
                <Input
                  id="eventCity"
                  value={newPermit.eventCity}
                  onChange={(e) => setNewPermitField("eventCity", e.target.value)}
                  placeholder={newPermit.town?.townName || "City"}
                  data-testid="input-event-city"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="eventHoursStart">Start Time</Label>
                  <Input
                    id="eventHoursStart"
                    type="time"
                    value={newPermit.eventHoursStart}
                    onChange={(e) => setNewPermitField("eventHoursStart", e.target.value)}
                    data-testid="input-hours-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventHoursEnd">End Time</Label>
                  <Input
                    id="eventHoursEnd"
                    type="time"
                    value={newPermit.eventHoursEnd}
                    onChange={(e) => setNewPermitField("eventHoursEnd", e.target.value)}
                    data-testid="input-hours-end"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="eventContactName">Contact Name</Label>
                  <Input
                    id="eventContactName"
                    value={newPermit.eventContactName}
                    onChange={(e) => setNewPermitField("eventContactName", e.target.value)}
                    placeholder="John Doe"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventContactPhone">Contact Phone</Label>
                  <Input
                    id="eventContactPhone"
                    type="tel"
                    value={newPermit.eventContactPhone}
                    onChange={(e) => setNewPermitField("eventContactPhone", e.target.value)}
                    placeholder="(555) 123-4567"
                    data-testid="input-contact-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={newPermit.notes}
                  onChange={(e) => setNewPermitField("notes", e.target.value)}
                  placeholder="Any special requirements or notes..."
                  className="resize-none"
                  data-testid="input-notes"
                />
              </div>
            </Card>
          </div>
        )}

        {currentStepName === "Requirements" && newPermit.town && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Requirements
              </h2>
              <p className="text-muted-foreground">
                Complete the checklist for {newPermit.town.townName}
              </p>
            </div>

            <RequirementsChecklist
              town={newPermit.town}
              progress={newPermit.checklistProgress}
              onToggle={toggleChecklistItem}
              profile={currentProfile}
            />
          </div>
        )}

        {currentStepName === "Submit" && newPermit.town && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Submit Application
              </h2>
              <p className="text-muted-foreground">
                Choose how to complete your application
              </p>
            </div>

            <div className="space-y-4">
              {newPermit.town.formType === "online_portal" && newPermit.town.portalUrl && (
                <Card className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <ExternalLink className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Online Portal</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        Submit directly through the town's online portal
                      </p>
                      <Button
                        className="w-full"
                        onClick={() => window.open(newPermit.town?.portalUrl || "", "_blank")}
                        data-testid="button-open-portal"
                      >
                        Open Portal
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <Card className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Printer className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">PDF Packet</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Generate a complete application packet for print/mail
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => setShowPacket(true)}
                      disabled={!selectedProfile}
                      data-testid="button-generate-pdf"
                    >
                      Generate PDF
                      <FileText className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-4">Digital Signature</h3>
              <SignatureCanvas
                onSave={(data) => setNewPermitField("signatureData", data)}
                initialValue={newPermit.signatureData}
              />
            </div>

            {(newPermit.town.confidenceScore || 50) < 60 && (
              <Card className="p-4 bg-amber-500/10 border-amber-500/20">
                <div className="flex items-start gap-3">
                  <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-black shrink-0">
                    Pioneer
                  </Badge>
                  <div>
                    <p className="text-sm">
                      You'll be one of the first to complete a permit in {newPermit.town.townName}! 
                      After submission, help the community by completing a quick survey.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            <Button
              className="w-full h-12"
              onClick={() => createPermitMutation.mutate()}
              disabled={createPermitMutation.isPending}
              data-testid="button-save-permit"
            >
              {createPermitMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Application
                </>
              )}
            </Button>
          </div>
        )}
      </main>

      {permitStep < steps.length - 1 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t border-border safe-area-inset-bottom">
          <div className="flex gap-4 max-w-lg mx-auto">
            <Button
              variant="outline"
              onClick={handleBack}
              className="h-12 flex-1"
              data-testid="button-step-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="h-12 flex-1"
              data-testid="button-step-next"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
