import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, MapPin, Phone, Clock, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { PublicProfile, Profile } from "@shared/schema";

interface PublicProfileSectionProps {
  vehicleProfile: Profile;
}

export function PublicProfileSection({ vehicleProfile }: PublicProfileSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: publicProfile, isLoading } = useQuery<PublicProfile | null>({
    queryKey: ["/api/my-public-profile"],
  });

  const [formData, setFormData] = useState({
    isPublic: false,
    businessName: "",
    description: "",
    phoneNumber: "",
    website: "",
    locationAddress: "",
    locationLat: "",
    locationLng: "",
  });

  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (publicProfile) {
      setFormData({
        isPublic: publicProfile.isPublic || false,
        businessName: publicProfile.businessName || "",
        description: publicProfile.description || "",
        phoneNumber: publicProfile.phoneNumber || "",
        website: publicProfile.website || "",
        locationAddress: publicProfile.locationAddress || "",
        locationLat: publicProfile.locationLat || "",
        locationLng: publicProfile.locationLng || "",
      });
    }
  }, [publicProfile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/public-profiles", {
        profileId: vehicleProfile.id,
        ...formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-public-profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public-profiles"] });
      toast({ title: "Saved!", description: "Your public profile has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save public profile.", variant: "destructive" });
    },
  });

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Error", description: "Geolocation not supported.", variant: "destructive" });
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toString();
        const lng = position.coords.longitude.toString();
        
        // Reverse geocode to get address
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
          );
          const data = await response.json();
          
          setFormData((prev) => ({
            ...prev,
            locationLat: lat,
            locationLng: lng,
            locationAddress: data.display_name || "",
          }));
        } catch (error) {
          setFormData((prev) => ({
            ...prev,
            locationLat: lat,
            locationLng: lng,
          }));
        }
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast({ title: "Error", description: "Could not get your location.", variant: "destructive" });
        setIsLocating(false);
      }
    );
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display font-semibold text-lg">Public Profile</h3>
          <p className="text-sm text-muted-foreground">
            Let customers find you on the Discover map
          </p>
        </div>
        <div className="flex items-center gap-3">
          {formData.isPublic ? (
            <Eye className="w-5 h-5 text-green-500" />
          ) : (
            <EyeOff className="w-5 h-5 text-muted-foreground" />
          )}
          <Switch
            checked={formData.isPublic}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isPublic: checked }))}
            data-testid="switch-public-profile"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="businessName">Business Name</Label>
          <Input
            id="businessName"
            value={formData.businessName}
            onChange={(e) => setFormData((prev) => ({ ...prev, businessName: e.target.value }))}
            placeholder="Your food truck name"
            data-testid="input-business-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Tell customers about your food truck..."
            rows={3}
            data-testid="input-description"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">
              <Phone className="w-4 h-4 inline mr-1" />
              Phone
            </Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))}
              placeholder="(555) 555-5555"
              data-testid="input-phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">
              <Globe className="w-4 h-4 inline mr-1" />
              Website
            </Label>
            <Input
              id="website"
              value={formData.website}
              onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
              placeholder="https://..."
              data-testid="input-website"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            <MapPin className="w-4 h-4 inline mr-1" />
            Location
          </Label>
          <div className="flex gap-2">
            <Input
              value={formData.locationAddress}
              onChange={(e) => setFormData((prev) => ({ ...prev, locationAddress: e.target.value }))}
              placeholder="Your usual location or address"
              className="flex-1"
              data-testid="input-location-address"
            />
            <Button
              variant="outline"
              onClick={handleGetLocation}
              disabled={isLocating}
              data-testid="button-get-location"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
            </Button>
          </div>
          {formData.locationLat && formData.locationLng && (
            <p className="text-xs text-muted-foreground">
              Coordinates: {parseFloat(formData.locationLat).toFixed(4)}, {parseFloat(formData.locationLng).toFixed(4)}
            </p>
          )}
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full"
          data-testid="button-save-public-profile"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Public Profile
        </Button>
      </div>
    </Card>
  );
}
