import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TopHeader } from "@/components/top-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, Upload, X, Plus, Trash2, Loader2, Save,
  Globe, Phone, Mail, Instagram, ExternalLink, Facebook,
  UtensilsCrossed, Utensils, MapPin,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

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

const CATERING_EVENT_TYPES = ["weddings", "birthdays", "corporate", "festivals", "graduations", "block parties"];

const CUISINE_OPTIONS = [
  "Brazilian BBQ", "Mexican", "Puerto Rican-Mexican", "Wings / American",
  "Wings / BBQ", "Ice Cream / Desserts", "American / Comfort Food",
  "Latin Fusion", "Pizza", "BBQ", "Fusion", "Farm-to-Table", "Other",
];

// ── ImageUploader ─────────────────────────────────────────────────────────────

function ImageUploader({
  value, onChange, placeholder = "Paste image URL or upload",
}: { value: string; onChange: (url: string) => void; placeholder?: string }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      if (data.url) onChange(data.url);
    } catch {
      // silently ignore upload errors — user can paste URL manually
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="border-white/10 text-[#8897B2] hover:text-white shrink-0"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">{uploading ? "Uploading..." : "Upload"}</span>
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {value && (
        <div className="relative inline-block">
          <img src={value} alt="preview" className="h-24 w-40 object-cover rounded-lg border border-white/10" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5 hover:bg-red-600"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── TownTagInput ──────────────────────────────────────────────────────────────

function TownTagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = () => {
    const town = input.trim();
    if (town && !value.includes(town)) onChange([...value, town]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add a CT town (press Enter)"
          className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} className="border-white/10 text-[#8897B2] hover:text-white">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((town) => (
          <span key={town} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-sm text-white">
            {town}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== town))} className="text-[#8897B2] hover:text-red-400 ml-1">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="workflow-step-frame space-y-4">
      <p className="section-kicker">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-white">{label}</label>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EditListingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: truck, isLoading } = useQuery<FoodTruck>({
    queryKey: [`/api/directory/${slug}`],
    queryFn: () => fetch(`/api/directory/${slug}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!slug,
  });

  // Form state
  const [imageUrl, setImageUrl] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [description, setDescription] = useState("");
  const [homeLat, setHomeLat] = useState("");
  const [homeLng, setHomeLng] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");
  const [facebookHandle, setFacebookHandle] = useState("");
  const [towns, setTowns] = useState<string[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [offersCatering, setOffersCatering] = useState(false);
  const [cateringEventTypes, setCateringEventTypes] = useState<string[]>([]);
  const [cateringMinGuests, setCateringMinGuests] = useState("");
  const [cateringMaxGuests, setCateringMaxGuests] = useState("");
  const [cateringPricePerPerson, setCateringPricePerPerson] = useState("");
  const [cateringDescription, setCateringDescription] = useState("");
  const [cateringContactEmail, setCateringContactEmail] = useState("");
  const [cateringContactPhone, setCateringContactPhone] = useState("");
  const [cateringWebsite, setCateringWebsite] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate state when truck loads
  useEffect(() => {
    if (!truck) return;
    setImageUrl(truck.imageUrl || "");
    setCuisine(truck.cuisine || "");
    setDescription(truck.description || "");
    setHomeLat(truck.homeLat || "");
    setHomeLng(truck.homeLng || "");
    setWebsite(truck.website || "");
    setPhone(truck.phone || "");
    setEmail(truck.email || "");
    setInstagramHandle(truck.instagramHandle || "");
    setTiktokHandle(truck.tiktokHandle || "");
    setFacebookHandle(truck.facebookHandle || "");
    setTowns(truck.towns || []);
    setMenuItems(truck.menuItems || []);
    setOffersCatering(truck.offersPrivateCatering || false);
    setCateringEventTypes(truck.cateringEventTypes || []);
    setCateringMinGuests(truck.cateringMinGuests?.toString() || "");
    setCateringMaxGuests(truck.cateringMaxGuests?.toString() || "");
    setCateringPricePerPerson(truck.cateringPricePerPerson || "");
    setCateringDescription(truck.cateringDescription || "");
    setCateringContactEmail(truck.cateringContactEmail || "");
    setCateringContactPhone(truck.cateringContactPhone || "");
    setCateringWebsite(truck.cateringWebsite || "");
  }, [truck]);

  // Access check
  const isTruckOwner = !!(user && truck?.claimedByUserId === (user as any).id);
  const isAdminUser = (user as any)?.role === "admin" || (user as any)?.role === "owner";
  const canEdit = isTruckOwner || isAdminUser;

  // Redirect if not authorized
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate(`/auth?next=/directory/${slug}/edit`);
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!isLoading && !authLoading && truck && !canEdit) {
      toast({ title: "Access denied", description: "You can only edit your own listings.", variant: "destructive" });
      navigate(`/directory/${slug}`);
    }
  }, [isLoading, authLoading, truck, canEdit]);

  const addMenuItem = () => setMenuItems([...menuItems, { name: "", description: "", imageUrl: "" }]);
  const removeMenuItem = (i: number) => setMenuItems(menuItems.filter((_, idx) => idx !== i));
  const updateMenuItem = (i: number, patch: Partial<MenuItem>) =>
    setMenuItems(menuItems.map((item, idx) => idx === i ? { ...item, ...patch } : item));

  const toggleEventType = (type: string) =>
    setCateringEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        imageUrl: imageUrl || null,
        cuisine: cuisine || null,
        description: description || null,
        homeLat: homeLat || null,
        homeLng: homeLng || null,
        website: website || null,
        phone: phone || null,
        email: email || null,
        instagramHandle: instagramHandle || null,
        tiktokHandle: tiktokHandle || null,
        facebookHandle: facebookHandle || null,
        towns: towns.length > 0 ? towns : null,
        menuItems: menuItems.filter((m) => m.name.trim()),
        offersPrivateCatering: offersCatering,
        cateringEventTypes: cateringEventTypes.length > 0 ? cateringEventTypes : null,
        cateringMinGuests: cateringMinGuests ? parseInt(cateringMinGuests) : null,
        cateringMaxGuests: cateringMaxGuests ? parseInt(cateringMaxGuests) : null,
        cateringPricePerPerson: cateringPricePerPerson || null,
        cateringDescription: cateringDescription || null,
        cateringContactEmail: cateringContactEmail || null,
        cateringContactPhone: cateringContactPhone || null,
        cateringWebsite: cateringWebsite || null,
      };
      const res = await fetch(`/api/directory/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/directory/${slug}`] });
      toast({ title: "Listing updated!", description: "Your public profile is live." });
      navigate(`/directory/${slug}`);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8897B2]" />
      </div>
    );
  }

  if (!truck) return null;

  return (
    <div className="workflow-shell">
      <TopHeader />

      {/* Sticky action bar */}
      <div className="sticky top-14 z-10 bg-[#0A0F1E]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/directory/${slug}`}>
              <button className="flex items-center gap-1.5 text-sm text-[#8897B2] hover:text-white transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            </Link>
            <span className="text-white/30">|</span>
            <span className="text-white font-semibold truncate">{truck.name}</span>
            <Badge className="bg-[#1B4FD8]/20 text-[#1B4FD8] border-[#1B4FD8]/30 text-xs">Edit Listing</Badge>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white font-semibold gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="workflow-hero px-6 py-7 md:px-8 md:py-9">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="section-kicker text-white/60">Owner studio</p>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Shape how {truck.name} looks to customers.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#B6C3DA] md:text-base">
                This is the page that powers discovery, trust, and conversion. Strong photos, clean contact info, a real menu, and better service-area detail all make your truck easier to find and easier to book.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="ops-kpi">
                <p className="section-kicker">Visibility</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white">{towns.length || 0}</p>
                <p className="text-sm text-[#8897B2]">towns currently listed</p>
              </div>
              <div className="ops-kpi">
                <p className="section-kicker">Menu</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white">{menuItems.filter((item) => item.name.trim()).length}</p>
                <p className="text-sm text-[#8897B2]">menu items on profile</p>
              </div>
              <div className="ops-kpi">
                <p className="section-kicker">Status</p>
                <p className="mt-2 font-display text-2xl font-semibold text-white">{offersCatering ? "Bookable" : "Profile"}</p>
                <p className="text-sm text-[#8897B2]">{offersCatering ? "catering inquiries enabled" : "public listing focus"}</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="mb-6 w-full justify-start rounded-[22px] border border-white/10 bg-white/5 p-1">
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#1B4FD8] data-[state=active]:text-white gap-1.5">
              <Globe className="h-4 w-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="menu" className="data-[state=active]:bg-[#1B4FD8] data-[state=active]:text-white gap-1.5">
              <UtensilsCrossed className="h-4 w-4" /> Menu
            </TabsTrigger>
            <TabsTrigger value="contact" className="data-[state=active]:bg-[#1B4FD8] data-[state=active]:text-white gap-1.5">
              <Phone className="h-4 w-4" /> Contact
            </TabsTrigger>
            <TabsTrigger value="catering" className="data-[state=active]:bg-[#1B4FD8] data-[state=active]:text-white gap-1.5">
              <Utensils className="h-4 w-4" /> Catering
            </TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile" className="space-y-5">
            <Section title="Hero Image">
              <p className="text-xs text-[#8897B2]">
                This appears as the banner at the top of your profile. Use a wide photo (landscape) for best results.
                Upload from your device or paste a URL from your website or social media.
              </p>
              <Field label="Hero image">
                <ImageUploader value={imageUrl} onChange={setImageUrl} placeholder="https://... or upload" />
              </Field>
            </Section>

            <Section title="About Your Truck">
              <Field label="Truck name">
                <Input value={truck.name} disabled className="bg-white/5 border-white/10 text-white/50 cursor-not-allowed" />
                <p className="text-xs text-[#8897B2] mt-1">Truck name is set when you claim your listing. Contact support to change it.</p>
              </Field>
              <Field label="Cuisine type">
                <div className="space-y-2">
                  <Input
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    placeholder="e.g. Puerto Rican-Mexican, BBQ, Pizza..."
                    className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {CUISINE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCuisine(opt)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${cuisine === opt ? "bg-[#1B4FD8] border-[#1B4FD8] text-white" : "border-white/10 text-[#8897B2] hover:text-white hover:border-white/30"}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Description">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell people what makes your truck special — food style, story, what to order..."
                  rows={4}
                  maxLength={600}
                  className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2] resize-none"
                />
                <p className="text-xs text-[#8897B2] text-right">{description.length}/600</p>
              </Field>
            </Section>

            <Section title="Home Base Location">
              <p className="text-xs text-[#8897B2]">
                Your commissary or home base shows on the map with a home pin. Customers follow your social for the live schedule.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude">
                  <Input value={homeLat} onChange={(e) => setHomeLat(e.target.value)} placeholder="41.7637" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </Field>
                <Field label="Longitude">
                  <Input value={homeLng} onChange={(e) => setHomeLng(e.target.value)} placeholder="-72.6851" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </Field>
              </div>
            </Section>
          </TabsContent>

          {/* ── Menu Tab ── */}
          <TabsContent value="menu" className="space-y-5">
            <div className="workflow-step-frame space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="section-kicker">Menu items</p>
                  <p className="text-xs text-[#8897B2] mt-1">
                    Add your signature dishes. Each item shows as a photo card on your profile.
                  </p>
                </div>
                <Button type="button" onClick={addMenuItem} variant="outline" size="sm" className="border-white/10 text-[#8897B2] hover:text-white gap-1.5">
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </div>

              {menuItems.length === 0 ? (
                <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center">
                  <UtensilsCrossed className="h-8 w-8 text-[#8897B2] mx-auto mb-2" />
                  <p className="text-[#8897B2] text-sm">No menu items yet.</p>
                  <button type="button" onClick={addMenuItem} className="text-[#1B4FD8] text-sm hover:underline mt-1">
                    Add your first item &rarr;
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {menuItems.map((item, i) => (
                    <div key={i} className="bg-[#0A0F1E] border border-white/10 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#8897B2]">Item {i + 1}</span>
                        <button type="button" onClick={() => removeMenuItem(i)} className="text-[#8897B2] hover:text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <Field label="Item name">
                        <Input
                          value={item.name}
                          onChange={(e) => updateMenuItem(i, { name: e.target.value })}
                          placeholder="e.g. Wings, Rice Bowl, Empanadas..."
                          className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]"
                        />
                      </Field>
                      <Field label="Description">
                        <Textarea
                          value={item.description}
                          onChange={(e) => updateMenuItem(i, { description: e.target.value })}
                          placeholder="Brief description of the dish..."
                          rows={2}
                          className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2] resize-none"
                        />
                      </Field>
                      <Field label="Photo">
                        <ImageUploader
                          value={item.imageUrl}
                          onChange={(url) => updateMenuItem(i, { imageUrl: url })}
                          placeholder="Upload or paste photo URL"
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Contact Tab ── */}
          <TabsContent value="contact" className="space-y-5">
            <Section title="Links & Contact">
              <Field label="Website">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yoursite.com" className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </div>
              </Field>
              <Field label="Phone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(860) 555-1234" className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </div>
              </Field>
              <Field label="Email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </div>
              </Field>
            </Section>

            <Section title="Social Media">
              <Field label="Instagram">
                <div className="relative">
                  <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
                  <Input value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} placeholder="YourHandle (no @)" className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </div>
              </Field>
              <Field label="TikTok">
                <div className="relative">
                  <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
                  <Input value={tiktokHandle} onChange={(e) => setTiktokHandle(e.target.value)} placeholder="YourHandle (no @)" className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </div>
              </Field>
              <Field label="Facebook">
                <div className="relative">
                  <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8897B2]" />
                  <Input value={facebookHandle} onChange={(e) => setFacebookHandle(e.target.value)} placeholder="YourPageName or URL" className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                </div>
              </Field>
            </Section>

            <Section title="Service Areas">
              <p className="text-xs text-[#8897B2]">The CT towns you operate in. These appear as tags on your profile.</p>
              <Field label="Towns">
                <TownTagInput value={towns} onChange={setTowns} />
              </Field>
            </Section>
          </TabsContent>

          {/* ── Catering Tab ── */}
          <TabsContent value="catering" className="space-y-5">
            <Section title="Catering & Private Events">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">Offer catering / private events?</p>
                  <p className="text-xs text-[#8897B2] mt-0.5">Show a catering section on your profile to get booked for events.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOffersCatering(!offersCatering)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${offersCatering ? "bg-[#00C896]" : "bg-white/10"}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${offersCatering ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>

              {offersCatering && (
                <div className="space-y-4 pt-2 border-t border-white/10">
                  <Field label="Event types you cater">
                    <div className="flex flex-wrap gap-2">
                      {CATERING_EVENT_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleEventType(type)}
                          className={`text-sm px-3 py-1.5 rounded-full border capitalize transition-colors ${cateringEventTypes.includes(type) ? "bg-[#1B4FD8] border-[#1B4FD8] text-white" : "border-white/10 text-[#8897B2] hover:text-white hover:border-white/30"}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Min guests">
                      <Input value={cateringMinGuests} onChange={(e) => setCateringMinGuests(e.target.value)} type="number" placeholder="25" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                    </Field>
                    <Field label="Max guests">
                      <Input value={cateringMaxGuests} onChange={(e) => setCateringMaxGuests(e.target.value)} type="number" placeholder="200" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                    </Field>
                  </div>
                  <Field label="Price per person (optional)">
                    <Input value={cateringPricePerPerson} onChange={(e) => setCateringPricePerPerson(e.target.value)} placeholder="e.g. $15–$25 per person" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                  </Field>
                  <Field label="Catering description">
                    <Textarea
                      value={cateringDescription}
                      onChange={(e) => setCateringDescription(e.target.value)}
                      placeholder="Tell event planners what you offer — packages, setup, what's included..."
                      rows={3}
                      className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2] resize-none"
                    />
                  </Field>
                  <Field label="Catering contact email">
                    <Input value={cateringContactEmail} onChange={(e) => setCateringContactEmail(e.target.value)} placeholder="events@yoursite.com" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                  </Field>
                  <Field label="Catering contact phone">
                    <Input value={cateringContactPhone} onChange={(e) => setCateringContactPhone(e.target.value)} placeholder="(860) 555-1234" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                  </Field>
                  <Field label="Catering website (optional)">
                    <Input value={cateringWebsite} onChange={(e) => setCateringWebsite(e.target.value)} placeholder="https://yoursite.com/catering" className="bg-white/5 border-white/10 text-white placeholder:text-[#8897B2]" />
                  </Field>
                </div>
              )}
            </Section>
          </TabsContent>
        </Tabs>

        {/* Bottom save button */}
        <div className="mt-8 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            size="lg"
            className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white font-semibold gap-2"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
