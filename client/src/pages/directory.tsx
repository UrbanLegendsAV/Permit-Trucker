import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Search, ExternalLink, Instagram, CheckCircle2, AlertCircle,
  Map as MapIcon, LayoutGrid,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { TopHeader } from "@/components/top-header";
import { apiRequest } from "@/lib/queryClient";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicProfile } from "@shared/schema";

interface MapPin {
  id: string;
  name: string;
  lat: string;
  lng: string;
  locationType: "live" | "home_base";
  cuisine: string | null;
  website: string | null;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  slug: string | null;
  description: string | null;
  isVerified: boolean;
}

// ── Types ────────────────────────────────────────────────────────────────────

type FoodTruck = {
  id: number;
  slug: string;
  name: string;
  cuisine: string | null;
  towns: string[] | null;
  website: string | null;
  instagramHandle: string | null;
  description: string | null;
  status: string | null;
  imageUrl: string | null;
  offersPrivateCatering?: boolean | null;
  verificationScore?: number | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const CUISINE_OPTIONS = [
  "All Cuisines",
  "Brazilian BBQ",
  "Mexican",
  "Wings / American",
  "Wings / BBQ",
  "Ice Cream / Desserts",
  "American / Comfort Food",
  "Latin Fusion",
  "Pizza",
  "BBQ",
  "Fusion",
  "Farm-to-Table",
];

const COLOR_VERIFIED   = "#00C896";
const COLOR_UNVERIFIED = "#1B4FD8";

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DirectoryPage() {
  const [search, setSearch] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("All Cuisines");
  const [townFilter, setTownFilter] = useState("");
  const [view, setView] = useState<"grid" | "map">("grid");
  const [location, setLocation] = useLocation();

  // parse ?view=map from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "map") setView("map");
  }, [location]);

  useEffect(() => {
    document.title = "CT Food Truck Directory | PermitPilot";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = "Connecticut food truck directory — every CT food truck, their cuisine, and permit status. Find and list your truck free on PermitPilot.";
  }, []);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trucks = [], isLoading } = useQuery<FoodTruck[]>({
    queryKey: ["/api/directory"],
    queryFn: () => fetch("/api/directory").then((r) => r.json()),
  });

  const filtered = trucks.filter((t) => {
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.cuisine?.toLowerCase().includes(search.toLowerCase()) ||
      t.towns?.some((tw) => tw.toLowerCase().includes(search.toLowerCase()));
    const matchCuisine =
      cuisineFilter === "All Cuisines" || t.cuisine === cuisineFilter;
    const matchTown =
      !townFilter ||
      t.towns?.some((tw) => tw.toLowerCase().includes(townFilter.toLowerCase()));
    return matchSearch && matchCuisine && matchTown;
  });

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white">
      <TopHeader />

      {/* Hero */}
      <div className="px-6 pt-12 pb-10 text-center max-w-3xl mx-auto">
        <h1 className="font-display text-4xl font-bold mb-3">
          Connecticut's Food Truck Hub
        </h1>
        <p className="text-[#8897B2] text-lg mb-8">
          Every CT food truck. Permits handled.
        </p>
        <Link href="/auth">
          <Button size="lg" className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white font-semibold px-8">
            List Your Truck Free
          </Button>
        </Link>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-14 z-10 bg-[#0A0F1E]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
            <Input
              placeholder="Search trucks, cuisines, or towns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2] focus-visible:ring-[#1B4FD8]"
            />
          </div>
          <Select value={cuisineFilter} onValueChange={setCuisineFilter}>
            <SelectTrigger className="w-full sm:w-44 bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUISINE_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Town..."
            value={townFilter}
            onChange={(e) => setTownFilter(e.target.value)}
            className="w-full sm:w-36 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2] focus-visible:ring-[#1B4FD8]"
          />
          {/* View toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
            <button
              onClick={() => setView("grid")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === "grid" ? "bg-[#1B4FD8] text-white" : "text-[#8897B2] hover:text-white"}`}
            >
              <LayoutGrid className="h-4 w-4" /> Grid
            </button>
            <button
              onClick={() => setView("map")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === "map" ? "bg-[#1B4FD8] text-white" : "text-[#8897B2] hover:text-white"}`}
            >
              <MapIcon className="h-4 w-4" /> Map
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 animate-pulse space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="h-5 bg-white/10 rounded w-3/4" />
                  <div className="h-5 bg-white/10 rounded w-16" />
                </div>
                <div className="h-3 bg-white/10 rounded w-1/4" />
                <div className="space-y-2">
                  <div className="h-3 bg-white/10 rounded w-full" />
                  <div className="h-3 bg-white/10 rounded w-2/3" />
                </div>
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <div className="h-4 bg-white/10 rounded w-16" />
                  <div className="h-4 bg-white/10 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : view === "grid" ? (
          filtered.length === 0 ? (
            <p className="text-center text-[#8897B2] py-20">No trucks match your search.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((truck) => (
                <TruckCard
                  key={truck.id}
                  truck={truck}
                  onClaim={() => setLocation(`/claim/${truck.slug}`)}
                  isClaiming={false}
                />
              ))}
            </div>
          )
        ) : (
          <DirectoryMap />
        )}
      </div>
    </div>
  );
}

// ── TruckCard ────────────────────────────────────────────────────────────────

function TruckCard({ truck, onClaim, isClaiming }: {
  truck: FoodTruck;
  onClaim: () => void;
  isClaiming: boolean;
}) {
  const [, setLocation] = useLocation();
  const isVerified = truck.status === "verified";
  const isPending = truck.status === "pending" || truck.status === "needs_review";
  const isClaimable = truck.status === "unclaimed" || truck.status === "rejected";

  return (
    <div
      className={`rounded-xl p-5 flex flex-col gap-3 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] active:transition-none transition-all duration-200 ${
        isVerified
          ? "bg-gradient-to-b from-[#0f1f26] to-[#0A0F1E] border border-[#00C896]/30 shadow-[0_0_0_1px_rgba(0,200,150,0.08)]"
          : "bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-[#1B4FD8]/40"
      }`}
      onClick={() => setLocation(`/directory/${truck.slug}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setLocation(`/directory/${truck.slug}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="font-display font-semibold text-white hover:text-[#1B4FD8] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {truck.name}
        </h3>
        {isVerified ? (
          <Badge className="bg-[#00C896]/15 text-[#00C896] border-[#00C896]/30 shrink-0 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> Verified
          </Badge>
        ) : isPending ? (
          <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 shrink-0 text-xs gap-1">
            <AlertCircle className="h-3 w-3" /> Pending review
          </Badge>
        ) : (
          <Badge className="bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/30 shrink-0 text-xs gap-1">
            <AlertCircle className="h-3 w-3" /> Unclaimed
          </Badge>
        )}
      </div>

      {truck.cuisine && <span className="text-xs text-[#8897B2] font-medium">{truck.cuisine}</span>}

      {isVerified && (
        <p className="text-xs text-[#9EE7D1] font-medium">PermitPilot Verified • trusted owner and business evidence confirmed</p>
      )}

      {truck.description && (
        <p className="text-sm text-[#8897B2] line-clamp-2">{truck.description}</p>
      )}

      {truck.towns && truck.towns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {truck.towns.map((town) => (
            <span key={town} className="text-xs bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[#8897B2]">
              {town}
            </span>
          ))}
        </div>
      )}

      {truck.offersPrivateCatering && (
        <span className="text-xs text-[#00C896] font-medium">🍽 Available for private events</span>
      )}

      <div className="mt-auto pt-2 flex items-center gap-3 border-t border-white/10">
        {truck.website && (
          <a href={truck.website} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-[#1B4FD8] hover:underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" /> Website
          </a>
        )}
        {truck.instagramHandle && (
          <a href={`https://instagram.com/${truck.instagramHandle.replace("@", "")}`}
            target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-[#8897B2] hover:text-white flex items-center gap-1">
            <Instagram className="h-3 w-3" /> {truck.instagramHandle}
          </a>
        )}
        {isClaimable && (
          <button
            onClick={(e) => { e.stopPropagation(); onClaim(); }}
            disabled={isClaiming}
            className="ml-auto text-xs text-[#F5A623] hover:underline disabled:opacity-50"
          >
            {isClaiming ? "Claiming..." : "Claim listing"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── DirectoryMap (embedded Leaflet from /api/map-pins) ───────────────────────

function DirectoryMap() {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Layer[]>([]);

  const { data: pins = [] } = useQuery<MapPin[]>({
    queryKey: ["/api/map-pins"],
    queryFn: () => fetch("/api/map-pins").then((r) => r.json()),
  });

  const withLocation = pins.filter((p) => p.lat && p.lng);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      mapRef.current = L.map(containerRef.current).setView([41.6032, -73.0877], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }, 50);
    return () => {
      clearTimeout(timer);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => (m as any).remove());
    markersRef.current = [];
    withLocation.forEach((pin) => {
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
      if (pin.slug) {
        (marker as any).on("click", () => { window.location.href = `/directory/${pin.slug}`; });
      }
      markersRef.current.push(marker);
    });
  }, [withLocation]);

  return (
    <Card className="overflow-hidden border border-white/10">
      <div ref={containerRef} className="h-[520px] w-full" style={{ zIndex: 0 }} />
      <div className="flex items-center gap-4 text-xs text-[#8897B2] p-3 border-t border-white/10">
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
    </Card>
  );
}
