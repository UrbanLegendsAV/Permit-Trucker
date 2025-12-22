import { useState } from "react";
import { Truck, Caravan, MoreVertical, FileText, Image, CheckCircle, Pencil, Trash2, FolderOpen, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Profile } from "@shared/schema";

interface VehicleCardProps {
  profile: Profile;
  permitCount?: number;
  onClick?: () => void;
  onEdit?: (profile: Profile) => void;
  onDelete?: (profileId: string) => void;
}

export function VehicleCard({ profile, permitCount = 0, onClick, onEdit, onDelete }: VehicleCardProps) {
  const [showDocuments, setShowDocuments] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const VehicleIcon = profile.vehicleType === "truck" ? Truck : Caravan;
  const documents = profile.uploadsJson?.documents || [];
  const hasDocuments = documents.length > 0;
  const hasExtractedData = profile.extractedData && Object.keys(profile.extractedData).length > 0;

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(profile);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete?.(profile.id);
    setShowDeleteConfirm(false);
  };

  const handleViewDocuments = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDocuments(true);
  };

  return (
    <>
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
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={handleMenuClick}>
                  <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-vehicle-menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleEdit} data-testid="menu-edit-vehicle">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Vehicle
                  </DropdownMenuItem>
                  {hasDocuments && (
                    <DropdownMenuItem onClick={handleViewDocuments} data-testid="menu-view-documents">
                      <FolderOpen className="w-4 h-4 mr-2" />
                      View Documents ({documents.length})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleDeleteClick} 
                    className="text-destructive focus:text-destructive"
                    data-testid="menu-delete-vehicle"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Vehicle
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

      <Dialog open={showDocuments} onOpenChange={setShowDocuments}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documents for {profile.vehicleName || "Vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {documents.map((doc, idx) => (
              <div
                key={idx}
                className="border rounded-lg overflow-hidden bg-muted"
                data-testid={`document-preview-${idx}`}
              >
                {doc.url && doc.type?.startsWith("image/") ? (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={doc.url}
                      alt={doc.name}
                      className="w-full h-32 object-cover"
                    />
                  </a>
                ) : (
                  <div className="w-full h-32 flex items-center justify-center text-muted-foreground">
                    <FileText className="w-10 h-10" />
                  </div>
                )}
                <div className="p-2 bg-background border-t">
                  <p className="text-xs truncate" title={doc.name}>{doc.name}</p>
                </div>
              </div>
            ))}
          </div>
          {documents.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No documents uploaded</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{profile.vehicleName || "this vehicle"}" and all associated documents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
