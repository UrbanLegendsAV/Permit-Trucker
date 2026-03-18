import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });
import {
  ArrowLeft, ExternalLink, Instagram, CheckCircle2, MapPin, Tag,
  Phone, Mail, Globe, Share2, Utensils, Users, UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// ── Menu Item Card (expandable description) ───────────────────────────────────

function MenuItemCard({ item }: { item: { name: string; description: string; imageUrl: string } }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.description && item.description.length > 80;
  return (
    <div
      className="bg-white/5 border border-white/10 rounded-xl p-3 cursor-pointer"
      onClick={() => isLong && setExpanded((v) => !v)}
    >
      {item.imageUrl && (
        <img src={item.imageUrl} alt={item.name} className="w-full h-24 object-cover rounded-md mb-2" loading="lazy" />
      )}
      <p className="font-medium text-sm text-white">{item.name}</p>
      {item.description && (
        <div className="min-h-[60px]">
          <p className={`text-xs text-[#8897B2] mt-1 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
            {item.description}
          </p>
          {isLong && (
            <button className="text-[10px] text-[#1B4FD8] mt-1 hover:underline">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TruckProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();

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

  const isClaimed = truck.status === "claimed";
  const heroBg = heroBgForCuisine(truck.cuisine);
  const isOwnListing = isAuthenticated && !!(user as any) && truck.claimedByUserId === (user as any).id;

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white">
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
        className="relative w-full h-48 md:h-64 overflow-hidden"
        style={truck.imageUrl ? {} : { backgroundColor: heroBg }}
      >
        {truck.imageUrl && (
          <img src={truck.imageUrl} alt={truck.name} className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Back link */}
        <div className="absolute top-4 left-4 max-w-4xl">
          <Link href="/directory">
            <button className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Directory
            </button>
          </Link>
        </div>

        {/* Bottom-left: name + badges + social */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 max-w-4xl mx-auto">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2 leading-tight">{truck.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {truck.cuisine && (
              <Badge className="bg-white/10 backdrop-blur-sm text-white border-white/20 text-xs">
                <Tag className="h-3 w-3 mr-1" />{truck.cuisine}
              </Badge>
            )}
            {isClaimed ? (
              <Badge className="bg-[#00C896]/20 text-[#00C896] border-[#00C896]/30 gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" /> Claimed
              </Badge>
            ) : (
              <Badge className="bg-[#F5A623]/20 text-[#F5A623] border-[#F5A623]/30 text-xs">Unclaimed</Badge>
            )}
            {truck.offersPrivateCatering && (
              <Badge className="bg-white/10 text-white border-white/20 gap-1 text-xs">
                <Utensils className="h-3 w-3" /> Available for catering
              </Badge>
            )}
          </div>
          {/* Social icons */}
          <div className="flex items-center gap-3">
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

      {/* Two-column body */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

          {/* LEFT COLUMN */}
          <div className="space-y-8">

            {/* About */}
            <section>
              <h2 className="font-display font-semibold text-lg mb-3">About</h2>
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
              <section>
                <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
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
              <section>
                <h2 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
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

            {/* Catering & Private Events */}
            {truck.offersPrivateCatering ? (
              <section>
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
              <section className="border border-white/10 rounded-xl p-5">
                <p className="text-sm text-[#8897B2]">
                  Does this truck offer catering?{" "}
                  <button onClick={handleClaim} className="text-[#F5A623] hover:underline">Claim your listing</button>{" "}
                  to add catering info and get found by event planners.
                </p>
              </section>
            ) : null}
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5">

            {/* Contact card */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-sm text-[#8897B2] uppercase tracking-wide">Links &amp; Contact</h3>
              {truck.website && (
                <a href={truck.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#1B4FD8] hover:underline text-sm">
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
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="font-semibold text-sm text-[#8897B2] uppercase tracking-wide mb-3">Badges</h3>
                <div className="flex gap-2 flex-wrap">
                  {publicBadges.map(b => (
                    <BadgePip key={b} type={b} />
                  ))}
                </div>
              </div>
            )}

            {/* Share */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                className="flex items-center gap-2 text-sm text-[#8897B2] hover:text-white transition-colors w-full"
              >
                <Share2 className="h-4 w-4" /> Copy link to share
              </button>
            </div>

            {/* Permit status card */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="font-semibold text-sm text-[#8897B2] uppercase tracking-wide mb-2">Permit Status</h3>
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
