import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { TopHeader } from "@/components/top-header";
import { MobileNav } from "@/components/mobile-nav";
import { PermitCard, PermitCardSkeleton } from "@/components/permit-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Clock, CheckCircle, XCircle } from "lucide-react";
import type { Permit, Town } from "@shared/schema";

type FilterType = "all" | "active" | "pending" | "expired";

export default function PermitsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: permits = [], isLoading: permitsLoading } = useQuery<Permit[]>({
    queryKey: ["/api/permits"],
    enabled: isAuthenticated,
  });

  const { data: towns = [] } = useQuery<Town[]>({
    queryKey: ["/api/towns"],
    enabled: isAuthenticated,
  });

  const getTownForPermit = (permit: Permit) =>
    towns.find(t => t.id === permit.townId) || null;

  const filteredPermits = permits.filter(permit => {
    switch (filter) {
      case "active":
        return permit.status === "approved";
      case "pending":
        return permit.status === "pending" || permit.status === "draft";
      case "expired":
        return permit.status === "expired" || permit.status === "rejected";
      default:
        return true;
    }
  });

  const counts = {
    all: permits.length,
    active: permits.filter(p => p.status === "approved").length,
    pending: permits.filter(p => p.status === "pending" || p.status === "draft").length,
    expired: permits.filter(p => p.status === "expired" || p.status === "rejected").length,
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title="Permits" />
      
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Your Permits</h1>
            <p className="text-muted-foreground">
              {permits.length} total permit{permits.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={() => setLocation("/new-permit")} data-testid="button-new-permit">
            <Plus className="w-4 h-4 mr-2" />
            New Permit
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            className="shrink-0"
            data-testid="filter-all"
          >
            <FileText className="w-4 h-4 mr-2" />
            All ({counts.all})
          </Button>
          <Button
            variant={filter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("active")}
            className="shrink-0"
            data-testid="filter-active"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Active ({counts.active})
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("pending")}
            className="shrink-0"
            data-testid="filter-pending"
          >
            <Clock className="w-4 h-4 mr-2" />
            Pending ({counts.pending})
          </Button>
          <Button
            variant={filter === "expired" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("expired")}
            className="shrink-0"
            data-testid="filter-expired"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Expired ({counts.expired})
          </Button>
        </div>

        {permitsLoading ? (
          <div className="space-y-3">
            <PermitCardSkeleton count={5} />
          </div>
        ) : filteredPermits.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">
              {filter === "all" ? "No Permits Yet" : `No ${filter} Permits`}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {filter === "all"
                ? "Start your first permit application to see it here."
                : `You don't have any ${filter} permits.`}
            </p>
            {filter === "all" && (
              <Button onClick={() => setLocation("/new-permit")} data-testid="button-start-permit">
                <Plus className="w-4 h-4 mr-2" />
                Start Application
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredPermits.map(permit => (
              <PermitCard
                key={permit.id}
                permit={permit}
                town={getTownForPermit(permit)}
                onClick={() => setLocation(`/permits/${permit.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
