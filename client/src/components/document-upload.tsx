import { useRef, useState } from "react";
import { Upload, File, X, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UploadedFile {
  name: string;
  type: string;
  url: string;
}

interface DocumentUploadProps {
  onUpload: (files: UploadedFile[]) => void;
  existingFiles?: UploadedFile[];
  accept?: string;
  maxFiles?: number;
  label?: string;
}

export function DocumentUpload({
  onUpload,
  existingFiles = [],
  accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png",
  maxFiles = 10,
  label = "Upload Documents",
}: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>(existingFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;

    setIsUploading(true);
    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < fileList.length && files.length + newFiles.length < maxFiles; i++) {
      const file = fileList[i];
      const reader = new FileReader();
      
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          newFiles.push({
            name: file.name,
            type: file.type,
            url: reader.result as string,
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

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">{label}</label>
      
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
              className="flex items-center gap-3 p-3"
              data-testid={`file-item-${index}`}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary text-xs font-bold">
                {getFileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.type.split("/")[1]?.toUpperCase() || "File"}
                </p>
              </div>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
