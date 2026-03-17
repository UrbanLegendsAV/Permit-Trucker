import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, ExternalLink, Instagram, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
};

const CUISINE_OPTIONS = [
  "All Cuisines",
  "Brazilian BBQ",
  "Mexican",
  "Wings / American",
  "Ice Cream / Desserts",
  "American / Comfort Food",
  "Latin Fusion",
  "Pizza",
  "BBQ",
  "Fusion",
];

export default function DirectoryPage() {
  const [search, setSearch] = useState("");
  const [cuisineFilter, setCuisineFilter] = useState("All Cuisines");
  const [townFilter, setTownFilter] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trucks = [], isLoading } = useQuery<FoodTruck[]>({
    queryKey: ["/api/directory"],
    queryFn: () => fetch("/api/directory").then((r) => r.json()),
  });

  const claimMutation = useMutation({
    mutationFn: (slug: string) =>
      apiRequest("POST", "/api/directory/claim", { slug }),
    onSuccess: () => {
      toast({ title: "Listing claimed!", description: "We'll be in touch to verify your truck." });
      queryClient.invalidateQueries({ queryKey: ["/api/directory"] });
    },
    onError: () => {
      toast({ title: "Could not claim listing", description: "Please sign in first.", variant: "destructive" });
    },
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
      {/* Hero */}
      <div className="px-6 pt-16 pb-12 text-center max-w-3xl mx-auto">
        <h1 className="font-display text-4xl font-bold mb-3">
          Connecticut's Food Truck Hub
        </h1>
        <p className="text-[#8897B2] text-lg mb-8">
          Every CT food truck. Permits handled.
        </p>
        <Link href="/auth">
          <Button
            size="lg"
            className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white font-semibold px-8"
          >
            List Your Truck Free
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-[#0A0F1E]/95 backdrop-blur border-b border-white/10 px-4 py-3">
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
            <SelectTrigger className="w-full sm:w-48 bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUISINE_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by town..."
            value={townFilter}
            onChange={(e) => setTownFilter(e.target.value)}
            className="w-full sm:w-40 bg-white/5 border-white/10 text-white placeholder:text-[#8897B2] focus-visible:ring-[#1B4FD8]"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center text-[#8897B2] py-20">Loading trucks...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-[#8897B2] py-20">No trucks match your search.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((truck) => (
              <TruckCard
                key={truck.id}
                truck={truck}
                onClaim={() => claimMutation.mutate(truck.slug)}
                isClaiming={claimMutation.isPending && claimMutation.variables === truck.slug}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TruckCard({
  truck,
  onClaim,
  isClaiming,
}: {
  truck: FoodTruck;
  onClaim: () => void;
  isClaiming: boolean;
}) {
  const isClaimed = truck.status === "claimed";

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3 hover:bg-white/8 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <Link href={`/directory/${truck.slug}`}>
          <h3 className="font-display font-semibold text-white hover:text-[#1B4FD8] transition-colors cursor-pointer">
            {truck.name}
          </h3>
        </Link>
        {isClaimed ? (
          <Badge className="bg-[#00C896]/15 text-[#00C896] border-[#00C896]/30 shrink-0 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> Claimed
          </Badge>
        ) : (
          <Badge className="bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/30 shrink-0 text-xs gap-1">
            <AlertCircle className="h-3 w-3" /> Unclaimed
          </Badge>
        )}
      </div>

      {/* Cuisine */}
      {truck.cuisine && (
        <span className="text-xs text-[#8897B2] font-medium">{truck.cuisine}</span>
      )}

      {/* Description */}
      {truck.description && (
        <p className="text-sm text-[#8897B2] line-clamp-2">{truck.description}</p>
      )}

      {/* Towns */}
      {truck.towns && truck.towns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {truck.towns.map((town) => (
            <span
              key={town}
              className="text-xs bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[#8897B2]"
            >
              {town}
            </span>
          ))}
        </div>
      )}

      {/* Footer links */}
      <div className="mt-auto pt-2 flex items-center gap-3 border-t border-white/10">
        {truck.website && (
          <a
            href={truck.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#1B4FD8] hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" /> Website
          </a>
        )}
        {truck.instagramHandle && (
          <a
            href={`https://instagram.com/${truck.instagramHandle.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#8897B2] hover:text-white flex items-center gap-1"
          >
            <Instagram className="h-3 w-3" /> {truck.instagramHandle}
          </a>
        )}
        {!isClaimed && (
          <button
            onClick={onClaim}
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
