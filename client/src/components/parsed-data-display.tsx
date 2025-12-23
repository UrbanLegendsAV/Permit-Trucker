import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, AlertCircle, HelpCircle, ChevronDown, Sparkles, Check } from "lucide-react";
import { useState } from "react";

interface ConfidenceField {
  value: string | string[] | null;
  confidence: number | "high" | "medium" | "low";
  source_text: string | null;
  status?: "verified" | "needs_review";
}

interface ParsedGoldenData {
  contact_info?: Record<string, ConfidenceField>;
  operations?: Record<string, ConfidenceField>;
  safety?: Record<string, ConfidenceField>;
  menu_and_prep?: Record<string, ConfidenceField>;
  license_info?: Record<string, ConfidenceField>;
  _meta?: {
    document_type?: string;
    fields_found?: number;
    high_confidence_count?: number;
    medium_confidence_count?: number;
    low_confidence_count?: number;
  };
  [key: string]: unknown;
}

interface ParsedDataDisplayProps {
  data: ParsedGoldenData | null;
  onVerify?: (category: string, field: string, verified: boolean) => void;
  showAllFields?: boolean;
  profileId?: string;
}

const FIELD_LABELS: Record<string, Record<string, string>> = {
  contact_info: {
    business_name: "Business Name",
    applicant_name: "Owner/Applicant",
    phone: "Phone",
    email: "Email",
    mailing_address: "Address"
  },
  operations: {
    water_supply_type: "Water Supply",
    toilet_facilities: "Toilet Facilities",
    sanitizer_type: "Sanitizer Type",
    sanitizing_method: "Sanitizing Method"
  },
  safety: {
    temperature_monitoring_method: "Temp Monitoring",
    cold_storage_method: "Cold Storage",
    hot_holding_method: "Hot Holding",
    waste_water_disposal: "Waste Water"
  },
  menu_and_prep: {
    food_items_list: "Menu Items",
    food_source_location: "Food Source",
    prep_location: "Prep Location"
  },
  license_info: {
    license_type: "License Type",
    license_number: "License Number",
    valid_from: "Valid From",
    valid_thru: "Valid Through",
    issuing_authority: "Issuing Authority",
    towns_covered: "Towns Covered"
  }
};

const CATEGORY_TITLES: Record<string, string> = {
  contact_info: "Contact Info",
  operations: "Operations",
  safety: "Safety",
  menu_and_prep: "Menu & Prep",
  license_info: "License Info"
};

function getConfidenceLevel(confidence: number | "high" | "medium" | "low"): "high" | "medium" | "low" {
  if (typeof confidence === "string") return confidence;
  if (confidence >= 80) return "high";
  if (confidence >= 50) return "medium";
  return "low";
}

function ConfidenceIcon({ confidence, status }: { confidence: number | "high" | "medium" | "low"; status?: "verified" | "needs_review" }) {
  const level = getConfidenceLevel(confidence);
  
  if (status === "verified") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
  }
  if (level === "high") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
  }
  if (level === "medium") {
    return <AlertCircle className="w-3.5 h-3.5 text-yellow-600" />;
  }
  return <HelpCircle className="w-3.5 h-3.5 text-red-500" />;
}

function FieldItem({ 
  label, 
  field, 
  onVerify,
  showMissing = false
}: { 
  label: string; 
  field: ConfidenceField | undefined;
  onVerify?: (verified: boolean) => void;
  showMissing?: boolean;
}) {
  const isMissing = !field || field.value === null || field.value === undefined || field.value === "";
  
  if (isMissing && !showMissing) return null;

  const displayValue = isMissing 
    ? "Not found - needs review"
    : Array.isArray(field?.value) 
      ? field.value.join(", ") 
      : field?.value;

  const confidence = field?.confidence ?? 0;
  const confidenceLevel = getConfidenceLevel(confidence);
  const isVerified = field?.status === "verified";
  const needsReview = isMissing || (confidenceLevel !== "high" && !isVerified);

  return (
    <div className={`flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0 ${needsReview && !isVerified ? "bg-destructive/5 -mx-2 px-2 rounded" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <ConfidenceIcon confidence={confidence} status={field?.status} />
          <span className="text-xs text-muted-foreground">{label}</span>
          {typeof confidence === "number" && confidence > 0 && (
            <span className="text-[10px] text-muted-foreground">({confidence}%)</span>
          )}
        </div>
        <p className={`text-sm truncate ${isMissing ? "text-muted-foreground italic" : ""}`}>{displayValue}</p>
      </div>
      {!isMissing && onVerify && (
        <Button 
          variant={isVerified ? "default" : "ghost"} 
          size="icon"
          className={`h-6 w-6 ${isVerified ? "bg-green-600 text-white" : ""}`}
          onClick={() => onVerify(!isVerified)}
          data-testid={`button-verify-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <Check className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

function CategorySection({ 
  categoryKey,
  fields, 
  onVerify,
  showAllFields = false
}: { 
  categoryKey: string;
  fields: Record<string, ConfidenceField> | undefined;
  onVerify?: (category: string, field: string, verified: boolean) => void;
  showAllFields?: boolean;
}) {
  const labels = FIELD_LABELS[categoryKey] || {};
  const title = CATEGORY_TITLES[categoryKey] || categoryKey;
  
  if (!fields) return null;
  
  const hasAnyValue = Object.values(fields).some(f => f?.value !== null && f?.value !== undefined);
  if (!hasAnyValue && !showAllFields) return null;

  const needsReviewCount = Object.values(fields).filter(f => {
    if (!f?.value) return true;
    const level = getConfidenceLevel(f.confidence);
    return level !== "high" && f.status !== "verified";
  }).length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</h4>
        {needsReviewCount > 0 && (
          <Badge variant="outline" className="text-xs border-red-500 text-red-500">
            {needsReviewCount} needs review
          </Badge>
        )}
      </div>
      <div className="space-y-0">
        {Object.entries(fields).map(([key, field]) => (
          <FieldItem 
            key={key} 
            label={labels[key] || key} 
            field={field}
            onVerify={onVerify ? (verified: boolean) => onVerify(categoryKey, key, verified) : undefined}
            showMissing={showAllFields}
          />
        ))}
      </div>
    </div>
  );
}

export function ParsedDataDisplay({ data, onVerify, showAllFields = false }: ParsedDataDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!data) return null;

  const hasNewFormat = data.contact_info || data.operations || data.safety || data.menu_and_prep || data.license_info;
  
  if (!hasNewFormat) {
    const entries = Object.entries(data).filter(([k]) => !k.startsWith("_"));
    if (entries.length === 0) return null;

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="overflow-visible">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer py-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI-Extracted Data
                </CardTitle>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 px-4 pb-3">
              <div className="space-y-1 text-sm">
                {entries.slice(0, 10).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground text-xs">{key.replace(/_/g, " ")}</span>
                    <span className="text-right truncate max-w-[60%]">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  const meta = data._meta;
  const totalLow = (meta?.low_confidence_count || 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-visible">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                AI-Extracted Data
                {meta && (
                  <Badge variant="secondary" className="text-xs">
                    {meta.fields_found} fields
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {totalLow > 0 && (
                  <Badge variant="outline" className="text-xs border-red-500 text-red-500">
                    {totalLow} to verify
                  </Badge>
                )}
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4 space-y-4">
            {data.contact_info && (
              <CategorySection categoryKey="contact_info" fields={data.contact_info} onVerify={onVerify} showAllFields={showAllFields} />
            )}
            {data.license_info && (
              <CategorySection categoryKey="license_info" fields={data.license_info} onVerify={onVerify} showAllFields={showAllFields} />
            )}
            {data.operations && (
              <CategorySection categoryKey="operations" fields={data.operations} onVerify={onVerify} showAllFields={showAllFields} />
            )}
            {data.safety && (
              <CategorySection categoryKey="safety" fields={data.safety} onVerify={onVerify} showAllFields={showAllFields} />
            )}
            {data.menu_and_prep && (
              <CategorySection categoryKey="menu_and_prep" fields={data.menu_and_prep} onVerify={onVerify} showAllFields={showAllFields} />
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
