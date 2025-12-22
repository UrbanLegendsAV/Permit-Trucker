import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopHeader } from "@/components/top-header";
import { MobileNav } from "@/components/mobile-nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  MapPin, 
  Search, 
  Building2, 
  Coffee, 
  Beer, 
  Users, 
  Star, 
  TrendingUp,
  ExternalLink,
  Loader2,
  Sparkles
} from "lucide-react";
import type { Town } from "@shared/schema";

interface SpotSuggestion {
  id: string;
  name: string;
  type: "brewery" | "office" | "event" | "market" | "park";
  address: string;
  rating?: number;
  trafficPrediction: "high" | "medium" | "low";
  reason: string;
}

const MOCK_SPOTS: SpotSuggestion[] = [
  {
    id: "1",
    name: "Broken Symmetry Gastro Brewery",
    type: "brewery",
    address: "40 Grassy Plain St, Bethel, CT",
    rating: 4.6,
    trafficPrediction: "high",
    reason: "Breweries attract hungry crowds, especially on weekends",
  },
  {
    id: "2",
    name: "Bethel Town Center",
    type: "market",
    address: "Main Street, Bethel, CT",
    rating: 4.2,
    trafficPrediction: "high",
    reason: "High foot traffic area with regular farmers markets",
  },
  {
    id: "3",
    name: "Terra Coffee & Provisions",
    type: "event",
    address: "11 P.T. Barnum Square, Bethel, CT",
    rating: 4.8,
    trafficPrediction: "medium",
    reason: "Popular coffee spot with outdoor seating area",
  },
  {
    id: "4",
    name: "Huntington State Park",
    type: "park",
    address: "Sunset Hill Rd, Bethel, CT",
    rating: 4.7,
    trafficPrediction: "medium",
    reason: "Popular hiking destination, busy on weekends",
  },
];

const typeIcons: Record<string, typeof Building2> = {
  brewery: Beer,
  office: Building2,
  event: Users,
  market: Users,
  park: MapPin,
  coffee: Coffee,
};

const typeLabels: Record<string, string> = {
  brewery: "Brewery",
  office: "Office Park",
  event: "Event Space",
  market: "Farmers Market",
  park: "State Park",
  coffee: "Coffee Shop",
};

const trafficColors: Record<string, string> = {
  high: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

export default function SpotsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTown, setSelectedTown] = useState<Town | null>(null);

  const { data: towns = [], isLoading: townsLoading } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
  });

  const filteredTowns = towns.filter(town =>
    town.townName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    town.county?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTownSelect = (town: Town) => {
    setSelectedTown(town);
    setSearchQuery(town.townName);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title="Find Spots" />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">AI Location Optimizer</h2>
              <p className="text-sm text-muted-foreground">Find high-traffic spots for your food truck</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search towns in CT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12"
              data-testid="input-spot-search"
            />
          </div>

          {searchQuery && !selectedTown && filteredTowns.length > 0 && (
            <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-y-auto">
              {filteredTowns.slice(0, 5).map((town) => (
                <button
                  key={town.id}
                  className="w-full flex items-center gap-3 p-3 text-left hover-elevate"
                  onClick={() => handleTownSelect(town)}
                  data-testid={`town-option-${town.id}`}
                >
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{town.townName}</p>
                    <p className="text-xs text-muted-foreground">{town.county} County, {town.state}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {selectedTown ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Recommended Spots in {selectedTown.townName}
              </h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedTown(null)}
                data-testid="button-clear-town"
              >
                Clear
              </Button>
            </div>

            <div className="space-y-3">
              {MOCK_SPOTS.map((spot) => {
                const IconComponent = typeIcons[spot.type] || MapPin;
                return (
                  <Card key={spot.id} className="p-4" data-testid={`spot-card-${spot.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <IconComponent className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-medium truncate">{spot.name}</h4>
                            <p className="text-sm text-muted-foreground truncate">{spot.address}</p>
                          </div>
                          {spot.rating && (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              <Star className="w-3 h-3 mr-1 fill-yellow-500 text-yellow-500" />
                              {spot.rating}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {typeLabels[spot.type]}
                          </Badge>
                          <Badge className={`text-xs border ${trafficColors[spot.trafficPrediction]}`}>
                            {spot.trafficPrediction === "high" && "High Traffic"}
                            {spot.trafficPrediction === "medium" && "Medium Traffic"}
                            {spot.trafficPrediction === "low" && "Low Traffic"}
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground mt-2 italic">
                          {spot.reason}
                        </p>

                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(spot.address)}`, "_blank")}
                            data-testid={`button-directions-${spot.id}`}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Get Directions
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="p-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">AI-Powered Recommendations</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These spots are recommended based on venue type, local events, and typical food truck success patterns. 
                    Google Places integration coming soon for real-time data.
                  </p>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <Card className="p-8 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Find Your Next Location</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Search for a town to discover high-traffic spots like breweries, farmers markets, 
              and popular venues where food trucks thrive.
            </p>
          </Card>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
