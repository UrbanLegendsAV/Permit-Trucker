import { useState, useMemo, useEffect, useRef } from "react";
import { Truck, Caravan, MoreVertical, FileText, Image, CheckCircle, Pencil, Trash2, FolderOpen, X, ExternalLink, Maximize2, ChevronDown, ChevronRight, ScanText, Calendar, CreditCard, Building2, Loader2, Sparkles, Upload, Plus, Save } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { performOCR, detectDocumentType } from "@/lib/ocr";
import type { Profile } from "@shared/schema";
import { DOCUMENT_CATEGORIES } from "./document-upload";
import { ParsedDataDisplay } from "./parsed-data-display";

const CATEGORY_MAP: Record<string, string> = DOCUMENT_CATEGORIES.reduce((acc, cat) => {
  acc[cat.value] = cat.label;
  return acc;
}, {} as Record<string, string>);

const LEGACY_FOLDER_MAP: Record<string, string> = {
  "general": "other",
  "itinerary-permit": "permit-application",
  "temp-permit": "permit-application",
  "yearly-permit": "permit-application",
  "seasonal-permit": "permit-application",
  "health-dept": "health-permit",
  "fire-safety": "fire-safety",
  "vehicle-registration": "vehicle-registration",
  "insurance": "coi",
  "licenses": "food-manager-cert",
};

interface DocumentType {
  name: string;
  url: string;
  type?: string;
  folder?: string;
}

interface VehicleCardProps {
  profile: Profile;
  permitCount?: number;
  onClick?: () => void;
  onEdit?: (profile: Profile) => void;
  onDelete?: (profileId: string) => void;
  onDeleteDocument?: (profileId: string, docIndex: number) => void;
  onUpdateDocumentCategory?: (profileId: string, docIndex: number, category: string) => void;
}

export function VehicleCard({ profile, permitCount = 0, onClick, onEdit, onDelete, onDeleteDocument, onUpdateDocumentCategory }: VehicleCardProps) {
  const [showDocuments, setShowDocuments] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [fullScreenDoc, setFullScreenDoc] = useState<DocumentType | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ doc: DocumentType; index: number } | null>(null);
  const [scanningDocIndex, setScanningDocIndex] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [isParsingAll, setIsParsingAll] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("other");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  const parsedData = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object') 
    ? profile.parsedDataLog as Record<string, Record<string, { value: string; confidence: number }>>
    : {};
  
  const getFieldValue = (category: string, field: string): string => {
    return parsedData[category]?.[field]?.value || "";
  };
  
  const [editForm, setEditForm] = useState({
    businessName: getFieldValue("business_info", "business_name") || profile.vehicleName || "",
    address: getFieldValue("owner_info", "mailing_address"),
    city: getFieldValue("owner_info", "city"),
    state: getFieldValue("owner_info", "state") || "CT",
    zip: getFieldValue("owner_info", "zip"),
    phone: getFieldValue("owner_info", "phone") || getFieldValue("business_info", "phone"),
    email: getFieldValue("owner_info", "email") || getFieldValue("business_info", "email"),
  });
  
  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const updatedParsedData = { ...parsedData };
      
      if (!updatedParsedData.owner_info) {
        updatedParsedData.owner_info = {};
      }
      if (!updatedParsedData.business_info) {
        updatedParsedData.business_info = {};
      }
      
      updatedParsedData.owner_info.mailing_address = { value: data.address, confidence: 100 };
      updatedParsedData.owner_info.city = { value: data.city, confidence: 100 };
      updatedParsedData.owner_info.state = { value: data.state, confidence: 100 };
      updatedParsedData.owner_info.zip = { value: data.zip, confidence: 100 };
      updatedParsedData.owner_info.phone = { value: data.phone, confidence: 100 };
      updatedParsedData.owner_info.email = { value: data.email, confidence: 100 };
      updatedParsedData.business_info.business_name = { value: data.businessName, confidence: 100 };
      
      return apiRequest("PATCH", `/api/profiles/${profile.id}`, {
        name: data.businessName,
        parsedDataLog: updatedParsedData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setShowEditDialog(false);
      toast({
        title: "Profile Updated",
        description: "Your vehicle profile has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "There was an error updating your profile.",
        variant: "destructive",
      });
    },
  });

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    
    setIsUploading(true);
    try {
      const newDocs: DocumentType[] = [];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        newDocs.push({
          name: file.name,
          url: dataUrl,
          type: file.type,
          folder: uploadCategory,
        });
      }
      
      const currentDocs = profile.uploadsJson?.documents || [];
      const updatedDocs = [...currentDocs, ...newDocs];
      
      await apiRequest("PATCH", `/api/profiles/${profile.id}`, {
        uploadsJson: { documents: updatedDocs },
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      
      toast({
        title: "Documents Uploaded",
        description: `Added ${newDocs.length} document${newDocs.length > 1 ? 's' : ''}.`,
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Could not upload documents.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleParseAllDocuments = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsParsingAll(true);
    try {
      const response = await apiRequest("POST", `/api/profiles/${profile.id}/parse-all-documents`);
      const data = await response.json();
      if (data.success) {
        toast({
          title: "Documents Analyzed",
          description: `Extracted data from ${data.documentsAnalyzed} documents.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      } else {
        throw new Error(data.message || "Failed to parse documents");
      }
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Could not analyze documents.",
        variant: "destructive",
      });
    } finally {
      setIsParsingAll(false);
    }
  };

  const handleVerifyField = async (category: string, field: string, verified: boolean) => {
    try {
      await apiRequest("PATCH", `/api/profiles/${profile.id}/parsed-data/verify`, {
        category,
        field,
        verified
      });
      toast({
        title: verified ? "Field Verified" : "Marked for Review",
        description: `Updated field status successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Could not update field status.",
        variant: "destructive",
      });
    }
  };
  
  const handleEditField = async (category: string, field: string, newValue: string) => {
    try {
      await apiRequest("PATCH", `/api/profiles/${profile.id}/parsed-data/edit`, {
        category,
        field,
        value: newValue
      });
      toast({
        title: "Field Updated",
        description: `Successfully updated the field.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Could not update field.",
        variant: "destructive",
      });
    }
  };
  
  const VehicleIcon = profile.vehicleType === "truck" ? Truck : Caravan;
  const documents: DocumentType[] = profile.uploadsJson?.documents || [];
  const hasDocuments = documents.length > 0;
  const hasExtractedData = profile.extractedData && Object.keys(profile.extractedData).length > 0;

  const normalizeCategory = (folder?: string): string => {
    if (!folder) return "other";
    if (CATEGORY_MAP[folder]) return folder;
    return LEGACY_FOLDER_MAP[folder] || "other";
  };

  const groupedDocuments = useMemo(() => {
    const groups: Record<string, { doc: DocumentType; originalIndex: number }[]> = {};
    documents.forEach((doc, idx) => {
      const category = normalizeCategory(doc.folder);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({ doc, originalIndex: idx });
    });
    return groups;
  }, [documents]);

  const handleScanDocument = async (doc: DocumentType, docIndex: number) => {
    if (!doc.type?.startsWith("image/")) {
      toast({
        title: "Unsupported Format",
        description: "OCR scanning only works with image files.",
        variant: "destructive",
      });
      return;
    }

    setScanningDocIndex(docIndex);
    setScanProgress(0);

    try {
      const result = await performOCR(doc.url, (p) => setScanProgress(p));
      const detectedType = detectDocumentType(result.text, doc.name);
      
      if (detectedType.type !== 'other' && detectedType.confidence > 50) {
        if (onUpdateDocumentCategory) {
          onUpdateDocumentCategory(profile.id, docIndex, detectedType.type);
        }
        toast({
          title: `Detected: ${CATEGORY_MAP[detectedType.type] || detectedType.type}`,
          description: `Document categorized with ${Math.round(detectedType.confidence)}% confidence.`,
        });
      } else {
        toast({
          title: "Scan Complete",
          description: "Could not determine document type. Please select manually.",
        });
      }
    } catch {
      toast({
        title: "Scan Failed",
        description: "Could not process this document.",
        variant: "destructive",
      });
    } finally {
      setScanningDocIndex(null);
      setScanProgress(0);
    }
  };

  const handleCategoryChange = (docIndex: number, newCategory: string) => {
    if (onUpdateDocumentCategory) {
      onUpdateDocumentCategory(profile.id, docIndex, newCategory);
      toast({
        title: "Category Updated",
        description: `Document moved to ${CATEGORY_MAP[newCategory] || newCategory}.`,
      });
    }
  };

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    const folderKeys = Object.keys(groupedDocuments);
    if (folderKeys.length > 0) {
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        folderKeys.forEach(key => newSet.add(key));
        return newSet;
      });
    }
  }, [groupedDocuments]);

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
    } else {
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditForm({
      businessName: getFieldValue("business_info", "business_name") || profile.vehicleName || "",
      address: getFieldValue("owner_info", "mailing_address"),
      city: getFieldValue("owner_info", "city"),
      state: getFieldValue("owner_info", "state") || "CT",
      zip: getFieldValue("owner_info", "zip"),
      phone: getFieldValue("owner_info", "phone") || getFieldValue("business_info", "phone"),
      email: getFieldValue("owner_info", "email") || getFieldValue("business_info", "email"),
    });
    setShowEditDialog(true);
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

  const handleDocClick = (doc: DocumentType) => {
    if (doc.type?.startsWith("image/")) {
      setFullScreenDoc(doc);
    } else if (doc.type === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf")) {
      // Convert base64 data URI to Blob URL for better browser support
      try {
        const base64Match = doc.url.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
          const mimeType = base64Match[1];
          const base64Data = base64Match[2];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, "_blank");
        } else {
          window.open(doc.url, "_blank");
        }
      } catch {
        window.open(doc.url, "_blank");
      }
    } else {
      window.open(doc.url, "_blank");
    }
  };

  const handleDeleteDoc = (doc: DocumentType, index: number) => {
    setDocToDelete({ doc, index });
  };

  const confirmDeleteDoc = () => {
    if (docToDelete && onDeleteDocument) {
      onDeleteDocument(profile.id, docToDelete.index);
    }
    setDocToDelete(null);
  };

  const isPdf = (doc: DocumentType) => {
    return doc.type === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
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
                  <DropdownMenuItem onClick={handleViewDocuments} data-testid="menu-view-documents">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    {hasDocuments ? `Documents (${documents.length})` : "Add Documents"}
                  </DropdownMenuItem>
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

            {hasExtractedData && profile.extractedData && (
              <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg" data-testid="extracted-data-preview">
                <div className="flex items-center gap-2 mb-2">
                  <ScanText className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">Auto-Extracted Data</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {profile.extractedData.vin && (
                    <div className="flex items-center gap-1" data-testid="extracted-vin">
                      <CreditCard className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">VIN:</span>
                      <span className="font-mono truncate">{profile.extractedData.vin}</span>
                    </div>
                  )}
                  {profile.extractedData.licensePlate && (
                    <div className="flex items-center gap-1" data-testid="extracted-plate">
                      <CreditCard className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Plate:</span>
                      <span className="font-mono">{profile.extractedData.licensePlate}</span>
                    </div>
                  )}
                  {profile.extractedData.businessName && (
                    <div className="flex items-center gap-1 col-span-2" data-testid="extracted-business">
                      <Building2 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Business:</span>
                      <span className="truncate">{profile.extractedData.businessName}</span>
                    </div>
                  )}
                  {profile.extractedData.expirationDate && (
                    <div className="flex items-center gap-1" data-testid="extracted-expiry">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Expires:</span>
                      <span>{profile.extractedData.expirationDate}</span>
                    </div>
                  )}
                  {profile.extractedData.licenseNumber && (
                    <div className="flex items-center gap-1" data-testid="extracted-license">
                      <FileText className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">License:</span>
                      <span className="font-mono">{profile.extractedData.licenseNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {hasDocuments && (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleParseAllDocuments}
                  disabled={isParsingAll}
                  className="w-full"
                  data-testid="button-parse-all-documents"
                >
                  {isParsingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing {documents.length} Documents...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI Analyze All Documents
                    </>
                  )}
                </Button>
              </div>
            )}

            {profile.parsedDataLog && Object.keys(profile.parsedDataLog).length > 0 && (
              <div className="mt-3">
                <ParsedDataDisplay 
                  data={profile.parsedDataLog as Record<string, unknown>}
                  showAllFields={true}
                  onVerify={handleVerifyField}
                  onEdit={handleEditField}
                  profileId={profile.id}
                />
              </div>
            )}

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
          
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="w-4 h-4" />
              Add Documents
            </div>
            <div className="flex items-center gap-2">
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="flex-1" data-testid="select-upload-category">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="default"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-upload-docs"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={(e) => handleUploadFiles(e.target.files)}
                data-testid="input-upload-files"
              />
            </div>
          </div>
          
          <div className="space-y-4 mt-4">
            {Object.entries(groupedDocuments).map(([category, items]) => (
              <div key={category} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 p-3 bg-muted/50 text-left hover-elevate"
                  onClick={() => toggleFolder(category)}
                  data-testid={`folder-header-${category}`}
                >
                  {expandedFolders.has(category) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm flex-1">
                    {CATEGORY_MAP[category] || category}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {items.length}
                  </Badge>
                </button>
                {expandedFolders.has(category) && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-background">
                    {items.map(({ doc, originalIndex }) => (
                      <div
                        key={originalIndex}
                        className="border rounded-lg overflow-visible bg-muted group relative"
                        data-testid={`document-preview-${originalIndex}`}
                      >
                        <div 
                          className="cursor-pointer"
                          onClick={() => handleDocClick(doc)}
                        >
                          {doc.url && doc.type?.startsWith("image/") ? (
                            <div className="relative">
                              <img
                                src={doc.url}
                                alt={doc.name}
                                className="w-full h-24 object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ) : (
                            <div className="w-full h-24 flex flex-col items-center justify-center text-muted-foreground gap-1">
                              <FileText className="w-8 h-8" />
                              {isPdf(doc) && (
                                <span className="text-xs flex items-center gap-1">
                                  <ExternalLink className="w-3 h-3" />
                                  Tap to view
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="p-2 bg-background border-t space-y-2">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs truncate flex-1" title={doc.name}>{doc.name}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {doc.type?.startsWith("image/") && scanningDocIndex !== originalIndex && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleScanDocument(doc, originalIndex);
                                  }}
                                  title="Scan to detect type"
                                  data-testid={`button-scan-doc-${originalIndex}`}
                                >
                                  <ScanText className="w-3 h-3" />
                                </Button>
                              )}
                              {onDeleteDocument && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDoc(doc, originalIndex);
                                  }}
                                  data-testid={`button-delete-doc-${originalIndex}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {scanningDocIndex === originalIndex && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Scanning...</span>
                                <span>{Math.round(scanProgress)}%</span>
                              </div>
                              <Progress value={scanProgress} className="h-1" />
                            </div>
                          )}
                          {onUpdateDocumentCategory && scanningDocIndex !== originalIndex && (
                            <Select 
                              value={normalizeCategory(doc.folder)} 
                              onValueChange={(val) => handleCategoryChange(originalIndex, val)}
                            >
                              <SelectTrigger className="h-6 text-xs" data-testid={`select-doc-category-${originalIndex}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DOCUMENT_CATEGORIES.map((cat) => (
                                  <SelectItem key={cat.value} value={cat.value}>
                                    {cat.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {documents.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No documents uploaded</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!fullScreenDoc} onOpenChange={() => setFullScreenDoc(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/20"
              onClick={() => setFullScreenDoc(null)}
              data-testid="button-close-fullscreen"
            >
              <X className="w-6 h-6" />
            </Button>
            {fullScreenDoc && (
              <img
                src={fullScreenDoc.url}
                alt={fullScreenDoc.name}
                className="max-w-full max-h-[90vh] object-contain"
              />
            )}
          </div>
          {fullScreenDoc && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-white text-sm text-center">{fullScreenDoc.name}</p>
            </div>
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

      <AlertDialog open={!!docToDelete} onOpenChange={() => setDocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{docToDelete?.doc.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-doc">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteDoc}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-doc"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Vehicle Profile</DialogTitle>
          </DialogHeader>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              updateProfileMutation.mutate(editForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={editForm.businessName}
                onChange={(e) => setEditForm(f => ({ ...f, businessName: e.target.value }))}
                data-testid="input-edit-business-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={editForm.address}
                onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                placeholder="e.g., 4a Scuppo Rd"
                data-testid="input-edit-address"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editForm.city}
                  onChange={(e) => setEditForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="Danbury"
                  data-testid="input-edit-city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={editForm.state}
                  onChange={(e) => setEditForm(f => ({ ...f, state: e.target.value }))}
                  placeholder="CT"
                  data-testid="input-edit-state"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP</Label>
                <Input
                  id="zip"
                  value={editForm.zip}
                  onChange={(e) => setEditForm(f => ({ ...f, zip: e.target.value }))}
                  placeholder="06811"
                  data-testid="input-edit-zip"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={editForm.phone}
                onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(203) 555-1234"
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                data-testid="input-edit-email"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowEditDialog(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateProfileMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
