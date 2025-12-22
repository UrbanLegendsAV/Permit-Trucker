import { useState } from "react";
import { useLocation } from "wouter";
import { Truck, Caravan, ArrowLeft, ArrowRight, Check, Upload, Globe, Eye, EyeOff, MapPin } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import { apiRequest } from "@/lib/queryClient";
import { ProgressStepper } from "@/components/progress-stepper";
import { DocumentUpload } from "@/components/document-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const steps = ["Vehicle Type", "Details", "Food Info", "Documents", "Visibility"];

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

  const createProfileMutation = useMutation({
    mutationFn: async () => {
      const profileResponse = await apiRequest("POST", "/api/profiles", {
        userId: user?.id,
        vehicleType: onboarding.vehicleType,
        vehicleName: onboarding.vehicleName,
        vinPlate: onboarding.vinPlate,
        menuType: onboarding.menuType,
        hasPropane: onboarding.hasPropane,
        hasQfoCert: onboarding.hasQfoCert,
        commissaryName: onboarding.commissaryName,
        commissaryAddress: onboarding.commissaryAddress,
        uploadsJson: { documents: onboarding.documents },
        extractedData: Object.keys(onboarding.extractedData).length > 0 
          ? onboarding.extractedData 
          : null,
      });

      const profile = await profileResponse.json();

      // Create public profile if opted in
      if (onboarding.wantsPublicProfile) {
        await apiRequest("POST", "/api/public-profiles", {
          profileId: profile.id,
          isPublic: true,
          businessName: onboarding.publicBusinessName || onboarding.vehicleName,
          description: onboarding.publicDescription,
        });
      }

      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-public-profile"] });
      resetOnboarding();
      toast({
        title: "Vehicle Added!",
        description: onboarding.wantsPublicProfile 
          ? "Your vehicle is registered and visible on the Discover map!"
          : "Your vehicle has been registered successfully.",
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return onboarding.vehicleType !== null;
      case 1:
        return true;
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return true; // Public profile opt-in is optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      createProfileMutation.mutate();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center h-full px-4 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="flex-1 text-center font-display font-semibold">
            Add Your Vehicle
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto w-full">
        <ProgressStepper steps={steps} currentStep={currentStep} className="mb-8" />
      </div>

      <main className="flex-1 px-4 pb-32 max-w-lg mx-auto w-full">
        {currentStep === 0 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                What type of vehicle?
              </h2>
              <p className="text-muted-foreground">
                Select your food service vehicle type
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card
                className={`p-6 cursor-pointer transition-all ${
                  onboarding.vehicleType === "truck"
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover-elevate"
                }`}
                onClick={() => setOnboardingField("vehicleType", "truck")}
                data-testid="card-truck"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                    onboarding.vehicleType === "truck" ? "bg-primary/20" : "bg-muted"
                  }`}>
                    <Truck className={`w-8 h-8 ${
                      onboarding.vehicleType === "truck" ? "text-primary" : "text-muted-foreground"
                    }`} />
                  </div>
                  <span className="font-semibold">Food Truck</span>
                </div>
              </Card>

              <Card
                className={`p-6 cursor-pointer transition-all ${
                  onboarding.vehicleType === "trailer"
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover-elevate"
                }`}
                onClick={() => setOnboardingField("vehicleType", "trailer")}
                data-testid="card-trailer"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                    onboarding.vehicleType === "trailer" ? "bg-primary/20" : "bg-muted"
                  }`}>
                    <Caravan className={`w-8 h-8 ${
                      onboarding.vehicleType === "trailer" ? "text-primary" : "text-muted-foreground"
                    }`} />
                  </div>
                  <span className="font-semibold">Food Trailer</span>
                </div>
              </Card>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Vehicle Details
              </h2>
              <p className="text-muted-foreground">
                Enter your vehicle information
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vehicleName">Vehicle Name (Optional)</Label>
                <Input
                  id="vehicleName"
                  placeholder="e.g., The Taco Truck"
                  value={onboarding.vehicleName}
                  onChange={(e) => setOnboardingField("vehicleName", e.target.value)}
                  className="h-12"
                  data-testid="input-vehicle-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vinPlate">VIN or License Plate</Label>
                <Input
                  id="vinPlate"
                  placeholder="Enter VIN or plate number"
                  value={onboarding.vinPlate}
                  onChange={(e) => setOnboardingField("vinPlate", e.target.value)}
                  className="h-12"
                  data-testid="input-vin-plate"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Food & Equipment
              </h2>
              <p className="text-muted-foreground">
                Tell us about your food service
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="menuType">Menu Type / Cuisine</Label>
                <Input
                  id="menuType"
                  placeholder="e.g., Mexican, BBQ, Ice Cream"
                  value={onboarding.menuType}
                  onChange={(e) => setOnboardingField("menuType", e.target.value)}
                  className="h-12"
                  data-testid="input-menu-type"
                />
              </div>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="propane" className="font-medium">Propane Equipment</Label>
                    <p className="text-sm text-muted-foreground">
                      Do you use propane for cooking?
                    </p>
                  </div>
                  <Switch
                    id="propane"
                    checked={onboarding.hasPropane}
                    onCheckedChange={(checked) => setOnboardingField("hasPropane", checked)}
                    data-testid="switch-propane"
                  />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="qfo" className="font-medium">QFO Certification</Label>
                    <p className="text-sm text-muted-foreground">
                      Have a Qualified Food Operator cert?
                    </p>
                  </div>
                  <Switch
                    id="qfo"
                    checked={onboarding.hasQfoCert}
                    onCheckedChange={(checked) => setOnboardingField("hasQfoCert", checked)}
                    data-testid="switch-qfo"
                  />
                </div>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="commissary">Commissary Name</Label>
                <Input
                  id="commissary"
                  placeholder="Your commissary kitchen name"
                  value={onboarding.commissaryName}
                  onChange={(e) => setOnboardingField("commissaryName", e.target.value)}
                  className="h-12"
                  data-testid="input-commissary"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="commissaryAddress">Commissary Address</Label>
                <Textarea
                  id="commissaryAddress"
                  placeholder="Full address of commissary"
                  value={onboarding.commissaryAddress}
                  onChange={(e) => setOnboardingField("commissaryAddress", e.target.value)}
                  data-testid="input-commissary-address"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Upload Documents
              </h2>
              <p className="text-muted-foreground">
                Upload your existing permits, insurance, or other docs
              </p>
            </div>

            <DocumentUpload
              onUpload={(files) => setOnboardingField("documents", files)}
              existingFiles={onboarding.documents}
              label="Vehicle Documents"
              enableOCR={true}
              onOCRExtracted={(data) => {
                // Pre-fill form fields with OCR data
                if (data.businessName && !onboarding.vehicleName) {
                  setOnboardingField("vehicleName", data.businessName);
                }
                if (data.vinPlate && !onboarding.vinPlate) {
                  setOnboardingField("vinPlate", data.vinPlate);
                }
                
                // Accumulate OCR extracted data for saving to profile
                setOnboardingField("extractedData", {
                  ...onboarding.extractedData,
                  ...(data.businessName && { businessName: data.businessName }),
                  ...(data.vinPlate && { vin: data.vinPlate }),
                  ...(data.licenseNumber && { licenseNumber: data.licenseNumber }),
                  ...(data.expirationDate && { expirationDate: data.expirationDate }),
                  ...(data.address && { rawText: data.address }),
                });
              }}
            />

            <Card className="p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                You can add more documents later. We&apos;ll use OCR to extract information 
                and pre-fill your permit applications.
              </p>
            </Card>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-bold mb-2">
                Public Visibility
              </h2>
              <p className="text-muted-foreground">
                Let customers find your food truck on our Discover map
              </p>
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
                    <p className="text-sm text-muted-foreground">
                      Let customers find you
                    </p>
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
      </main>

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
            disabled={!canProceed() || createProfileMutation.isPending}
            className="h-12 flex-1"
            data-testid="button-step-next"
          >
            {createProfileMutation.isPending ? (
              "Saving..."
            ) : currentStep === steps.length - 1 ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Finish
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
