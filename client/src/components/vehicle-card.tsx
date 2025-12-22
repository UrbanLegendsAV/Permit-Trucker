import { Truck, Caravan, MoreVertical, MapPin, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Profile } from "@shared/schema";

interface VehicleCardProps {
  profile: Profile;
  permitCount?: number;
  onClick?: () => void;
}

export function VehicleCard({ profile, permitCount = 0, onClick }: VehicleCardProps) {
  const VehicleIcon = profile.vehicleType === "truck" ? Truck : Caravan;

  return (
    <Card
      className="p-4 hover-elevate cursor-pointer transition-all"
      onClick={onClick}
      data-testid={`vehicle-card-${profile.id}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 shrink-0">
          <VehicleIcon className="w-7 h-7 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-base truncate">
                {profile.vehicleName || `My ${profile.vehicleType === "truck" ? "Food Truck" : "Trailer"}`}
              </h3>
              <p className="text-sm text-muted-foreground truncate">
                {profile.vinPlate || "No VIN/Plate added"}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-vehicle-menu">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-3 mt-3">
            <Badge variant="secondary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              {permitCount} {permitCount === 1 ? "Permit" : "Permits"}
            </Badge>
            {profile.menuType && (
              <Badge variant="outline" className="text-xs">
                {profile.menuType}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

interface VehicleCardSkeletonProps {
  count?: number;
}

export function VehicleCardSkeleton({ count = 1 }: VehicleCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4" data-testid={`vehicle-card-skeleton-${i}`}>
          <div className="flex items-start gap-4 animate-pulse">
            <div className="w-14 h-14 rounded-xl bg-muted" />
            <div className="flex-1 space-y-3">
              <div className="h-5 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="flex gap-2">
                <div className="h-5 bg-muted rounded w-20" />
                <div className="h-5 bg-muted rounded w-16" />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}
