import { Calendar, MapPin, Clock, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Permit, Town } from "@shared/schema";
import { format, differenceInDays } from "date-fns";

interface PermitCardProps {
  permit: Permit;
  town?: Town | null;
  onClick?: () => void;
}

const statusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  approved: { label: "Approved", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
};

const permitTypeLabels = {
  yearly: "Yearly Permit",
  temporary: "Temporary Permit",
  seasonal: "Seasonal Permit",
};

export function PermitCard({ permit, town, onClick }: PermitCardProps) {
  const status = permit.status || "draft";
  const config = statusConfig[status];
  
  const daysUntilExpiry = permit.expiryDate 
    ? differenceInDays(new Date(permit.expiryDate), new Date())
    : null;

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;

  return (
    <Card
      className="p-4 hover-elevate cursor-pointer transition-all"
      onClick={onClick}
      data-testid={`permit-card-${permit.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={config.className}>
              {config.label}
            </Badge>
            {permit.isPioneer && (
              <Badge className="bg-gradient-to-r from-amber-500 to-yellow-400 text-black">
                Pioneer
              </Badge>
            )}
            {isExpiringSoon && (
              <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400">
                Expires Soon
              </Badge>
            )}
          </div>
          
          <h3 className="font-semibold">
            {permitTypeLabels[permit.permitType]}
          </h3>
          
          {town && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              <span>{town.townName}, {town.state}</span>
            </div>
          )}
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {permit.appliedDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Applied: {format(new Date(permit.appliedDate), "MMM d, yyyy")}</span>
              </div>
            )}
            {permit.expiryDate && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Expires: {format(new Date(permit.expiryDate), "MMM d, yyyy")}</span>
              </div>
            )}
          </div>
        </div>
        
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
      </div>
    </Card>
  );
}

export function PermitCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4" data-testid={`permit-skeleton-${i}`}>
          <div className="space-y-3 animate-pulse">
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-muted rounded-full" />
            </div>
            <div className="h-5 w-3/4 bg-muted rounded" />
            <div className="h-4 w-1/2 bg-muted rounded" />
            <div className="flex gap-4">
              <div className="h-3 w-28 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}
