import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });
import {
  ArrowLeft, ExternalLink, Instagram, CheckCircle2, MapPin, Tag,
  Phone, Mail, Globe, Share2, Utensils, Users, UtensilsCrossed, Star, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TopHeader } from "@/components/top-header";

// ── Type ──────────────────────────────────────────────────────────────────────

type MenuItem = { name: string; description: string; imageUrl: string };

type FoodTruck = {
  id: number;
  slug: string;
  name: string;
  cuisine: string | null;
  towns: string[] | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  facebookHandle: string | null;
  description: string | null;
  status: string | null;
  imageUrl: string | null;
  homeLat: string | null;
  homeLng: string | null;
  menuItems: MenuItem[] | null;
  offersPrivateCatering: boolean | null;
  cateringMinGuests: number | null;
  cateringMaxGuests: number | null;
  cateringPricePerPerson: string | null;
  cateringDescription: string | null;
  cateringEventTypes: string[] | null;
  cateringContactEmail: string | null;
  cateringContactPhone: string | null;
  cateringWebsite: string | null;
  claimedByUserId: string | null;
  verificationScore?: number | null;
  publicProfileId?: string | null;
};

type Review = {
  id: string;
  rating: number;
  text: string | null;
  reviewerName: string | null;
  createdAt: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function heroBgForCuisine(cuisine: string | null): string {
  if (!cuisine) return "#0A0F1E";
  const c = cuisine.toLowerCase();
  if (c.includes("latin") || c.includes("puerto rican") || c.includes("mexican") || c.includes("taco")) return "#7f1d1d"; // red-900
  if (c.includes("bbq") || c.includes("churrasco") || c.includes("grill") || c.includes("brazilian")) return "#7c2d12"; // orange-900
  if (c.includes("wing")) return "#92400e"; // amber-800
  if (c.includes("pizza")) return "#7f1d1d"; // red-900
  if (c.includes("ice cream") || c.includes("dessert")) return "#0a0a1a";
  return "#0A0F1E";
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  weddings:        "bg-pink-500/20 text-pink-300 border-pink-500/30",
  birthdays:       "bg-purple-500/20 text-purple-300 border-purple-500/30",
  corporate:       "bg-blue-500/20 text-blue-300 border-blue-500/30",
  festivals:       "bg-orange-500/20 text-orange-300 border-orange-500/30",
  graduations:     "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "block parties": "bg-green-500/20 text-green-300 border-green-500/30",
};

// ── Mini Map Component ────────────────────────────────────────────────────────

function MiniMap({ lat, lng, name }: { lat: string; lng: string; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: false, dragging: false }).setView([parseFloat(lat), parseFloat(lng)], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    }).addTo(map);
    L.marker([parseFloat(lat), parseFloat(lng)]).addTo(map).bindPopup(name);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [lat, lng, name]);

  return (
    <div>
      <div ref={containerRef} className="h-[180px] w-full rounded-lg overflow-hidden" style={{ zIndex: 0 }} />
      <p className="text-xs text-[#8897B2] mt-1">📍 Home base · Follow on social for live schedule</p>
    </div>
  );
}

// ── Menu Item Card ─────────────────────────────────────────────────────────────

function MenuItemCard({ item }: { item: { name: string; description: string; imageUrl: string } }) {
  return (
    <div className="group overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-3 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08]">
      {item.imageUrl && (
        <div className="overflow-hidden rounded-[18px]">
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        </div>
      )}
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="font-display text-base font-semibold text-white">{item.name}</p>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8897B2]">
          Menu
        </span>
      </div>
      {item.description && (
        <p className="mt-2 text-sm leading-relaxed text-[#A8B4CB]">{item.description}</p>
      )}
    </div>
  );
}

// ── Badge Pip (sidebar mini badge) ────────────────────────────────────────────

const BADGE_META: Record<string, { label: string; color: string }> = {
  pioneer:           { label: "Town Pioneer",       color: "#F5A623" },
  explorer:          { label: "Explorer",            color: "#94A3B8" },
  first_permit:      { label: "First Steps",         color: "#CD7F32" },
  multi_town:        { label: "Multi-Town",          color: "#1B4FD8" },
  health_inspection: { label: "Clean Bill",          color: "#00C896" },
  verified_operator: { label: "Verified Operator",   color: "#1B4FD8" },
};

function BadgePip({ type }: { type: string }) {
  const meta = BADGE_META[type] ?? { label: type, color: "#8897B2" };
  return (
    <div
      title={meta.label}
      className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-[10px] font-bold"
      style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}44` }}
    >
      {meta.label.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StarRating({
  rating,
  interactive = false,
  onRate,
  size = "h-4 w-4",
}: {
  rating: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  size?: string;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          className={interactive ? "cursor-pointer transition-transform hover:scale-105" : "cursor-default"}
        >
          <Star className={`${size} ${star <= rating ? "fill-[#F5A623] text-[#F5A623]" : "text-white/20"}`} />
        </button>
      ))}
    </div>
  );
}

function formatReviewDate(value: string | null) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function buildSignatureTraits(truck: FoodTruck, reviews: Review[]): string[] {
  const traits: string[] = [];
  if (truck.cuisine) traits.push(`${truck.cuisine} specialist`);
  if (truck.offersPrivateCatering) traits.push("Private-event ready");
  if ((truck.towns?.length ?? 0) >= 3) traits.push("Multi-town operator");
  if (reviews.length >= 3) traits.push("Customer-tested favorite");
  if (truck.menuItems && truck.menuItems.length >= 4) traits.push("Defined menu lineup");
  return traits.slice(0, 4);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TruckProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reviewName, setReviewName] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);

  const { data: publicBadges = [] } = useQuery<string[]>({
    queryKey: [`/api/directory/${slug}/badges`],
    queryFn: () => fetch(`/api/directory/${slug}/badges`).then(r => r.json()),
    enabled: !!slug,
  });

  const { data: truck, isLoading, error } = useQuery<FoodTruck>({
    queryKey: [`/api/directory/${slug}`],
    queryFn: () => fetch(`/api/directory/${slug}`).then((r) => {
      if (!r.ok) throw new Error("Truck not found");
      return r.json();
    }),
    enabled: !!slug,
  });

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews", truck?.publicProfileId],
    queryFn: () => fetch(`/api/reviews/${truck?.publicProfileId}`).then((r) => {
      if (!r.ok) throw new Error("Failed to load reviews");
      return r.json();
    }),
    enabled: !!truck?.publicProfileId,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      if (!truck?.publicProfileId) throw new Error("This listing is not ready for reviews yet.");
      await apiRequest("POST", "/api/reviews", {
        publicProfileId: truck.publicProfileId,
        rating: reviewRating,
        text: reviewText.trim() || null,
        reviewerName: reviewName.trim() || null,
      });
    },
    onSuccess: async () => {
      setReviewName("");
      setReviewText("");
      setReviewRating(0);
      await queryClient.invalidateQueries({ queryKey: ["/api/reviews", truck?.publicProfileId] });
      toast({
        title: "Review submitted",
        description: "Thanks for sharing your experience with this truck.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not submit review",
        description: error.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // SEO
  useEffect(() => {
    if (truck) {
      document.title = `${truck.name} — CT Food Truck | PermitPilot`;
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
      meta.content = truck.description
        ? `${truck.description.slice(0, 155)}…`
        : `${truck.name} is a Connecticut food truck${truck.cuisine ? ` specializing in ${truck.cuisine}` : ""}. View their listing on PermitPilot.`;
    }
    return () => { document.title = "PermitPilot — Your permit copilot."; };
  }, [truck]);

  // JSON-LD
  useEffect(() => {
    if (!truck) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "truck-jsonld";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FoodEstablishment",
      name: truck.name,
      description: truck.description,
      servesCuisine: truck.cuisine,
      url: truck.website,
      areaServed: truck.towns,
    });
    document.head.appendChild(script);
    return () => { document.getElementById("truck-jsonld")?.remove(); };
  }, [truck]);

  const handleClaim = () => {
    if (isAuthenticated) navigate(`/claim/${slug}`);
    else navigate(`/auth?next=/claim/${slug}`);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-[#8897B2]">Loading...</div>;
  }

  if (error || !truck) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-[#8897B2]">Truck not found.</p>
        <Link href="/directory"><Button variant="outline">Back to Directory</Button></Link>
      </div>
    );
  }

  const isVerified = truck.status === "verified";
  const isClaimed = truck.status !== "unclaimed" && truck.status !== "rejected";
  const isPendingVerification = truck.status === "pending" || truck.status === "needs_review";
  const heroBg = heroBgForCuisine(truck.cuisine);
  const isOwnListing = isAuthenticated && !!(user as any) && truck.claimedByUserId === (user as any).id;
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  const featuredReview = reviews.find((review) => !!review.text) ?? reviews[0] ?? null;
  const signatureTraits = buildSignatureTraits(truck, reviews);
  const primaryTown = truck.towns?.[0] ?? "Connecticut";

  return (
    <div className="app-shell min-h-screen bg-[#0A0F1E] text-white">
      <TopHeader />

      {/* Edit banner — shown to the owner */}
      {isOwnListing && (
        <div className="bg-[#1B4FD8]/10 border-b border-[#1B4FD8]/30 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-[#1B4FD8]">This is your listing. Keep it up to date to get found.</p>
            <Link href={`/directory/${slug}/edit`}>
              <Button size="sm" className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white font-semibold shrink-0">
                Edit Listing
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Unclaimed amber banner */}
      {!isClaimed && (
        <div className="bg-[#F5A623]/10 border-b border-[#F5A623]/30 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-[#F5A623]">Is this your truck? Claim it free and connect to permit filing.</p>
            <Button size="sm" onClick={handleClaim} className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-black font-semibold shrink-0">
              Claim Listing
            </Button>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div
        className="relative w-full min-h-[460px] overflow-hidden md:min-h-[560px]"
        style={truck.imageUrl ? {} : { backgroundColor: heroBg }}
      >
        {truck.imageUrl && (
          <img src={truck.imageUrl} alt={truck.name} className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_24%),linear-gradient(to_top,rgba(3,8,20,0.96),rgba(3,8,20,0.38),transparent)]" />

        {/* Back link */}
        <div className="absolute top-4 left-4 max-w-4xl">
          <Link href="/directory">
            <button className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Directory
            </button>
          </Link>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 md:px-6 md:pb-8">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {isVerified && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#00C896]/35 bg-[#00C896]/12 px-3 py-1 text-xs font-semibold text-[#9EE7D1] backdrop-blur-sm">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    PermitPilot Verified
                  </div>
                )}
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/70 backdrop-blur-sm">
                  Featured in {primaryTown}
                </div>
              </div>
              <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[0.96] text-white md:text-6xl">
                {truck.name}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/74 md:text-lg">
                {truck.description
                  ? truck.description
                  : `${truck.name} is part of Connecticut's growing food truck scene${truck.cuisine ? ` with a focus on ${truck.cuisine}` : ""}.`}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {truck.cuisine && (
                  <Badge className="bg-white/10 backdrop-blur-sm text-white border-white/20 text-xs">
                    <Tag className="mr-1 h-3 w-3" />{truck.cuisine}
                  </Badge>
                )}
                {isVerified ? (
                  <Badge className="bg-[#00C896]/20 text-[#00C896] border-[#00C896]/30 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </Badge>
                ) : isPendingVerification ? (
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">Pending Review</Badge>
                ) : (
                  <Badge className="bg-[#F5A623]/20 text-[#F5A623] border-[#F5A623]/30 text-xs">Unclaimed</Badge>
                )}
                {truck.offersPrivateCatering && (
                  <Badge className="bg-white/10 text-white border-white/20 gap-1 text-xs">
                    <Utensils className="h-3 w-3" /> Available for catering
                  </Badge>
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {truck.website && (
                  <a
                    href={truck.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
                  >
                    <Globe className="h-4 w-4" />
                    Visit website
                  </a>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  <Share2 className="h-4 w-4" />
                  Share this truck
                </button>
              </div>
            </div>

            <div className="premium-panel hero-wash p-5 md:p-6">
              <p className="section-kicker">At a glance</p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#8897B2]">Rating</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-white">
                    {reviews.length ? averageRating.toFixed(1) : "New"}
                  </p>
                  <div className="mt-2"><StarRating rating={Math.round(averageRating)} /></div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#8897B2]">Towns</p>
                  <p className="mt-2 font-display text-3xl font-semibold text-white">{truck.towns?.length ?? 0}</p>
                  <p className="mt-2 text-xs text-[#8897B2]">service areas tracked</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#8897B2]">Mode</p>
                  <p className="mt-2 font-display text-xl font-semibold text-white">
                    {truck.offersPrivateCatering ? "Bookable" : "Street"}
                  </p>
                  <p className="mt-2 text-xs text-[#8897B2]">
                    {truck.offersPrivateCatering ? "private events and catering" : "public-facing listing"}
                  </p>
                </div>
              </div>

              {signatureTraits.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {signatureTraits.map((trait) => (
                    <span key={trait} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#DCE6F7]">
                      {trait}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                {truck.instagramHandle && (
                  <a href={`https://instagram.com/${truck.instagramHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors" title="Instagram">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {truck.tiktokHandle && (
                  <a href={`https://tiktok.com/@${truck.tiktokHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors" title="TikTok">
                    <ExternalLink className="w-5 h-5" />
                  </a>
                )}
                {truck.website && (
                  <a href={truck.website} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition-colors" title="Website">
                    <Globe className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isVerified && (
        <div className="border-b border-[#00C896]/20 bg-gradient-to-r from-[#00C896]/8 via-transparent to-[#00C896]/8">
          <div className="max-w-4xl mx-auto px-4 py-3 text-sm text-[#9EE7D1]">
            Verified listing: ownership and business evidence have been reviewed for this truck.
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">

          {/* LEFT COLUMN */}
          <div className="space-y-8">

            <section className="premium-panel hero-wash p-6 md:p-7">
              <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <p className="section-kicker">Why this truck stands out</p>
                  <h2 className="mt-3 font-display text-2xl font-semibold text-white">A sharper profile for customers, planners, and future regulars.</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#AFC0D9]">
                    PermitPilot is turning food truck pages into richer public profiles, not just business records. This listing is designed to help people discover what this truck serves, where it operates, and whether it feels worth following, booking, or trying next.
                  </p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-[#8897B2]">Editorial note</p>
                  {featuredReview?.text ? (
                    <>
                      <p className="mt-3 text-lg leading-relaxed text-white">“{featuredReview.text}”</p>
                      <p className="mt-4 text-sm text-[#8897B2]">
                        {featuredReview.reviewerName || "Guest"} • {formatReviewDate(featuredReview.createdAt)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm leading-relaxed text-[#8897B2]">
                      Once reviews start coming in, this space becomes the quickest way to understand the truck’s reputation at a glance.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* About */}
            <section className="premium-subpanel p-6">
              <p className="section-kicker">Story</p>
              <h2 className="mb-3 mt-2 font-display text-2xl font-semibold">About</h2>
              {truck.description ? (
                <p className="text-[#8897B2] leading-relaxed">{truck.description}</p>
              ) : (
                <p className="text-[#8897B2] italic">
                  {isClaimed ? "No description yet." : "Claim this listing to add a description."}
                </p>
              )}
            </section>

            {/* Menu */}
            {truck.menuItems && truck.menuItems.length > 0 && (
              <section className="premium-subpanel p-6">
                <p className="section-kicker">What they serve</p>
                <h2 className="mb-4 mt-2 flex items-center gap-2 font-display text-2xl font-semibold">
                  <UtensilsCrossed className="h-5 w-5 text-[#8897B2]" /> Menu
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {truck.menuItems.map((item, i) => (
                    <MenuItemCard key={i} item={item} />
                  ))}
                </div>
              </section>
            )}

            {/* Where We Operate */}
            {truck.towns && truck.towns.length > 0 && (
              <section className="premium-subpanel p-6">
                <p className="section-kicker">Coverage</p>
                <h2 className="mb-3 mt-2 flex items-center gap-2 font-display text-2xl font-semibold">
                  <MapPin className="h-5 w-5 text-[#8897B2]" /> Where We Operate
                </h2>
                <div className="flex flex-wrap gap-2 mb-2">
                  {truck.towns.map((town) => (
                    <span key={town} className="text-sm bg-white/5 border border-white/10 rounded-full px-3 py-1 text-white">{town}</span>
                  ))}
                </div>
                <p className="text-xs text-[#8897B2]">Available for private events in these CT towns.</p>
              </section>
            )}

            {/* Reviews */}
            <section className="premium-subpanel p-6">
              <p className="section-kicker">Social proof</p>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="mt-2 font-display text-2xl font-semibold">Reviews</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#8897B2]">
                    Social proof matters. This section helps hungry customers and event planners understand how this truck actually shows up.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 md:min-w-[220px]">
                  <div className="flex items-center gap-3">
                    <StarRating rating={Math.round(averageRating)} />
                    <div>
                      <p className="text-2xl font-semibold text-white">
                        {reviews.length ? averageRating.toFixed(1) : "New"}
                      </p>
                      <p className="text-xs text-[#8897B2]">
                        {reviews.length === 0 ? "No reviews yet" : `${reviews.length} customer review${reviews.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {truck.publicProfileId ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-4">
                    {reviews.length > 0 ? (
                      reviews.slice(0, 6).map((review) => (
                        <article key={review.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B4FD8]/20 text-sm font-semibold text-[#AFC5FF]">
                                {(review.reviewerName?.trim()?.[0] || "G").toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-white">{review.reviewerName || "Guest"}</p>
                                <p className="text-xs text-[#8897B2]">{formatReviewDate(review.createdAt)}</p>
                              </div>
                            </div>
                            <StarRating rating={review.rating} />
                          </div>
                          {review.text && (
                            <p className="mt-3 text-sm leading-relaxed text-[#B8C4DA]">{review.text}</p>
                          )}
                        </article>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-[#8897B2]">
                        No reviews yet. The first great experience shared here gives this listing immediate trust with future customers.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                    <h3 className="font-display text-lg font-semibold text-white">Leave a review</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#8897B2]">
                      Keep it honest and useful. A quick note here helps the next person decide where to eat or who to book.
                    </p>
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#8897B2]">Your rating</p>
                      <StarRating rating={reviewRating} interactive onRate={setReviewRating} size="h-5 w-5" />
                    </div>
                    <div className="mt-4 space-y-3">
                      <Input
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        placeholder="Your name (optional)"
                        className="border-white/10 bg-white/5 text-white placeholder:text-[#6E7C97]"
                      />
                      <Textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="What stood out? Food quality, speed, communication, event experience..."
                        className="min-h-[140px] resize-none border-white/10 bg-white/5 text-white placeholder:text-[#6E7C97]"
                      />
                    </div>
                    <Button
                      onClick={() => submitReviewMutation.mutate()}
                      disabled={reviewRating === 0 || submitReviewMutation.isPending}
                      className="mt-4 h-11 w-full bg-[#1B4FD8] font-semibold text-white hover:bg-[#1B4FD8]/90"
                    >
                      {submitReviewMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting review...
                        </>
                      ) : (
                        "Submit review"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm leading-relaxed text-[#8897B2]">
                  Reviews will open once this truck’s public profile is fully connected.
                </div>
              )}
            </section>

            {/* Catering & Private Events */}
            {truck.offersPrivateCatering ? (
              <section className="premium-subpanel p-6">
                <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-[#00C896]" /> Catering &amp; Private Events
                </h2>
                {truck.cateringEventTypes && truck.cateringEventTypes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {truck.cateringEventTypes.map((type) => (
                      <span key={type} className={`text-xs font-medium px-3 py-1 rounded-full border capitalize ${EVENT_TYPE_COLORS[type] || "bg-white/10 text-white border-white/20"}`}>
                        {type}
                      </span>
                    ))}
                  </div>
                )}
                {(truck.cateringMinGuests || truck.cateringMaxGuests) && (
                  <div className="flex items-center gap-2 text-sm text-[#8897B2] mb-3">
                    <Users className="h-4 w-4 shrink-0" />
                    Serves {truck.cateringMinGuests ?? "?"} – {truck.cateringMaxGuests ?? "?"} guests
                  </div>
                )}
                {truck.cateringPricePerPerson && (
                  <p className="text-sm text-[#8897B2] mb-3">
                    <span className="text-white font-medium">{truck.cateringPricePerPerson}</span>
                  </p>
                )}
                {truck.cateringDescription && (
                  <p className="text-[#8897B2] text-sm leading-relaxed mb-4">{truck.cateringDescription}</p>
                )}
                <a
                  href={`mailto:${truck.cateringContactEmail || truck.email || ""}?subject=Catering Inquiry — ${truck.name}`}
                  className="inline-flex items-center gap-2 bg-[#00C896] hover:bg-[#00C896]/90 text-[#0A0F1E] font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Request a Catering Quote
                </a>
              </section>
            ) : !isClaimed ? (
              <section className="premium-subpanel p-5">
                <p className="text-sm text-[#8897B2]">
                  Does this truck offer catering?{" "}
                  <button onClick={handleClaim} className="text-[#F5A623] hover:underline">Claim your listing</button>{" "}
                  to add catering info and get found by event planners.
                </p>
              </section>
            ) : null}
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">

            {/* Contact card */}
            <div className="premium-panel hero-wash p-5 space-y-4">
              <p className="section-kicker">Connect</p>
              <h3 className="font-display text-xl font-semibold text-white">Links &amp; contact</h3>
              {truck.website && (
                <a href={truck.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#AFC5FF] hover:underline text-sm">
                  <Globe className="h-4 w-4 shrink-0" />
                  <span className="truncate">{truck.website.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              )}
              {truck.instagramHandle && (
                <a href={`https://instagram.com/${truck.instagramHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#8897B2] hover:text-white text-sm">
                  <Instagram className="h-4 w-4 shrink-0" /> {truck.instagramHandle}
                </a>
              )}
              {truck.tiktokHandle && (
                <a href={`https://tiktok.com/@${truck.tiktokHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#8897B2] hover:text-white text-sm">
                  <ExternalLink className="h-4 w-4 shrink-0" /> @{truck.tiktokHandle.replace("@", "")} (TikTok)
                </a>
              )}
              {truck.phone && (
                <a href={`tel:${truck.phone}`} className="flex items-center gap-2 text-[#8897B2] hover:text-white text-sm">
                  <Phone className="h-4 w-4 shrink-0" /> {truck.phone}
                </a>
              )}
              {truck.email && (
                <a href={`mailto:${truck.email}`} className="flex items-center gap-2 text-[#8897B2] hover:text-white text-sm">
                  <Mail className="h-4 w-4 shrink-0" /> {truck.email}
                </a>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {truck.website && (
                  <a
                    href={truck.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-[#1B4FD8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1B4FD8]/90"
                  >
                    Visit site
                  </a>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:text-white"
                >
                  Share
                </button>
              </div>
              {!truck.website && !truck.instagramHandle && !truck.phone && !truck.email && (
                <p className="text-[#8897B2] text-sm">No contact info yet.{!isClaimed && " Claim this listing to add yours."}</p>
              )}
            </div>

            {/* Mini map — home base location */}
            {truck.homeLat && truck.homeLng && (
              <MiniMap lat={truck.homeLat} lng={truck.homeLng} name={truck.name} />
            )}

            {/* Earned badges (if claimed) */}
            {isClaimed && publicBadges.length > 0 && (
              <div className="premium-subpanel p-5">
                <p className="section-kicker">Trust markers</p>
                <h3 className="mb-3 mt-2 font-display text-lg font-semibold text-white">Badges</h3>
                <div className="flex gap-2 flex-wrap">
                  {publicBadges.map(b => (
                    <BadgePip key={b} type={b} />
                  ))}
                </div>
              </div>
            )}

            {/* Permit status card */}
            <div className="premium-subpanel p-5">
              <p className="section-kicker">Operator status</p>
              <h3 className="mb-2 mt-2 font-display text-lg font-semibold text-white">Permit status</h3>
              {isClaimed ? (
                <p className="text-sm text-[#8897B2]">Connect your account to show active permits.</p>
              ) : (
                <p className="text-sm text-[#8897B2]">
                  <button onClick={handleClaim} className="text-[#F5A623] hover:underline">Claim this listing</button>{" "}
                  to show permit status.
                </p>
              )}
            </div>

            {/* Report */}
            <p className="text-xs text-[#8897B2] text-center">
              <a href={`mailto:hello@permitpilot.cloud?subject=Incorrect info — ${truck.name}`} className="hover:underline">
                Report incorrect info
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA strip */}
      <div className="bg-[#0A0F1E] border-t border-white/10 px-6 py-10 text-center">
        <p className="text-[#8897B2] text-base mb-4 max-w-xl mx-auto">
          Operating in CT? PermitPilot handles your permits — town by town, forms pre-filled.
        </p>
        <Link href="/new-permit">
          <Button className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white font-semibold h-11 px-6">
            Start Filing Permits →
          </Button>
        </Link>
      </div>
    </div>
  );
}
