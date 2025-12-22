import { useState, useMemo } from "react";
import { Search, MapPin, Building, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceIndicator } from "./confidence-indicator";
import type { Town } from "@shared/schema";

interface TownSearchProps {
  towns: Town[];
  selectedState?: string;
  selectedCounty?: string;
  onSelectTown: (town: Town) => void;
  isLoading?: boolean;
}

export function TownSearch({ 
  towns, 
  selectedState = "CT",
  selectedCounty,
  onSelectTown,
  isLoading = false,
}: TownSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTowns = useMemo(() => {
    let filtered = towns.filter(t => t.state === selectedState);
    
    if (selectedCounty) {
      filtered = filtered.filter(t => t.county === selectedCounty);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.townName.toLowerCase().includes(query) ||
        t.county.toLowerCase().includes(query)
      );
    }
    
    return filtered.sort((a, b) => a.townName.localeCompare(b.townName));
  }, [towns, selectedState, selectedCounty, searchQuery]);

  const counties = useMemo(() => {
    const countySet = new Set(
      towns.filter(t => t.state === selectedState).map(t => t.county)
    );
    return Array.from(countySet).sort();
  }, [towns, selectedState]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search towns..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12"
          data-testid="input-town-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2" data-testid="town-search-loading">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse" data-testid={`town-skeleton-${i}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filteredTowns.length === 0 ? (
        <div className="text-center py-8" data-testid="town-search-empty">
          <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No towns found</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try adjusting your search or be a pioneer!
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="town-search-results">
          {filteredTowns.map((town) => (
            <Card
              key={town.id}
              className="p-4 cursor-pointer hover-elevate transition-all"
              onClick={() => onSelectTown(town)}
              data-testid={`town-card-${town.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{town.townName}</h4>
                    <ConfidenceIndicator 
                      score={town.confidenceScore || 50} 
                      size="sm"
                      showLabel={false}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {town.county} County, {town.state}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
