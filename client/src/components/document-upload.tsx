import { useRef, useState, useEffect } from "react";
import { Upload, X, CheckCircle, Loader2, ScanText, FolderOpen, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { performOCR, isImageFile, suggestFolderFromFileName, suggestFolderFromText, type ExtractedPermitData } from "@/lib/ocr";
import { useToast } from "@/hooks/use-toast";

const FOLDER_OPTIONS = [
  { value: "general", label: "General Documents" },
  { value: "itinerary-permit", label: "Itinerary Permits" },
  { value: "temp-permit", label: "Temporary Permits" },
  { value: "yearly-permit", label: "Yearly Permits" },
  { value: "seasonal-permit", label: "Seasonal Permits" },
  { value: "health-dept", label: "Health Department" },
  { value: "fire-safety", label: "Fire Safety" },
  { value: "vehicle-registration", label: "Vehicle Registration" },
  { value: "insurance", label: "Insurance Documents" },
  { value: "licenses", label: "Licenses & Certifications" },
];

interface UploadedFile {
  name: string;
  type: string;
  url: string;
  folder?: string;
}

interface DocumentUploadProps {
  onUpload: (files: UploadedFile[]) => void;
  existingFiles?: UploadedFile[];
  accept?: string;
  maxFiles?: number;
  label?: string;
  enableOCR?: boolean;
  onOCRExtracted?: (data: ExtractedPermitData) => void;
}

export function DocumentUpload({
  onUpload,
  existingFiles = [],
  accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png",
  maxFiles = 10,
  label = "Upload Documents",
  enableOCR = false,
  onOCRExtracted,
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>(existingFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [ocrIndex, setOcrIndex] = useState<number | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState("general");
  const { toast } = useToast();

  useEffect(() => {
    setFiles(existingFiles);
  }, [existingFiles]);

  const getFolderLabel = (value: string) => {
    return FOLDER_OPTIONS.find(f => f.value === value)?.label || value;
  };

  const updateFileFolder = (index: number, folder: string) => {
    const updatedFiles = files.map((file, i) => 
      i === index ? { ...file, folder } : file
    );
    setFiles(updatedFiles);
    onUpload(updatedFiles);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;

    setIsUploading(true);
    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < fileList.length && files.length + newFiles.length < maxFiles; i++) {
      const file = fileList[i];
      const reader = new FileReader();
      
      const suggestedFolder = suggestFolderFromFileName(file.name);
      const folder = suggestedFolder !== 'general' ? suggestedFolder : selectedFolder;
      
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          newFiles.push({
            name: file.name,
            type: file.type,
            url: reader.result as string,
            folder,
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }

    const updatedFiles = [...files, ...newFiles];
    setFiles(updatedFiles);
    onUpload(updatedFiles);
    setIsUploading(false);
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    onUpload(updatedFiles);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return "PDF";
    if (type.includes("image")) return "IMG";
    if (type.includes("doc")) return "DOC";
    return "FILE";
  };

  const handleOCRScan = async (index: number) => {
    const file = files[index];
    if (!file.type.includes("image")) {
      toast({
        title: "Unsupported Format",
        description: "OCR currently only supports image files.",
        variant: "destructive",
      });
      return;
    }

    setOcrIndex(index);
    setOcrProgress(0);

    try {
      const result = await performOCR(file.url, (p) => setOcrProgress(p));
      
      if (onOCRExtracted) {
        onOCRExtracted(result.extractedData);
      }

      const suggestedFolder = suggestFolderFromText(result.text, file.name);
      if (suggestedFolder !== 'general' && result.confidence > 50) {
        const currentFolder = file.folder || 'general';
        if (currentFolder === 'general') {
          updateFileFolder(index, suggestedFolder);
          toast({
            title: "Scan Complete",
            description: `Document auto-organized to "${getFolderLabel(suggestedFolder)}" folder.`,
          });
        } else {
          toast({
            title: "Scan Complete",
            description: `Extracted text with ${Math.round(result.confidence)}% confidence.`,
          });
        }
      } else {
        toast({
          title: "Scan Complete",
          description: `Extracted text with ${Math.round(result.confidence)}% confidence.`,
        });
      }
    } catch (err) {
      toast({
        title: "Scan Failed",
        description: "Could not extract text from this document.",
        variant: "destructive",
      });
    } finally {
      setOcrIndex(null);
      setOcrProgress(0);
    }
  };

  const isImageType = (type: string) => type.includes("image");

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">{label}</label>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Upload to folder:</span>
        </div>
        <Select value={selectedFolder} onValueChange={setSelectedFolder}>
          <SelectTrigger className="w-full" data-testid="select-folder">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLDER_OPTIONS.map((folder) => (
              <SelectItem key={folder.value} value={folder.value} data-testid={`folder-option-${folder.value}`}>
                {folder.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div
        className={`relative h-32 border-2 border-dashed rounded-lg transition-colors ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-muted hover:border-muted-foreground/50"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        data-testid="upload-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="input-file-upload"
        />
        <div className="flex flex-col items-center justify-center h-full gap-2 cursor-pointer">
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
          <p className="text-sm text-muted-foreground text-center px-4">
            {isUploading ? "Processing..." : "Tap to upload or drag files here"}
          </p>
          <p className="text-xs text-muted-foreground/70">
            PDF, DOC, JPG, PNG (max {maxFiles} files)
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <Card
              key={index}
              className="p-3 space-y-2"
              data-testid={`file-item-${index}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary text-xs font-bold">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Select 
                      value={file.folder || "general"} 
                      onValueChange={(value) => updateFileFolder(index, value)}
                    >
                      <SelectTrigger className="h-6 w-auto text-xs px-2" data-testid={`select-file-folder-${index}`}>
                        <FolderOpen className="w-3 h-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLDER_OPTIONS.map((folder) => (
                          <SelectItem key={folder.value} value={folder.value}>
                            {folder.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {enableOCR && isImageType(file.type) && ocrIndex !== index && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOCRScan(index);
                    }}
                    data-testid={`button-ocr-scan-${index}`}
                  >
                    <ScanText className="w-4 h-4 mr-1" />
                    Scan
                  </Button>
                )}
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" data-testid={`icon-file-success-${index}`} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  data-testid={`button-remove-file-${index}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {ocrIndex === index && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Scanning document...</span>
                    <span>{Math.round(ocrProgress)}%</span>
                  </div>
                  <Progress value={ocrProgress} className="h-1" data-testid={`progress-ocr-${index}`} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
