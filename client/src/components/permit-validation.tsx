import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, FileWarning, Info, User, Calendar, FileText, Award } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface ValidationIssue {
  field: string;
  label: string;
  category: string;
  description?: string;
  isTownSpecific?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  missingRequired: ValidationIssue[];
  missingOptional: ValidationIssue[];
  townRequirements: ValidationIssue[];
  completionPercentage: number;
  townName: string | null;
  permitType: string;
}

interface PermitValidationProps {
  permitId: string;
  compact?: boolean;
}

const categoryIcons: Record<string, typeof User> = {
  profile: User,
  event: Calendar,
  documents: FileText,
  certifications: Award,
};

const categoryLabels: Record<string, string> = {
  profile: "Profile Information",
  event: "Event Details",
  documents: "Documents",
  certifications: "Certifications",
};

export function PermitValidation({ permitId, compact = false }: PermitValidationProps) {
  const { data: validation, isLoading, error } = useQuery<ValidationResult>({
    queryKey: ["/api/permits", permitId, "validate"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-2 bg-muted rounded w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !validation) {
    return null;
  }

  const groupByCategory = (issues: ValidationIssue[]) => {
    return issues.reduce((acc, issue) => {
      const cat = issue.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(issue);
      return acc;
    }, {} as Record<string, ValidationIssue[]>);
  };

  const requiredByCategory = groupByCategory(validation.missingRequired);
  const optionalByCategory = groupByCategory(validation.missingOptional);
  const townByCategory = groupByCategory(validation.townRequirements);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {validation.isValid ? (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Ready
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
            <AlertCircle className="w-3 h-3 mr-1" />
            {validation.missingRequired.length} missing
          </Badge>
        )}
        <Progress value={validation.completionPercentage} className="w-20 h-2" />
        <span className="text-xs text-muted-foreground">{validation.completionPercentage}%</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            {validation.isValid ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
            Application Status
          </CardTitle>
          <Badge variant={validation.isValid ? "default" : "secondary"}>
            {validation.completionPercentage}% Complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={validation.completionPercentage} className="h-2" />
        
        {validation.isValid ? (
          <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Ready to Submit</p>
              <p className="text-sm opacity-80">All required information has been provided.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Missing Required Information</p>
              <p className="text-sm opacity-80">
                Please provide the following before submitting your application.
              </p>
            </div>
          </div>
        )}

        {validation.missingRequired.length > 0 && (
          <Accordion type="single" collapsible defaultValue="required">
            <AccordionItem value="required" className="border-destructive/30">
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileWarning className="w-4 h-4 text-destructive" />
                  <span>Required Fields ({validation.missingRequired.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {Object.entries(requiredByCategory).map(([category, issues]) => {
                    const Icon = categoryIcons[category] || Info;
                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          <Icon className="w-3 h-3" />
                          {categoryLabels[category] || category}
                        </div>
                        <ul className="space-y-1 pl-4">
                          {issues.map((issue) => (
                            <li 
                              key={issue.field} 
                              className="text-sm flex items-start gap-2"
                              data-testid={`validation-issue-${issue.field}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 flex-shrink-0" />
                              <div>
                                <span>{issue.label}</span>
                                {issue.description && (
                                  <p className="text-xs text-muted-foreground">{issue.description}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {validation.townRequirements.length > 0 && validation.townName && (
          <Accordion type="single" collapsible>
            <AccordionItem value="town" className="border-primary/30">
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-primary" />
                  <span>{validation.townName} Requirements ({validation.townRequirements.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1 pt-2 pl-4">
                  {validation.townRequirements.map((issue) => (
                    <li 
                      key={issue.field} 
                      className="text-sm flex items-start gap-2"
                      data-testid={`town-requirement-${issue.field}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <span>{issue.label}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {validation.missingOptional.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="optional" className="border-muted">
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span>Optional Fields ({validation.missingOptional.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {Object.entries(optionalByCategory).map(([category, issues]) => {
                    const Icon = categoryIcons[category] || Info;
                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          <Icon className="w-3 h-3" />
                          {categoryLabels[category] || category}
                        </div>
                        <ul className="space-y-1 pl-4">
                          {issues.map((issue) => (
                            <li 
                              key={issue.field} 
                              className="text-sm text-muted-foreground flex items-start gap-2"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mt-1.5 flex-shrink-0" />
                              <span>{issue.label}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
