import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, MapPin, Star, Clock, Phone, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import type { PublicProfile, Review } from "@shared/schema";

// Star rating component
function StarRating({ rating, onRate, interactive = false }: { rating: number; onRate?: (r: number) => void; interactive?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          className={`${interactive ? "cursor-pointer" : "cursor-default"}`}
          data-testid={`star-${star}`}
        >
          <Star
            className={`w-5 h-5 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        </button>
      ))}
    </div>
  );
}

// Review form component
function ReviewForm({ publicProfileId, onSuccess }: { publicProfileId: string; onSuccess: () => void }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  
  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/reviews", {
        publicProfileId,
        rating,
        text: text.trim() || null,
        reviewerName: name.trim() || null,
      });
    },
    onSuccess: () => {
      setRating(0);
      setText("");
      setName("");
      onSuccess();
    },
  });

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-border">
      <p className="text-sm font-medium">Leave a review</p>
      <StarRating rating={rating} onRate={setRating} interactive />
      <Input
        placeholder="Your name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="text-sm"
        data-testid="input-reviewer-name"
      />
      <Textarea
        placeholder="Share your experience (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-sm resize-none"
        rows={2}
        data-testid="input-review-text"
      />
      <Button
        size="sm"
        disabled={rating === 0 || submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
        data-testid="button-submit-review"
      >
        {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
      </Button>
    </div>
  );
}

// Selected truck panel
function TruckPanel({ 
  profile, 
  onClose 
}: { 
  profile: PublicProfile; 
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews", profile.id],
    queryFn: () => fetch(`/api/reviews/${profile.id}`).then((r) => r.json()),
  });

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <Card className="absolute bottom-4 left-4 right-4 max-w-md mx-auto z-[1000] p-4 max-h-[60vh] overflow-y-auto">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-lg">{profile.businessName || "Food Truck"}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      
      {profile.description && (
        <p className="text-sm text-muted-foreground mb-3">{profile.description}</p>
      )}
      
      <div className="flex items-center gap-2 mb-3">
        <StarRating rating={Math.round(avgRating)} />
        <span className="text-sm text-muted-foreground">
          ({reviews.length} {reviews.length === 1 ? "review" : "reviews"})
        </span>
      </div>
      
      {profile.locationAddress && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{profile.locationAddress}</span>
        </div>
      )}
      
      {profile.phoneNumber && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{profile.phoneNumber}</span>
        </div>
      )}
      
      {profile.website && (
        <div className="flex items-center gap-2 text-sm mb-3">
          <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
          <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Website
          </a>
        </div>
      )}
      
      {reviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-sm font-medium mb-2">Recent Reviews</p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {reviews.slice(0, 3).map((review) => (
              <div key={review.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} />
                  {review.reviewerName && (
                    <span className="text-muted-foreground">- {review.reviewerName}</span>
                  )}
                </div>
                {review.text && <p className="mt-1 text-muted-foreground">{review.text}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <ReviewForm
        publicProfileId={profile.id}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/reviews", profile.id] })}
      />
    </Card>
  );
}

export default function Discover() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const { data: publicProfiles = [], isLoading } = useQuery<PublicProfile[]>({
    queryKey: ["/api/public-profiles"],
  });

  // Filter profiles with valid coordinates
  const profilesWithLocation = publicProfiles.filter(
    (p) => p.locationLat && p.locationLng && p.isPublic
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default center: Connecticut
    const defaultCenter: [number, number] = [41.6032, -73.0877];

    mapRef.current = L.map(mapContainerRef.current).setView(defaultCenter, 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Add markers when profiles load
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapRef.current?.removeLayer(layer);
      }
    });

    // Add markers for each profile
    profilesWithLocation.forEach((profile) => {
      if (!mapRef.current || !profile.locationLat || !profile.locationLng) return;

      const marker = L.marker([parseFloat(profile.locationLat), parseFloat(profile.locationLng)])
        .addTo(mapRef.current);

      marker.on("click", () => {
        setSelectedProfile(profile);
      });

      marker.bindTooltip(profile.businessName || "Food Truck", { 
        permanent: false, 
        direction: "top" 
      });
    });
  }, [profilesWithLocation]);

  // Geocode search using Nominatim
  const handleSearch = async () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const results = await response.json();
      
      if (results.length > 0) {
        mapRef.current.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 13);
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  // Use GPS location
  const handleUseGPS = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.flyTo([position.coords.latitude, position.coords.longitude], 13);
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsLocating(false);
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between h-full px-4 max-w-4xl mx-auto gap-4">
          <h1 className="font-display font-semibold text-lg shrink-0">Discover Food Trucks</h1>
          <Badge variant="secondary" className="shrink-0">
            {profilesWithLocation.length} trucks nearby
          </Badge>
        </div>
      </header>

      <div className="p-4 max-w-4xl mx-auto w-full">
        <Card className="p-3 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by zip code or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
                data-testid="input-location-search"
              />
            </div>
            <Button onClick={handleSearch} data-testid="button-search">
              Search
            </Button>
            <Button
              variant="outline"
              onClick={handleUseGPS}
              disabled={isLocating}
              data-testid="button-use-gps"
            >
              {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            </Button>
          </div>
        </Card>
      </div>

      <main className="flex-1 px-4 pb-20 max-w-4xl mx-auto w-full relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card className="overflow-hidden relative">
            <div
              ref={mapContainerRef}
              className="h-[500px] md:h-[600px] w-full"
              data-testid="map-container"
            />
            
            {selectedProfile && (
              <TruckPanel
                profile={selectedProfile}
                onClose={() => setSelectedProfile(null)}
              />
            )}
          </Card>
        )}

        {!isLoading && profilesWithLocation.length === 0 && (
          <Card className="mt-4 p-8 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No Food Trucks Yet</h3>
            <p className="text-muted-foreground">
              Be the first to add your food truck to the map! Sign in and enable your public profile.
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}
