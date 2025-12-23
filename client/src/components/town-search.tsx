import { useState, useMemo } from "react";
import { Search, MapPin, Building, ChevronRight, Flag, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceIndicator } from "./confidence-indicator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Town } from "@shared/schema";

interface TownSearchProps {
  towns: Town[];
  selectedState?: string;
  selectedCounty?: string;
  selectedTownId?: string | null;
  onSelectTown: (town: Town) => void;
  isLoading?: boolean;
}

export function TownSearch({ 
  towns, 
  selectedState = "CT",
  selectedCounty,
  selectedTownId,
  onSelectTown,
  isLoading = false,
}: TownSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showPioneerDialog, setShowPioneerDialog] = useState(false);
  const [pioneerForm, setPioneerForm] = useState({ townName: "", county: "", portalUrl: "", notes: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handlePioneerSubmit = async () => {
    if (!pioneerForm.townName.trim()) {
      toast({ title: "Town name required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/town-requests", {
        state: selectedState,
        townName: pioneerForm.townName.trim(),
        county: pioneerForm.county.trim() || null,
        portalUrl: pioneerForm.portalUrl.trim() || null,
        notes: pioneerForm.notes.trim() || null,
      });
      toast({ title: "Request Submitted", description: "Thanks for helping expand our database!" });
      setShowPioneerDialog(false);
      setPioneerForm({ townName: "", county: "", portalUrl: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/towns"] });
    } catch (error) {
      toast({ title: "Failed to submit", description: "Please try again later", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
            Can't find your town? Help us add it!
          </p>
          <Button 
            onClick={() => {
              setPioneerForm(prev => ({ ...prev, townName: searchQuery }));
              setShowPioneerDialog(true);
            }}
            data-testid="button-be-pioneer"
          >
            <Flag className="w-4 h-4 mr-2" />
            Be a Pioneer
          </Button>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="town-search-results">
          {filteredTowns.map((town) => (
            <Card
              key={town.id}
              className={`p-4 cursor-pointer transition-all ${
                selectedTownId === town.id 
                  ? "ring-2 ring-primary bg-primary/5" 
                  : "hover-elevate"
              }`}
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

      <Dialog open={showPioneerDialog} onOpenChange={setShowPioneerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a New Town</DialogTitle>
            <DialogDescription>
              Help us expand our database! We'll review your request and add the town.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="townName">Town Name</Label>
              <Input
                id="townName"
                value={pioneerForm.townName}
                onChange={(e) => setPioneerForm(prev => ({ ...prev, townName: e.target.value }))}
                placeholder="e.g., Bethel"
                data-testid="input-pioneer-town"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="county">County (Optional)</Label>
              <Input
                id="county"
                value={pioneerForm.county}
                onChange={(e) => setPioneerForm(prev => ({ ...prev, county: e.target.value }))}
                placeholder="e.g., Fairfield"
                data-testid="input-pioneer-county"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portalUrl">Town Website / Permit Page (Optional)</Label>
              <Input
                id="portalUrl"
                value={pioneerForm.portalUrl}
                onChange={(e) => setPioneerForm(prev => ({ ...prev, portalUrl: e.target.value }))}
                placeholder="https://town-website.gov/permits"
                data-testid="input-pioneer-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={pioneerForm.notes}
                onChange={(e) => setPioneerForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any helpful info about permit requirements..."
                data-testid="input-pioneer-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPioneerDialog(false)} data-testid="button-pioneer-cancel">
              Cancel
            </Button>
            <Button onClick={handlePioneerSubmit} disabled={isSubmitting} data-testid="button-pioneer-submit">
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
