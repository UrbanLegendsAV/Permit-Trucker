import { Truck, Caravan, MoreVertical, FileText, Image, CheckCircle } from "lucide-react";
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
  const documents = profile.uploadsJson?.documents || [];
  const hasDocuments = documents.length > 0;
  const hasExtractedData = profile.extractedData && Object.keys(profile.extractedData).length > 0;

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
          
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              {permitCount} {permitCount === 1 ? "Permit" : "Permits"}
            </Badge>
            {profile.menuType && (
              <Badge variant="outline" className="text-xs">
                {profile.menuType}
              </Badge>
            )}
            {hasDocuments && (
              <Badge variant="outline" className="text-xs">
                <Image className="w-3 h-3 mr-1" />
                {documents.length} Doc{documents.length > 1 ? "s" : ""}
              </Badge>
            )}
            {hasExtractedData && (
              <Badge variant="default" className="text-xs bg-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                OCR Ready
              </Badge>
            )}
          </div>

          {hasDocuments && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {documents.slice(0, 4).map((doc, idx) => (
                <div
                  key={idx}
                  className="w-12 h-12 rounded-md border bg-muted shrink-0 overflow-hidden"
                  title={doc.name}
                  data-testid={`doc-thumbnail-${idx}`}
                >
                  {doc.url && doc.type?.startsWith("image/") ? (
                    <img
                      src={doc.url}
                      alt={doc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                </div>
              ))}
              {documents.length > 4 && (
                <div className="w-12 h-12 rounded-md border bg-muted shrink-0 flex items-center justify-center text-xs text-muted-foreground">
                  +{documents.length - 4}
                </div>
              )}
            </div>
          )}
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
