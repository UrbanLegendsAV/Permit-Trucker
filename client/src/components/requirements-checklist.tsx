import { Check, Info, ExternalLink, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Town } from "@shared/schema";

interface RequirementsChecklistProps {
  town: Town;
  progress: Record<string, boolean>;
  onToggle: (key: string) => void;
}

interface RequirementItem {
  key: string;
  label: string;
  description: string;
  required: boolean;
  agency?: string;
}

const requirementDetails: Record<string, { label: string; description: string; agency?: string }> = {
  coi: {
    label: "Certificate of Insurance (COI)",
    description: "General liability insurance certificate naming the town as additional insured. Typically $1M per occurrence.",
    agency: "Insurance Provider",
  },
  background: {
    label: "Background Check",
    description: "Criminal background check for the applicant. Processing time varies by jurisdiction.",
    agency: "Police Department",
  },
  healthInspection: {
    label: "Health Department Inspection",
    description: "Food safety inspection of your mobile unit. Schedule in advance.",
    agency: "Health Department",
  },
  fireInspection: {
    label: "Fire Safety Inspection",
    description: "Fire extinguisher, suppression system, and propane inspection.",
    agency: "Fire Department",
  },
  vehicleInspection: {
    label: "Vehicle Inspection",
    description: "DOT compliance and vehicle safety inspection.",
    agency: "DMV/Police",
  },
  commissaryLetter: {
    label: "Commissary Agreement",
    description: "Letter from licensed commissary kitchen confirming food storage and prep agreement.",
    agency: "Commissary",
  },
  menuRequired: {
    label: "Menu Submission",
    description: "Complete menu with all items, ingredients, and pricing.",
  },
};

export function RequirementsChecklist({ town, progress, onToggle }: RequirementsChecklistProps) {
  const requirements = town.requirementsJson || {};
  
  const items: RequirementItem[] = Object.entries(requirements)
    .filter(([key, value]) => typeof value === "boolean" && value && requirementDetails[key])
    .map(([key]) => ({
      key,
      required: true,
      ...requirementDetails[key],
    }));

  const completedCount = items.filter(item => progress[item.key]).length;
  const progressPercent = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  const fees = requirements.fees as { yearly?: number; temporary?: number; seasonal?: number } | undefined;

  return (
    <div className="space-y-4" data-testid="requirements-checklist">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Requirements Checklist</h3>
        <Badge variant="outline" data-testid="badge-progress-count">
          {completedCount} / {items.length}
        </Badge>
      </div>

      <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid="progress-bar">
        <div 
          className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
          data-testid="progress-bar-fill"
        />
      </div>

      {items.length === 0 ? (
        <Card className="p-6 text-center" data-testid="requirements-unknown">
          <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
          <p className="font-medium">Requirements Unknown</p>
          <p className="text-sm text-muted-foreground mt-1">
            Be a pioneer! Help us gather requirements for {town.townName}.
          </p>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {items.map((item) => (
            <AccordionItem 
              key={item.key} 
              value={item.key}
              className="border rounded-lg overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <Checkbox
                  id={item.key}
                  checked={progress[item.key] || false}
                  onCheckedChange={() => onToggle(item.key)}
                  data-testid={`checkbox-${item.key}`}
                />
                <label
                  htmlFor={item.key}
                  className={`flex-1 font-medium cursor-pointer ${
                    progress[item.key] ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {item.label}
                </label>
                <AccordionTrigger className="p-0 hover:no-underline">
                  <Info className="w-4 h-4 text-muted-foreground" />
                </AccordionTrigger>
              </div>
              <AccordionContent className="px-4 pb-3 pt-0">
                <div className="pl-7 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                  {item.agency && (
                    <Badge variant="secondary" className="text-xs">
                      Contact: {item.agency}
                    </Badge>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {fees && Object.keys(fees).length > 0 && (
        <Card className="p-4" data-testid="fees-card">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Estimated Fees
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            {fees.yearly && (
              <div className="p-2 bg-muted rounded-lg" data-testid="fee-yearly">
                <p className="text-lg font-bold">${fees.yearly}</p>
                <p className="text-xs text-muted-foreground">Yearly</p>
              </div>
            )}
            {fees.temporary && (
              <div className="p-2 bg-muted rounded-lg" data-testid="fee-temporary">
                <p className="text-lg font-bold">${fees.temporary}</p>
                <p className="text-xs text-muted-foreground">Temporary</p>
              </div>
            )}
            {fees.seasonal && (
              <div className="p-2 bg-muted rounded-lg" data-testid="fee-seasonal">
                <p className="text-lg font-bold">${fees.seasonal}</p>
                <p className="text-xs text-muted-foreground">Seasonal</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center italic">
        Always verify requirements directly with official town sources.
      </p>
    </div>
  );
}
