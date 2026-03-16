import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Search, MapPin, Star, Globe, Loader2, List, Map as MapIcon,
  CheckCircle2, Instagram, BadgeCheck, X, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { MobileNav } from "@/components/mobile-nav";
import type { PublicProfile, Review } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const CT_COUNTIES = [
  "All",
  "Fairfield",
  "Hartford",
  "Litchfield",
  "Middlesex",
  "New Haven",
  "New London",
  "Tolland",
  "Windham",
];

// Brand colors from BRAND_BIBLE
const COLOR_VERIFIED   = "#00C896"; // Clearance Green
const COLOR_UNVERIFIED = "#1B4FD8"; // Authority Blue

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => { document.title = "PermitPilot — Your permit copilot."; };
  }, [title]);
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({
  rating,
  onRate,
  interactive = false,
}: {
  rating: number;
  onRate?: (r: number) => void;
  interactive?: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          className={interactive ? "cursor-pointer" : "cursor-default"}
          data-testid={`star-${star}`}
        >
          <Star
            className={`w-4 h-4 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Review Form ──────────────────────────────────────────────────────────────

function ReviewForm({
  publicProfileId,
  onSuccess,
}: {
  publicProfileId: string;
  onSuccess: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState("");

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reviews", {
        publicProfileId,
        rating,
        text: text.trim() || null,
        reviewerName: name.trim() || null,
      }),
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
        {submitMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          "Submit"
        )}
      </Button>
    </div>
  );
}

// ─── Cuisine Badge ─────────────────────────────────────────────────────────────

function CuisineBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  return (
    <Badge variant="secondary" className="text-xs font-medium">
      {type}
    </Badge>
  );
}

// ─── Verified Badge ────────────────────────────────────────────────────────────

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
      <BadgeCheck className="w-3 h-3" />
      Verified on PermitPilot
    </span>
  );
}

// ─── Claim Button ──────────────────────────────────────────────────────────────

function ClaimButton({ profileId }: { profileId: string }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const claimMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/public-profiles/${profileId}/claim`, {
        method: "POST",
        credentials: "include",
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Claim failed");
        return data;
      }),
    onSuccess: (data) => {
      toast({ title: "Request submitted", description: data.message });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't submit claim",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-3"
        onClick={() => { window.location.href = "/auth"; }}
      >
        <ChevronRight className="w-4 h-4 mr-1" />
        Sign in to claim this listing
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full mt-3 border-primary/30 text-primary hover:bg-primary/5"
      disabled={claimMutation.isPending || claimMutation.isSuccess}
      onClick={() => claimMutation.mutate()}
    >
      {claimMutation.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
      ) : claimMutation.isSuccess ? (
        <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" />
      ) : null}
      {claimMutation.isSuccess
        ? "Claim request sent!"
        : "Claim this listing"}
    </Button>
  );
}

// ─── Truck Detail Panel ────────────────────────────────────────────────────────

function TruckPanel({
  profile,
  onClose,
}: {
  profile: PublicProfile;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews", profile.id],
    queryFn: () => fetch(`/api/reviews/${profile.id}`).then((r) => r.json()),
  });

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const instagram = (profile as any).instagramHandle as string | null;

  return (
    <Card className="absolute bottom-4 left-4 right-4 max-w-md mx-auto z-[1000] p-4 max-h-[65vh] overflow-y-auto shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-display font-bold text-lg leading-tight">
            {profile.businessName || "Food Truck"}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {(profile as any).isVerified && <VerifiedBadge />}
            <CuisineBadge type={(profile as any).cuisineType} />
            {(profile as any).county && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />
                {(profile as any).county} County
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-8 w-8"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-2 mb-3">
        <StarRating rating={Math.round(avgRating)} />
        <span className="text-xs text-muted-foreground">
          {reviews.length === 0
            ? "No reviews yet"
            : `${avgRating.toFixed(1)} (${reviews.length})`}
        </span>
      </div>

      {/* Description */}
      {profile.description && (
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
          {profile.description}
        </p>
      )}

      {/* Location */}
      {profile.locationAddress && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span>{profile.locationAddress}</span>
        </div>
      )}

      {/* Website */}
      {profile.website && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <a
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline truncate"
          >
            {profile.website.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        </div>
      )}

      {/* Instagram */}
      {instagram && (
        <div className="flex items-center gap-2 text-sm mb-3">
          <Instagram className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <a
            href={`https://instagram.com/${instagram.replace(/^@/, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            @{instagram.replace(/^@/, "")}
          </a>
        </div>
      )}

      {/* Recent Reviews */}
      {reviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-sm font-medium mb-2">Recent Reviews</p>
          <div className="space-y-2 max-h-28 overflow-y-auto">
            {reviews.slice(0, 3).map((review) => (
              <div key={review.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} />
                  {review.reviewerName && (
                    <span className="text-muted-foreground">
                      — {review.reviewerName}
                    </span>
                  )}
                </div>
                {review.text && (
                  <p className="mt-1 text-muted-foreground">{review.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Form */}
      <ReviewForm
        publicProfileId={profile.id}
        onSuccess={() =>
          queryClient.invalidateQueries({
            queryKey: ["/api/reviews", profile.id],
          })
        }
      />

      {/* Claim listing — only for unverified directory listings */}
      {!(profile as any).isVerified && (profile as any).source !== "user" && (
        <ClaimButton profileId={profile.id} />
      )}
    </Card>
  );
}

// ─── Truck Card (List View) ────────────────────────────────────────────────────

function TruckCard({
  profile,
  onClick,
}: {
  profile: PublicProfile;
  onClick: () => void;
}) {
  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-shadow border border-border"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <h3 className="font-display font-semibold text-base">
              {profile.businessName || "Food Truck"}
            </h3>
            {(profile as any).isVerified && (
              <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <CuisineBadge type={(profile as any).cuisineType} />
            {(profile as any).county && (
              <span className="text-xs text-muted-foreground">
                {(profile as any).county} County
              </span>
            )}
          </div>
          {profile.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {profile.description}
            </p>
          )}
          {profile.locationAddress && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {profile.locationAddress}
            </p>
          )}
        </div>
        {profile.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          >
            <Globe className="w-4 h-4" />
          </a>
        )}
      </div>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Discover() {
  usePageTitle(
    "Find Food Trucks in Connecticut | PermitPilot"
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounty, setSelectedCounty] = useState("All");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  const { data: publicProfiles = [], isLoading } = useQuery<PublicProfile[]>({
    queryKey: ["/api/public-profiles"],
  });

  // Filter: public + has location
  const profilesWithLocation = publicProfiles.filter(
    (p) => p.locationLat && p.locationLng && p.isPublic
  );

  // Apply county + search filter
  const filtered = profilesWithLocation.filter((p) => {
    const matchCounty =
      selectedCounty === "All" || (p as any).county === selectedCounty;
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      (p.businessName || "").toLowerCase().includes(q) ||
      ((p as any).cuisineType || "").toLowerCase().includes(q) ||
      (p.locationAddress || "").toLowerCase().includes(q);
    return matchCounty && matchSearch;
  });

  // ─── Map initialization ──────────────────────────────────────────────────

  useEffect(() => {
    if (viewMode !== "map") return;

    // Small delay to let the DOM render
    const timer = setTimeout(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      mapRef.current = L.map(mapContainerRef.current).setView(
        [41.6032, -73.0877],
        9
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [viewMode]);

  // ─── Markers ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || viewMode !== "map") return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    filtered.forEach((profile) => {
      if (!mapRef.current || !profile.locationLat || !profile.locationLng)
        return;

      const isVerified = (profile as any).isVerified as boolean;
      const color = isVerified ? COLOR_VERIFIED : COLOR_UNVERIFIED;

      const marker = L.circleMarker(
        [parseFloat(profile.locationLat), parseFloat(profile.locationLng)],
        {
          radius: 9,
          fillColor: color,
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        }
      ).addTo(mapRef.current);

      marker.bindTooltip(profile.businessName || "Food Truck", {
        permanent: false,
        direction: "top",
        className: "font-medium text-xs",
      });

      marker.on("click", () => {
        setSelectedProfile(profile);
      });

      markersRef.current.push(marker);
    });
  }, [filtered, viewMode]);

  // ─── Search / GPS ───────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    if (viewMode === "map" && mapRef.current) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchQuery + " Connecticut"
          )}&limit=1`
        );
        const results = await res.json();
        if (results.length > 0) {
          mapRef.current.flyTo(
            [parseFloat(results[0].lat), parseFloat(results[0].lon)],
            13
          );
        }
      } catch (err) {
        console.error("Geocoding error:", err);
      }
    }
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo(
          [pos.coords.latitude, pos.coords.longitude],
          13
        );
        setIsLocating(false);
      },
      () => setIsLocating(false)
    );
  };

  // ─── County filter flyTo ─────────────────────────────────────────────────

  const handleCountySelect = (county: string) => {
    setSelectedCounty(county);
    setSelectedProfile(null);
    if (viewMode === "map" && mapRef.current && county !== "All") {
      // Fly to approximate county centers
      const countyCenters: Record<string, [number, number]> = {
        Fairfield:  [41.2000, -73.2000],
        Hartford:   [41.7800, -72.6900],
        Litchfield: [41.7400, -73.2400],
        Middlesex:  [41.5200, -72.6500],
        "New Haven":[41.3400, -72.9400],
        "New London":[41.4500, -72.0900],
        Tolland:    [41.8700, -72.3700],
        Windham:    [41.7600, -71.9900],
      };
      if (countyCenters[county]) {
        mapRef.current.flyTo(countyCenters[county], 11, { duration: 1 });
      }
    }
    if (county === "All" && viewMode === "map" && mapRef.current) {
      mapRef.current.flyTo([41.6032, -73.0877], 9, { duration: 1 });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const sortedFiltered = [...filtered].sort((a, b) =>
    (a.businessName || "").localeCompare(b.businessName || "")
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* SEO meta — supplemental to document.title set above */}
      <header className="sticky top-0 z-50 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between h-full px-4 max-w-4xl mx-auto gap-3">
          <h1 className="font-display font-bold text-base md:text-lg shrink-0">
            CT Food Trucks
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs shrink-0">
              {filtered.length} {filtered.length === 1 ? "truck" : "trucks"}
            </Badge>
            {/* Map / List toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "map"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => { setViewMode("map"); setSelectedProfile(null); }}
                data-testid="button-map-view"
              >
                <MapIcon className="w-3.5 h-3.5" />
                Map
              </button>
              <button
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => setViewMode("list")}
                data-testid="button-list-view"
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Search bar */}
      <div className="px-4 pt-3 pb-0 max-w-4xl mx-auto w-full">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, cuisine, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 h-9 text-sm"
              data-testid="input-location-search"
            />
          </div>
          <Button size="sm" onClick={handleSearch} data-testid="button-search">
            Search
          </Button>
          {viewMode === "map" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUseGPS}
              disabled={isLocating}
              data-testid="button-use-gps"
              title="Use my location"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* County filter bar */}
      <div className="px-4 pt-2 pb-1 max-w-4xl mx-auto w-full">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {CT_COUNTIES.map((county) => (
            <button
              key={county}
              onClick={() => handleCountySelect(county)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                selectedCounty === county
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
              data-testid={`filter-county-${county.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {county}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      {viewMode === "map" && (
        <div className="px-4 pb-1 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full border-2 border-white"
                style={{ background: COLOR_VERIFIED }}
              />
              Verified on PermitPilot
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full border-2 border-white"
                style={{ background: COLOR_UNVERIFIED }}
              />
              Directory listing
            </span>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-4 pb-24 max-w-4xl mx-auto w-full relative mt-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : viewMode === "map" ? (
          /* ── Map view ── */
          <Card className="relative overflow-hidden">
            <div
              ref={mapContainerRef}
              className="h-[420px] md:h-[520px] w-full"
              style={{ zIndex: 0 }}
              data-testid="map-container"
            />
            {selectedProfile && (
              <TruckPanel
                profile={selectedProfile}
                onClose={() => setSelectedProfile(null)}
              />
            )}
          </Card>
        ) : (
          /* ── List view ── */
          <div className="space-y-2">
            {sortedFiltered.length === 0 ? (
              <Card className="p-8 text-center">
                <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No trucks found</h3>
                <p className="text-sm text-muted-foreground">
                  Try a different county or clear the search.
                </p>
              </Card>
            ) : (
              sortedFiltered.map((profile) => (
                <TruckCard
                  key={profile.id}
                  profile={profile}
                  onClick={() => {
                    setSelectedProfile(profile);
                    setViewMode("map");
                    // After switching to map, the marker click would normally open the panel.
                    // We open it here directly via selectedProfile state.
                  }}
                />
              ))
            )}
          </div>
        )}

        {/* Selected profile panel for list->map transition */}
        {viewMode === "map" && selectedProfile && false /* already rendered above */ && null}

        {!isLoading && profilesWithLocation.length === 0 && (
          <Card className="mt-4 p-8 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display font-semibold text-lg mb-2">
              No Food Trucks Yet
            </h3>
            <p className="text-muted-foreground text-sm">
              Be the first to add your food truck to the CT directory.
            </p>
          </Card>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
