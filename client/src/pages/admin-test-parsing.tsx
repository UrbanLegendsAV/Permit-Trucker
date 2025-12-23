import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, AlertCircle, HelpCircle, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface ConfidenceField {
  value: string | string[] | null;
  confidence: "high" | "medium" | "low";
  source_text: string | null;
}

interface ParsedGoldenData {
  contact_info: {
    business_name: ConfidenceField;
    applicant_name: ConfidenceField;
    phone: ConfidenceField;
    email: ConfidenceField;
    mailing_address: ConfidenceField;
  };
  operations: {
    water_supply_type: ConfidenceField;
    toilet_facilities: ConfidenceField;
    sanitizer_type: ConfidenceField;
    sanitizing_method: ConfidenceField;
  };
  safety: {
    temperature_monitoring_method: ConfidenceField;
    cold_storage_method: ConfidenceField;
    hot_holding_method: ConfidenceField;
    waste_water_disposal: ConfidenceField;
  };
  menu_and_prep: {
    food_items_list: ConfidenceField;
    food_source_location: ConfidenceField;
    prep_location: ConfidenceField;
  };
  license_info: {
    license_type: ConfidenceField;
    license_number: ConfidenceField;
    valid_from: ConfidenceField;
    valid_thru: ConfidenceField;
    issuing_authority: ConfidenceField;
    towns_covered: ConfidenceField;
  };
  raw_text_extract: string;
  _meta: {
    document_type: string;
    fields_found: number;
    high_confidence_count: number;
    medium_confidence_count: number;
    low_confidence_count: number;
  };
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  if (confidence === "high") {
    return (
      <Badge variant="default" className="bg-green-600 text-white">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        High
      </Badge>
    );
  }
  if (confidence === "medium") {
    return (
      <Badge variant="secondary" className="bg-yellow-500 text-black">
        <AlertCircle className="w-3 h-3 mr-1" />
        Medium
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-500 text-red-500">
      <HelpCircle className="w-3 h-3 mr-1" />
      Low - Verify
    </Badge>
  );
}

function FieldRow({ label, field }: { label: string; field: ConfidenceField }) {
  const displayValue = field.value === null 
    ? "Not found" 
    : Array.isArray(field.value) 
      ? field.value.join(", ") 
      : field.value;

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <ConfidenceBadge confidence={field.confidence} />
      </div>
      <span className={`text-sm ${field.value === null ? "text-muted-foreground italic" : ""}`}>
        {displayValue}
      </span>
      {field.source_text && (
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded mt-1">
          Source: "{field.source_text}"
        </span>
      )}
    </div>
  );
}

function CategorySection({ 
  title, 
  fields, 
  fieldLabels 
}: { 
  title: string; 
  fields: Record<string, ConfidenceField>; 
  fieldLabels: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {Object.entries(fields).map(([key, field]) => (
          <FieldRow key={key} label={fieldLabels[key] || key} field={field} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminTestParsing() {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedGoldenData | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const { toast } = useToast();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsedData(null);
      setRawText("");
    }
  }, []);

  const handleParse = useCallback(async () => {
    if (!file) return;

    setIsParsing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = (e.target?.result as string)?.split(",")[1];
        if (!base64Data) {
          toast({ title: "Error", description: "Failed to read file", variant: "destructive" });
          setIsParsing(false);
          return;
        }

        try {
          const response = await fetch("/api/documents/parse-gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              documentData: base64Data,
              mimeType: file.type
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to parse: ${response.statusText}`);
          }

          const data = await response.json() as { parsedData: ParsedGoldenData };
          setParsedData(data.parsedData);
          setRawText(data.parsedData.raw_text_extract || "");
          
          toast({ 
            title: "Parsing Complete", 
            description: `Found ${data.parsedData._meta?.fields_found || 0} fields` 
          });
        } catch (err: unknown) {
          const error = err as Error;
          toast({ 
            title: "Parsing Failed", 
            description: error.message || "Unknown error", 
            variant: "destructive" 
          });
        }
        setIsParsing(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ title: "Error", description: "Failed to process file", variant: "destructive" });
      setIsParsing(false);
    }
  }, [file, toast]);

  const contactLabels = {
    business_name: "Business Name",
    applicant_name: "Applicant/Owner Name",
    phone: "Phone Number",
    email: "Email Address",
    mailing_address: "Mailing Address"
  };

  const operationsLabels = {
    water_supply_type: "Water Supply Type",
    toilet_facilities: "Toilet Facilities",
    sanitizer_type: "Sanitizer Type",
    sanitizing_method: "Sanitizing Method"
  };

  const safetyLabels = {
    temperature_monitoring_method: "Temperature Monitoring",
    cold_storage_method: "Cold Storage Method",
    hot_holding_method: "Hot Holding Method",
    waste_water_disposal: "Waste Water Disposal"
  };

  const menuLabels = {
    food_items_list: "Food Items",
    food_source_location: "Food Source/Purchase Location",
    prep_location: "Prep Location"
  };

  const licenseLabels = {
    license_type: "License Type",
    license_number: "License Number",
    valid_from: "Valid From",
    valid_thru: "Valid Through",
    issuing_authority: "Issuing Authority",
    towns_covered: "Towns Covered"
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 p-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Document Parsing Test</h1>
        </div>
      </header>

      <main className="p-4 pb-24 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Document
            </CardTitle>
            <CardDescription>
              Upload a PDF or image to test the Golden Questions parsing with confidence scores
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
              data-testid="input-file-upload"
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
            <Button 
              onClick={handleParse} 
              disabled={!file || isParsing}
              className="w-full"
              data-testid="button-parse"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Parsing with Gemini...
                </>
              ) : (
                "Parse Document"
              )}
            </Button>
          </CardContent>
        </Card>

        {parsedData && (
          <Tabs defaultValue="golden" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="golden" data-testid="tab-golden">
                Golden Categories
              </TabsTrigger>
              <TabsTrigger value="raw" data-testid="tab-raw">
                Raw Text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="golden" className="space-y-4 mt-4">
              {parsedData._meta && (
                <Card className="bg-muted/50">
                  <CardContent className="py-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span>Type: <strong>{parsedData._meta.document_type}</strong></span>
                      <span>Fields: <strong>{parsedData._meta.fields_found}</strong></span>
                      <span className="text-green-600">High: {parsedData._meta.high_confidence_count}</span>
                      <span className="text-yellow-600">Medium: {parsedData._meta.medium_confidence_count}</span>
                      <span className="text-red-600">Low: {parsedData._meta.low_confidence_count}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {parsedData.contact_info && (
                <CategorySection 
                  title="Contact Info" 
                  fields={parsedData.contact_info} 
                  fieldLabels={contactLabels} 
                />
              )}
              {parsedData.operations && (
                <CategorySection 
                  title="Operations" 
                  fields={parsedData.operations} 
                  fieldLabels={operationsLabels} 
                />
              )}
              {parsedData.safety && (
                <CategorySection 
                  title="Safety" 
                  fields={parsedData.safety} 
                  fieldLabels={safetyLabels} 
                />
              )}
              {parsedData.menu_and_prep && (
                <CategorySection 
                  title="Menu & Prep" 
                  fields={parsedData.menu_and_prep} 
                  fieldLabels={menuLabels} 
                />
              )}
              {parsedData.license_info && (
                <CategorySection 
                  title="License Info" 
                  fields={parsedData.license_info} 
                  fieldLabels={licenseLabels} 
                />
              )}
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Raw Text Extract</CardTitle>
                  <CardDescription>First 500 characters extracted from document</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded">
                      {rawText || "No raw text extracted"}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
