import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, Circle, Upload, Loader2, X, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type FoodTruck = {
  id: number;
  slug: string;
  name: string;
  cuisine: string | null;
  towns: string[] | null;
  website: string | null;
  email: string | null;
  description: string | null;
  status: string | null;
  instagramHandle: string | null;
};

const DOC_ZONES = [
  { id: "health-permit", label: "Health Permit / Vendor License", badge: "Required for permits", required: true },
  { id: "commissary-letter", label: "Commissary Agreement", badge: "Required for permits", required: true },
  { id: "trailer-diagram", label: "Truck / Trailer Diagram", badge: "Required for permits", required: true },
  { id: "menu", label: "Menu", badge: "Helps fill applications", required: false },
  { id: "supplier-list", label: "Food Suppliers List", badge: "Helps fill applications", required: false },
  { id: "food-manager-cert", label: "Food Manager Certificate", badge: "Recommended", required: false },
  { id: "permit-application", label: "Past Permit Application", badge: "Fastest setup", required: false },
];

export default function ClaimFlow() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0); // 0=verify, 1=merge, 2=docs, 3=done
  const [truck, setTruck] = useState<FoodTruck | null>(null);
  const [truckLoading, setTruckLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [vaultScore, setVaultScore] = useState<number | null>(null);
  const [docParsing, setDocParsing] = useState<Record<string, boolean>>({});
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ name: string; type: string; url: string; folder: string }>>([]);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/auth?next=/claim/${slug}`);
    }
  }, [authLoading, isAuthenticated, slug, navigate]);

  // Load truck data
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/directory/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => { setTruck(data); setTruckLoading(false); })
      .catch(() => { setTruckLoading(false); navigate("/directory"); });
  }, [slug, navigate]);

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/directory/${slug}/claim-authenticated`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to claim");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setProfileId(data.profileId);
      setStep(1);
    },
    onError: (err: Error) => {
      if (err.message.includes("Already claimed")) {
        toast({ title: "Already claimed", description: "This listing has already been claimed.", variant: "destructive" });
        navigate(`/directory/${slug}`);
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

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
    const updated = uploadedDocs.filter((d) => d.folder !== zoneId);
    updated.push(newDoc);
    setUploadedDocs(updated);

    if (!profileId) return;
    setDocParsing((prev) => ({ ...prev, [zoneId]: true }));
    try {
      await apiRequest("PATCH", `/api/profiles/${profileId}`, {
        uploadsJson: { documents: updated },
      });
      const docIndex = updated.length - 1;
      const parseRes = await apiRequest(
        "POST",
        `/api/profiles/${profileId}/parse-document/${docIndex}`,
        {}
      );
      const parseData = await parseRes.json();
      if (parseData.vaultCompleteness) {
        setVaultScore(parseData.vaultCompleteness.score ?? null);
      }
    } catch {
      // non-fatal
    } finally {
      setDocParsing((prev) => ({ ...prev, [zoneId]: false }));
    }
  };

  const handleFinishDocs = async () => {
    if (profileId) {
      // Fetch final vault score
      try {
        const res = await apiRequest("GET", `/api/vault?profileId=${profileId}`);
        if (res.ok) {
          const data = await res.json();
          setVaultScore(data.completeness?.score ?? vaultScore);
        }
      } catch { /* non-fatal */ }
    }
    setStep(3);
  };

  if (authLoading || truckLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!truck) return null;

  const isClaimed = truck.status === "claimed";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center h-full px-4 max-w-lg mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/directory/${slug}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="flex-1 text-center font-display font-semibold">Claim Your Listing</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">

        {/* Step 0: Verify */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold mb-2">Is this your food truck?</h2>
              <p className="text-muted-foreground text-sm">
                We found a listing for <strong>{truck.name}</strong>. Confirm it's yours to unlock permit filing.
              </p>
            </div>

            <Card className="p-5 space-y-3">
              <p className="font-semibold text-lg">{truck.name}</p>
              {truck.cuisine && (
                <p className="text-sm text-muted-foreground">Cuisine: {truck.cuisine}</p>
              )}
              {truck.description && (
                <p className="text-sm text-muted-foreground">{truck.description}</p>
              )}
              {truck.towns && truck.towns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {truck.towns.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              )}
              {truck.website && (
                <p className="text-xs text-muted-foreground">{truck.website}</p>
              )}
            </Card>

            {isClaimed ? (
              <Card className="p-4 border-destructive/30 bg-destructive/5">
                <p className="text-sm text-destructive">This listing has already been claimed.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                <Button
                  className="w-full h-12"
                  onClick={() => claimMutation.mutate()}
                  disabled={claimMutation.isPending}
                >
                  {claimMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Claiming...</>
                  ) : (
                    "Yes, this is my truck →"
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => navigate("/directory")}
                >
                  No, wrong truck
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Merge Confirmation */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">
                We've added {truck.name} to your account.
              </h2>
              <p className="text-muted-foreground text-sm">
                Here's what we already know about you:
              </p>
            </div>

            <Card className="p-5 space-y-2">
              {[
                { label: "Truck Name", value: truck.name },
                { label: "Cuisine", value: truck.cuisine },
                { label: "Description", value: truck.description },
                { label: "Website", value: truck.website },
                { label: "Email", value: truck.email },
                { label: "Towns Served", value: truck.towns?.join(", ") },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  {value ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <span className="text-muted-foreground">{label}:</span>
                  <span className={value ? "" : "text-muted-foreground italic"}>
                    {value ?? "not found"}
                  </span>
                </div>
              ))}
            </Card>

            <Button className="w-full h-12" onClick={() => setStep(2)}>
              Upload your documents to complete setup →
            </Button>
          </div>
        )}

        {/* Step 2: Doc Upload */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold mb-2">Let's learn about your business</h2>
              <p className="text-muted-foreground text-sm">
                Upload your documents and we'll fill out permit applications automatically.
              </p>
            </div>

            {DOC_ZONES.map((zone) => {
              const uploaded = uploadedDocs.find((d) => d.folder === zone.id);
              const parsing = docParsing[zone.id];

              return (
                <Card key={zone.id} className={`p-4 ${uploaded ? "border-green-500/50 bg-green-500/5" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{zone.label}</span>
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
                      {uploaded && (
                        <p className="text-xs text-muted-foreground truncate">{uploaded.name}</p>
                      )}
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
                          setUploadedDocs((prev) => prev.filter((d) => d.folder !== zone.id))
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

            <Button className="w-full h-12" onClick={handleFinishDocs}>
              Continue →
            </Button>
            <button
              type="button"
              onClick={handleFinishDocs}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline py-1"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="py-8">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">Your listing is live!</h2>
              <p className="text-muted-foreground text-sm">
                {vaultScore !== null
                  ? `Your permit data vault is ${vaultScore}% complete.`
                  : "Your listing is connected to your account."}
              </p>
            </div>

            <Card className="p-4 bg-primary/5 border-primary/20 text-left">
              <p className="text-sm text-primary font-medium mb-1">Your listing is live at:</p>
              <p className="text-sm text-muted-foreground">permitpilot.cloud/directory/{slug}</p>
            </Card>

            <div className="space-y-3">
              <Button className="w-full h-12" onClick={() => navigate("/new-permit")}>
                File a permit →
              </Button>
              <Button variant="outline" className="w-full h-12" onClick={() => navigate("/dashboard")}>
                Go to dashboard
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
