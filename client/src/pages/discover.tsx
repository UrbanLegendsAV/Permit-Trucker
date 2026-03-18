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
import type { Review } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapPin {
  id: string;
  name: string;
  lat: string;
  lng: string;
  locationType: "live" | "home_base";
  cuisine: string | null;
  website: string | null;
  phone: string | null;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  slug: string | null;
  description: string | null;
  isVerified: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CT_COUNTIES = [
  "All", "Fairfield", "Hartford", "Litchfield", "Middlesex",
  "New Haven", "New London", "Tolland", "Windham",
];

const COLOR_VERIFIED   = "#00C896";
const COLOR_UNVERIFIED = "#1B4FD8";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
    return () => { document.title = "PermitPilot — Your permit copilot."; };
  }, [title]);
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ rating, onRate, interactive = false }: { rating: number; onRate?: (r: number) => void; interactive?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" disabled={!interactive} onClick={() => onRate?.(star)}
          className={interactive ? "cursor-pointer" : "cursor-default"} data-testid={`star-${star}`}>
          <Star className={`w-4 h-4 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Review Form ──────────────────────────────────────────────────────────────

function ReviewForm({ publicProfileId, onSuccess }: { publicProfileId: string; onSuccess: () => void }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reviews", { publicProfileId, rating, text: text.trim() || null, reviewerName: name.trim() || null }),
    onSuccess: () => { setRating(0); setText(""); setName(""); onSuccess(); },
  });
  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-border">
      <p className="text-sm font-medium">Leave a review</p>
      <StarRating rating={rating} onRate={setRating} interactive />
      <Input placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
      <Textarea placeholder="Share your experience (optional)" value={text} onChange={(e) => setText(e.target.value)} className="text-sm resize-none" rows={2} />
      <Button size="sm" disabled={rating === 0 || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
        {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
      </Button>
    </div>
  );
}

// ─── Truck Detail Panel ────────────────────────────────────────────────────────

function TruckPanel({ pin, onClose }: { pin: MapPin; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isLivePin = pin.locationType === "live";

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews", pin.id],
    queryFn: () => fetch(`/api/reviews/${pin.id}`).then((r) => r.json()),
    enabled: isLivePin,
  });

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <Card className="absolute bottom-4 left-4 right-4 max-w-md mx-auto z-[1000] p-4 max-h-[65vh] overflow-y-auto shadow-xl">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-display font-bold text-lg leading-tight">{pin.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {pin.isVerified && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <BadgeCheck className="w-3 h-3" /> Verified
              </span>
            )}
            {pin.cuisine && <Badge variant="secondary" className="text-xs">{pin.cuisine}</Badge>}
            {pin.locationType === "home_base" && (
              <Badge variant="outline" className="text-xs text-muted-foreground">Home base</Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {isLivePin && (
        <div className="flex items-center gap-2 mb-3">
          <StarRating rating={Math.round(avgRating)} />
          <span className="text-xs text-muted-foreground">
            {reviews.length === 0 ? "No reviews yet" : `${avgRating.toFixed(1)} (${reviews.length})`}
          </span>
        </div>
      )}

      {pin.description && (
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{pin.description}</p>
      )}

      {pin.website && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <a href={pin.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
            {pin.website.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        </div>
      )}

      {pin.instagramHandle && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <Instagram className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <a href={`https://instagram.com/${pin.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            @{pin.instagramHandle.replace(/^@/, "")}
          </a>
        </div>
      )}

      {/* Home base note */}
      {pin.locationType === "home_base" && (
        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground space-y-1">
          <p>📍 Home base — follow on social for live location updates.</p>
          {pin.instagramHandle && (
            <a href={`https://instagram.com/${pin.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline block">
              instagram.com/{pin.instagramHandle.replace(/^@/, "")}
            </a>
          )}
          {pin.tiktokHandle && (
            <a href={`https://tiktok.com/@${pin.tiktokHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline block">
              tiktok.com/@{pin.tiktokHandle.replace(/^@/, "")}
            </a>
          )}
          {pin.slug && (
            <a href={`/directory/${pin.slug}`} className="text-primary hover:underline block">
              View full listing →
            </a>
          )}
        </div>
      )}

      {isLivePin && (
        <>
          {reviews.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-sm font-medium mb-2">Recent Reviews</p>
              <div className="space-y-2 max-h-28 overflow-y-auto">
                {reviews.slice(0, 3).map((review) => (
                  <div key={review.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <StarRating rating={review.rating} />
                      {review.reviewerName && <span className="text-muted-foreground">— {review.reviewerName}</span>}
                    </div>
                    {review.text && <p className="mt-1 text-muted-foreground">{review.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <ReviewForm publicProfileId={pin.id} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/reviews", pin.id] })} />
        </>
      )}
    </Card>
  );
}

// ─── Truck Card (List View) ────────────────────────────────────────────────────

function TruckCard({ pin, onClick }: { pin: MapPin; onClick: () => void }) {
  return (
    <Card className="p-4 cursor-pointer hover:shadow-md transition-shadow border border-border" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <h3 className="font-display font-semibold text-base">{pin.name}</h3>
            {pin.isVerified && <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {pin.cuisine && <Badge variant="secondary" className="text-xs">{pin.cuisine}</Badge>}
          </div>
          {pin.description && <p className="text-sm text-muted-foreground line-clamp-2">{pin.description}</p>}
        </div>
        {pin.website && (
          <a href={pin.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors">
            <Globe className="w-4 h-4" />
          </a>
        )}
      </div>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Discover() {
  // Redirect to the unified directory map view
  useEffect(() => { window.location.replace("/directory?view=map"); }, []);
  usePageTitle("Find Food Trucks in Connecticut | PermitPilot");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounty, setSelectedCounty] = useState("All");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Layer[]>([]);

  const { data: pins = [], isLoading } = useQuery<MapPin[]>({
    queryKey: ["/api/map-pins"],
    queryFn: () => fetch("/api/map-pins").then((r) => r.json()),
  });

  const pinsWithLocation = pins.filter((p) => p.lat && p.lng);

  const filtered = pinsWithLocation.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.cuisine || "").toLowerCase().includes(q);
    return matchSearch;
  });

  // ─── Map initialization ──────────────────────────────────────────────────

  useEffect(() => {
    if (viewMode !== "map") return;
    const timer = setTimeout(() => {
      if (!mapContainerRef.current || mapRef.current) return;
      mapRef.current = L.map(mapContainerRef.current).setView([41.6032, -73.0877], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }, 50);
    return () => {
      clearTimeout(timer);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [viewMode]);

  // ─── Markers ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || viewMode !== "map") return;
    markersRef.current.forEach((m) => (m as any).remove());
    markersRef.current = [];

    filtered.forEach((pin) => {
      if (!mapRef.current) return;
      const latLng: [number, number] = [parseFloat(pin.lat), parseFloat(pin.lng)];

      let marker: L.Layer;
      if (pin.locationType === "home_base") {
        const icon = L.divIcon({
          html: '<div style="background:#6b7280;width:24px;height:24px;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:24px;text-align:center;">🏠</div>',
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        marker = L.marker(latLng, { icon }).addTo(mapRef.current);
      } else {
        const color = pin.isVerified ? COLOR_VERIFIED : COLOR_UNVERIFIED;
        marker = L.circleMarker(latLng, { radius: 9, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.9 }).addTo(mapRef.current);
      }

      (marker as any).bindTooltip(pin.name, { permanent: false, direction: "top", className: "font-medium text-xs" });
      (marker as any).on("click", () => setSelectedPin(pin));
      markersRef.current.push(marker);
    });
  }, [filtered, viewMode]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || viewMode !== "map" || !mapRef.current) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + " Connecticut")}&limit=1`);
      const results = await res.json();
      if (results.length > 0) mapRef.current.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 13);
    } catch {}
  };

  const handleUseGPS = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { mapRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 13); setIsLocating(false); },
      () => setIsLocating(false)
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 h-14 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between h-full px-4 max-w-4xl mx-auto gap-3">
          <h1 className="font-display font-bold text-base md:text-lg shrink-0">CT Food Trucks</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs shrink-0">
              {filtered.length} {filtered.length === 1 ? "truck" : "trucks"}
            </Badge>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => { setViewMode("map"); setSelectedPin(null); }} data-testid="button-map-view">
                <MapIcon className="w-3.5 h-3.5" /> Map
              </button>
              <button className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setViewMode("list")} data-testid="button-list-view">
                <List className="w-3.5 h-3.5" /> List
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 pt-3 pb-0 max-w-4xl mx-auto w-full">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name or cuisine..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="pl-9 h-9 text-sm" data-testid="input-location-search" />
          </div>
          <Button size="sm" onClick={handleSearch} data-testid="button-search">Search</Button>
          {viewMode === "map" && (
            <Button variant="outline" size="sm" onClick={handleUseGPS} disabled={isLocating} data-testid="button-use-gps" title="Use my location">
              {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {viewMode === "map" && (
        <div className="px-4 pb-1 max-w-4xl mx-auto w-full mt-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white" style={{ background: COLOR_VERIFIED }} />
              Verified on PermitPilot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white" style={{ background: COLOR_UNVERIFIED }} />
              Directory listing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white bg-gray-500" />
              🏠 Home base
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pb-24 max-w-4xl mx-auto w-full relative mt-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : viewMode === "map" ? (
          <Card className="relative overflow-hidden">
            <div ref={mapContainerRef} className="h-[420px] md:h-[520px] w-full" style={{ zIndex: 0 }} data-testid="map-container" />
            {selectedPin && <TruckPanel pin={selectedPin} onClose={() => setSelectedPin(null)} />}
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <Card className="p-8 text-center">
                <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">No trucks found</h3>
                <p className="text-sm text-muted-foreground">Try clearing the search.</p>
              </Card>
            ) : (
              filtered.map((pin) => (
                <TruckCard key={pin.id} pin={pin} onClick={() => { setSelectedPin(pin); setViewMode("map"); }} />
              ))
            )}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
