import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScanText, Loader2, CheckCircle2, AlertCircle, Copy, FileText } from "lucide-react";
import { performOCR, isImageFile, type OCRResult, type ExtractedPermitData } from "@/lib/ocr";
import { useToast } from "@/hooks/use-toast";

interface DocumentOCRProps {
  file: File;
  onExtracted?: (data: ExtractedPermitData) => void;
}

export function DocumentOCR({ file, onExtracted }: DocumentOCRProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleScan = async () => {
    if (!isImageFile(file)) {
      setError("OCR currently only supports image files (JPG, PNG, etc.)");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const ocrResult = await performOCR(file, (p) => setProgress(p));
      setResult(ocrResult);
      
      if (onExtracted) {
        onExtracted(ocrResult.extractedData);
      }

      toast({
        title: "Scan Complete",
        description: `Extracted text with ${Math.round(ocrResult.confidence)}% confidence.`,
      });
    } catch (err) {
      setError("Failed to process document. Please try a clearer image.");
      toast({
        title: "Scan Failed",
        description: "Could not extract text from this document.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Text copied to clipboard.",
    });
  };

  if (!isImageFile(file)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {!result && !isProcessing && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleScan}
          className="w-full"
          data-testid="button-scan-document"
        >
          <ScanText className="w-4 h-4 mr-2" />
          Scan Document
        </Button>
      )}

      {isProcessing && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Processing document...</span>
          </div>
          <Progress value={progress} className="h-2" data-testid="progress-ocr" />
          <p className="text-xs text-muted-foreground text-center">
            {Math.round(progress)}%
          </p>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive p-2 bg-destructive/10 rounded-lg" data-testid="text-ocr-error">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-muted-foreground">
                Confidence: <span className="font-medium" data-testid="text-ocr-confidence">{Math.round(result.confidence)}%</span>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(result.text)}
              data-testid="button-copy-ocr-text"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>

          {Object.entries(result.extractedData).some(([, v]) => v) && (
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Extracted Data
              </h4>
              <div className="grid gap-2 text-sm" data-testid="container-extracted-data">
                {result.extractedData.businessName && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Business:</span>
                    <span className="font-medium" data-testid="text-extracted-business">{result.extractedData.businessName}</span>
                  </div>
                )}
                {result.extractedData.licenseNumber && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">License #:</span>
                    <span className="font-medium" data-testid="text-extracted-license">{result.extractedData.licenseNumber}</span>
                  </div>
                )}
                {result.extractedData.expirationDate && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Expires:</span>
                    <span className="font-medium" data-testid="text-extracted-expiry">{result.extractedData.expirationDate}</span>
                  </div>
                )}
                {result.extractedData.vinPlate && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">VIN/Plate:</span>
                    <span className="font-medium" data-testid="text-extracted-vin">{result.extractedData.vinPlate}</span>
                  </div>
                )}
                {result.extractedData.address && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Address:</span>
                    <span className="font-medium" data-testid="text-extracted-address">{result.extractedData.address}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View raw text
            </summary>
            <pre 
              className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32 overflow-y-auto"
              data-testid="text-ocr-raw"
            >
              {result.text}
            </pre>
          </details>

          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            className="w-full"
            data-testid="button-rescan-document"
          >
            <ScanText className="w-4 h-4 mr-2" />
            Re-scan
          </Button>
        </Card>
      )}
    </div>
  );
}
