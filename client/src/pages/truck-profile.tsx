import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, ExternalLink, Instagram, CheckCircle2, MapPin, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  phone: string | null;
  instagramHandle: string | null;
  description: string | null;
  status: string | null;
  imageUrl: string | null;
};

export default function TruckProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: truck, isLoading, error } = useQuery<FoodTruck>({
    queryKey: [`/api/directory/${slug}`],
    queryFn: () => fetch(`/api/directory/${slug}`).then((r) => {
      if (!r.ok) throw new Error("Truck not found");
      return r.json();
    }),
    enabled: !!slug,
  });

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/directory/claim", { slug }),
    onSuccess: () => {
      toast({ title: "Listing claimed!", description: "We'll be in touch to verify your truck." });
      queryClient.invalidateQueries({ queryKey: [`/api/directory/${slug}`] });
    },
    onError: () => {
      toast({ title: "Could not claim listing", description: "Please sign in first.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-[#8897B2]">
        Loading...
      </div>
    );
  }

  if (error || !truck) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-[#8897B2]">Truck not found.</p>
        <Link href="/directory">
          <Button variant="outline">Back to Directory</Button>
        </Link>
      </div>
    );
  }

  const isClaimed = truck.status === "claimed";

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white">
      {/* Unclaimed banner */}
      {!isClaimed && (
        <div className="bg-[#F5A623]/10 border-b border-[#F5A623]/30 px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-[#F5A623]">
              Is this your truck? Claim it free and connect it to permit filing.
            </p>
            <Button
              size="sm"
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending}
              className="bg-[#F5A623] hover:bg-[#F5A623]/90 text-black font-semibold shrink-0"
            >
              {claimMutation.isPending ? "Claiming..." : "Claim Listing"}
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/directory">
          <button className="flex items-center gap-2 text-sm text-[#8897B2] hover:text-white mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Directory
          </button>
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">{truck.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {truck.cuisine && (
                <Badge className="bg-[#1B4FD8]/20 text-[#1B4FD8] border-[#1B4FD8]/30 gap-1">
                  <Tag className="h-3 w-3" /> {truck.cuisine}
                </Badge>
              )}
              {isClaimed && (
                <Badge className="bg-[#00C896]/15 text-[#00C896] border-[#00C896]/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Claimed
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {truck.description && (
          <p className="text-[#8897B2] text-base leading-relaxed mb-6">{truck.description}</p>
        )}

        {/* Towns */}
        {truck.towns && truck.towns.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[#8897B2] uppercase tracking-wide mb-2 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Serves
            </h2>
            <div className="flex flex-wrap gap-2">
              {truck.towns.map((town) => (
                <span
                  key={town}
                  className="text-sm bg-white/5 border border-white/10 rounded-full px-3 py-1 text-white"
                >
                  {town}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Contact / Links */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#8897B2] uppercase tracking-wide">Links & Contact</h2>
          {truck.website && (
            <a
              href={truck.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#1B4FD8] hover:underline text-sm"
            >
              <ExternalLink className="h-4 w-4" /> {truck.website}
            </a>
          )}
          {truck.instagramHandle && (
            <a
              href={`https://instagram.com/${truck.instagramHandle.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#8897B2] hover:text-white text-sm"
            >
              <Instagram className="h-4 w-4" /> {truck.instagramHandle}
            </a>
          )}
          {truck.phone && (
            <a href={`tel:${truck.phone}`} className="flex items-center gap-2 text-[#8897B2] hover:text-white text-sm">
              {truck.phone}
            </a>
          )}
          {!truck.website && !truck.instagramHandle && !truck.phone && (
            <p className="text-[#8897B2] text-sm">No contact info yet.{!isClaimed && " Claim this listing to add yours."}</p>
          )}
        </div>

        {/* CTA — permit filing */}
        {isClaimed && (
          <div className="mt-6 bg-[#1B4FD8]/10 border border-[#1B4FD8]/30 rounded-xl p-5 text-center">
            <p className="text-sm text-[#8897B2] mb-3">Ready to file permits for {truck.name}?</p>
            <Link href="/auth">
              <Button className="bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white">
                Start Filing Permits
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
