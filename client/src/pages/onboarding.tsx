import { useState } from "react";
import { useLocation } from "wouter";
import { Truck, Caravan, ArrowLeft, ArrowRight, Check, Globe, Eye, EyeOff, MapPin, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const steps = ["Vehicle Type", "Details", "Food Info", "Suppliers & Ops", "Documents", "Visibility"];

const SUPPLIER_SUGGESTIONS = ["Ki Brasil market", "Restaurant Depot", "Costco", "Price Rite", "CTOWN"];

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
      const operationsData = {
        commissaryPhone: onboarding.commissaryPhone || undefined,
        hasCommissaryContract: onboarding.hasCommissaryContract || undefined,
        overnightParkingAddress: onboarding.overnightParkingAddress || undefined,
        overnightParkingAuthorized: onboarding.overnightParkingAuthorized || undefined,
        electricitySource: onboarding.electricitySource || undefined,
        generatorInfo: onboarding.generatorInfo || undefined,
        wasteWaterDisposal: onboarding.wasteWaterDisposal || undefined,
        handWashingSetup: onboarding.handWashingSetup || undefined,
        truckInteriorDescription: onboarding.truckInteriorDescription || undefined,
        garbageSetup: onboarding.garbageSetup || undefined,
      };

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
        operationsData,
        uploadsJson: { documents: onboarding.documents },
        extractedData: Object.keys(onboarding.extractedData).length > 0
          ? onboarding.extractedData
          : null,
      });

      const profile = await profileResponse.json();

      // Save suppliers
      for (const s of onboarding.suppliers) {
        if (s.name.trim()) {
          await apiRequest("POST", "/api/suppliers", {
            supplierName: s.name.trim(),
            suppliesWhat: s.suppliesWhat.trim() || undefined,
            profileId: profile.id,
          });
        }
      }

      // Sync vault after profile creation
      await apiRequest("POST", `/api/profiles/${profile.id}/sync-vault`, {});

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
      case 0: return onboarding.vehicleType !== null;
      case 1: return true;
      case 2: return true;
      case 3: return true; // Suppliers & Ops — all optional
      case 4: return true;
      case 5: return true; // Visibility — optional
      default: return false;
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
          <div className="space-y-8">
            <div className="text-center mb-6">
              <h2 className="font-display text-2xl font-bold mb-2">Suppliers & Operations</h2>
              <p className="text-muted-foreground">Used to auto-fill health permit applications</p>
            </div>

            {/* FOOD SUPPLIERS */}
            <div className="space-y-3">
              <div>
                <Label className="text-base font-semibold">Food Suppliers</Label>
                <p className="text-xs text-muted-foreground mt-0.5">This appears on health permit applications (Question 4)</p>
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
                  <Button variant="ghost" size="icon" onClick={() => {
                    setOnboardingField("suppliers", onboarding.suppliers.filter((_, idx) => idx !== i));
                  }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOnboardingField("suppliers", [...onboarding.suppliers, { name: "", suppliesWhat: "" }])}>
                <Plus className="w-4 h-4 mr-2" /> Add another supplier
              </Button>
              <div className="flex flex-wrap gap-2 pt-1">
                {SUPPLIER_SUGGESTIONS.map(s => (
                  <button key={s} type="button"
                    className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted"
                    onClick={() => setOnboardingField("suppliers", [...onboarding.suppliers, { name: s, suppliesWhat: "" }])}>
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            {/* COMMISSARY */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Commissary</Label>
              {!onboarding.commissaryName && (
                <Input placeholder="Commissary name" value={onboarding.commissaryName}
                  onChange={(e) => setOnboardingField("commissaryName", e.target.value)} className="h-10" />
              )}
              {onboarding.commissaryName && (
                <p className="text-sm text-muted-foreground">Commissary: <strong>{onboarding.commissaryName}</strong></p>
              )}
              <Input placeholder="Commissary phone" value={onboarding.commissaryPhone}
                onChange={(e) => setOnboardingField("commissaryPhone", e.target.value)} className="h-10" />
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Commissary contract on file?</Label>
                    <p className="text-xs text-muted-foreground">Do you have a written commissary agreement?</p>
                  </div>
                  <Switch checked={onboarding.hasCommissaryContract}
                    onCheckedChange={(v) => setOnboardingField("hasCommissaryContract", v)} />
                </div>
              </Card>
            </div>

            {/* OVERNIGHT PARKING */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Vehicle Overnight Parking</Label>
              <Input placeholder="Where is your truck parked overnight? (address)"
                value={onboarding.overnightParkingAddress}
                onChange={(e) => setOnboardingField("overnightParkingAddress", e.target.value)} className="h-10" />
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Written parking authorization?</Label>
                  </div>
                  <Switch checked={onboarding.overnightParkingAuthorized}
                    onCheckedChange={(v) => setOnboardingField("overnightParkingAuthorized", v)} />
                </div>
              </Card>
            </div>

            {/* ELECTRICITY */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Electricity Source</Label>
              <Select value={onboarding.electricitySource} onValueChange={(v) => setOnboardingField("electricitySource", v)}>
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
                <Input placeholder="Generator make/model (e.g. Honda EU2200i)"
                  value={onboarding.generatorInfo}
                  onChange={(e) => setOnboardingField("generatorInfo", e.target.value)} className="h-10" />
              )}
            </div>

            {/* WASTE WATER */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Wastewater Disposal</Label>
              <Textarea placeholder="Where is wastewater disposed?"
                value={onboarding.wasteWaterDisposal}
                onChange={(e) => setOnboardingField("wasteWaterDisposal", e.target.value)}
                onFocus={(e) => { if (!e.target.value) setOnboardingField("wasteWaterDisposal", "Disposed of at commissary via their wastewater disposal systems"); }}
                rows={2} />
            </div>

            {/* HAND WASHING */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Hand Washing Setup</Label>
              <Textarea placeholder="Describe your hand washing setup"
                value={onboarding.handWashingSetup}
                onChange={(e) => setOnboardingField("handWashingSetup", e.target.value)}
                onFocus={(e) => { if (!e.target.value) setOnboardingField("handWashingSetup", "Portable hand washing station with soap, paper towels, and a gravity-fed water container with a catch bucket"); }}
                rows={2} />
            </div>

            {/* FLOORS / WALLS / CEILING */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Interior Surfaces</Label>
              <Textarea placeholder="Describe floors, walls, and ceiling"
                value={onboarding.truckInteriorDescription}
                onChange={(e) => setOnboardingField("truckInteriorDescription", e.target.value)}
                onFocus={(e) => { if (!e.target.value) setOnboardingField("truckInteriorDescription", "Stainless steel walls and ceiling, rubber non-slip flooring, LED lighting throughout"); }}
                rows={2} />
            </div>

            {/* GARBAGE */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Garbage Disposal</Label>
              <Textarea placeholder="Describe garbage disposal setup"
                value={onboarding.garbageSetup}
                onChange={(e) => setOnboardingField("garbageSetup", e.target.value)}
                onFocus={(e) => { if (!e.target.value) setOnboardingField("garbageSetup", "Two 32-gallon covered garbage containers inside the truck, additional containers provided by event organizer at the event site"); }}
                rows={2} />
            </div>
          </div>
        )}

        {currentStep === 4 && (
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
                const vinOrPlate = data.vin || data.licensePlate;
                if (vinOrPlate && !onboarding.vinPlate) {
                  setOnboardingField("vinPlate", vinOrPlate);
                }
                
                // Accumulate OCR extracted data for saving to profile
                setOnboardingField("extractedData", {
                  ...onboarding.extractedData,
                  ...(data.businessName && { businessName: data.businessName }),
                  ...(data.vin && { vin: data.vin }),
                  ...(data.licensePlate && { licensePlate: data.licensePlate }),
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

        {currentStep === 5 && (
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
