import {
  ValidationResult,
  ValidationIssue,
  ValidationRule,
  PermitType,
  baseProfileRules,
  eventRules,
  documentRules,
  certificationRules,
  getTownRequirements,
  getAllRulesForPermitType,
} from "../../shared/validation-rules";

interface ProfileData {
  parsedDataLog?: Record<string, unknown> | null;
  uploadsJson?: { documents: Array<{ name: string; type: string; url: string; folder?: string }> } | null;
  hasPropane?: boolean;
  hasQfoCert?: boolean;
  commissaryName?: string | null;
  commissaryAddress?: string | null;
}

interface PermitData {
  permitType: PermitType;
  eventName?: string | null;
  eventDate?: Date | null;
  eventEndDate?: Date | null;
  eventAddress?: string | null;
  eventCity?: string | null;
  eventContactName?: string | null;
  eventContactPhone?: string | null;
}

interface TownData {
  requirementsJson?: {
    coi?: boolean;
    background?: boolean;
    healthInspection?: boolean;
    fireInspection?: boolean;
    vehicleInspection?: boolean;
    commissaryLetter?: boolean;
    menuRequired?: boolean;
  } | null;
}

function getValueFromParsedData(
  parsedData: Record<string, unknown> | null | undefined,
  field: string
): any {
  if (!parsedData) return null;
  
  const fieldMappings: Record<string, string[]> = {
    business_name: ["contact_info.business_name", "business_name"],
    owner_name: ["contact_info.owner_name", "owner_name", "contact_info.applicant_name"],
    mailing_address: ["contact_info.mailing_address", "mailing_address", "contact_info.address"],
    phone: ["contact_info.phone", "phone", "contact_info.telephone"],
    email: ["contact_info.email", "email"],
    vehicle_vin: ["vehicle_info.vin", "vin", "vehicle_vin"],
    vehicle_plate: ["vehicle_info.plate_number", "plate", "license_plate"],
    vehicle_make: ["vehicle_info.make", "vehicle_make"],
    vehicle_model: ["vehicle_info.model", "vehicle_model"],
    vehicle_year: ["vehicle_info.year", "vehicle_year"],
    commissary_name: ["commissary_info.name", "commissary_name"],
    commissary_address: ["commissary_info.address", "commissary_address"],
    food_handler_cert: ["certifications.food_handler", "food_handler_cert"],
    servsafe_cert: ["certifications.servsafe", "servsafe_cert"],
    propane_cert: ["certifications.propane", "propane_cert", "certifications.qfo"],
  };
  
  const paths = fieldMappings[field] || [field];
  
  for (const path of paths) {
    const parts = path.split(".");
    let value: any = parsedData;
    
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = null;
        break;
      }
    }
    
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  
  return null;
}

function hasDocument(
  documents: Array<{ name: string; type: string; folder?: string }> | undefined,
  documentType: string
): boolean {
  if (!documents || documents.length === 0) return false;
  
  const typePatterns: Record<string, string[]> = {
    coi: ["insurance", "coi", "liability", "certificate of insurance"],
    health_permit: ["health", "permit", "license"],
    fire_safety: ["fire", "safety", "inspection"],
    vehicle_registration: ["registration", "vehicle", "dmv"],
    commissary_letter: ["commissary", "agreement", "letter"],
    menu: ["menu"],
    food_handler_cert: ["food handler", "certificate", "training"],
    servsafe_cert: ["servsafe", "food safety"],
    propane_cert: ["propane", "qfo", "gas"],
    insurance: ["insurance", "coi", "liability"],
    health: ["health"],
    fire: ["fire"],
    vehicle: ["vehicle", "registration"],
  };
  
  const patterns = typePatterns[documentType] || [documentType];
  
  return documents.some(doc => {
    const name = doc.name.toLowerCase();
    const folder = doc.folder?.toLowerCase() || "";
    const type = doc.type.toLowerCase();
    
    return patterns.some(pattern => 
      name.includes(pattern) || folder.includes(pattern) || type.includes(pattern)
    );
  });
}

export function validatePermitApplication(
  profile: ProfileData,
  permit: PermitData,
  town: TownData | null
): ValidationResult {
  const permitType = permit.permitType;
  const parsedData = profile.parsedDataLog as Record<string, unknown> | null;
  const documents = profile.uploadsJson?.documents;
  
  const missingRequired: ValidationIssue[] = [];
  const missingOptional: ValidationIssue[] = [];
  const townRequirements: ValidationIssue[] = [];
  
  const applicableRules = getAllRulesForPermitType(permitType);
  let totalFields = 0;
  let completedFields = 0;
  
  for (const rule of applicableRules) {
    if (rule.category === "profile") {
      totalFields++;
      const value = getValueFromParsedData(parsedData, rule.field);
      
      if (!value) {
        if (rule.required) {
          missingRequired.push({
            field: rule.field,
            label: rule.label,
            category: rule.category,
            description: rule.description,
          });
        } else {
          missingOptional.push({
            field: rule.field,
            label: rule.label,
            category: rule.category,
            description: rule.description,
          });
        }
      } else {
        completedFields++;
      }
    }
    
    if (rule.category === "event" && permitType === "temporary") {
      totalFields++;
      const eventValue = (permit as any)[rule.field];
      
      if (!eventValue) {
        if (rule.required) {
          missingRequired.push({
            field: rule.field,
            label: rule.label,
            category: rule.category,
            description: rule.description,
          });
        } else {
          missingOptional.push({
            field: rule.field,
            label: rule.label,
            category: rule.category,
            description: rule.description,
          });
        }
      } else {
        completedFields++;
      }
    }
  }
  
  if (town?.requirementsJson) {
    const townReqs = getTownRequirements(town.requirementsJson);
    
    for (const req of townReqs) {
      totalFields++;
      
      if (req.documentType) {
        const hasDoc = hasDocument(documents, req.documentType);
        
        if (!hasDoc) {
          townRequirements.push({
            field: req.key,
            label: req.label,
            category: "documents",
            isTownSpecific: true,
          });
        } else {
          completedFields++;
        }
      } else {
        townRequirements.push({
          field: req.key,
          label: req.label,
          category: "certifications",
          isTownSpecific: true,
        });
      }
    }
  }
  
  if (profile.hasPropane) {
    totalFields++;
    const hasPropaneCert = profile.hasQfoCert || 
      getValueFromParsedData(parsedData, "propane_cert") ||
      hasDocument(documents, "propane_cert");
    
    if (!hasPropaneCert) {
      missingRequired.push({
        field: "propane_cert",
        label: "Propane/QFO Certificate",
        category: "certifications",
        description: "Required because your vehicle uses propane",
      });
    } else {
      completedFields++;
    }
  }
  
  const completionPercentage = totalFields > 0 
    ? Math.round((completedFields / totalFields) * 100) 
    : 0;
  
  return {
    isValid: missingRequired.length === 0 && townRequirements.filter(r => 
      town?.requirementsJson && (town.requirementsJson as any)[r.field.replace("_", "")]
    ).length === 0,
    missingRequired,
    missingOptional,
    townRequirements,
    completionPercentage,
  };
}

export function getRequiredFieldsForPermitType(
  permitType: PermitType,
  townRequirements?: TownData["requirementsJson"]
): { field: string; label: string; category: string }[] {
  const rules = getAllRulesForPermitType(permitType).filter(r => r.required);
  
  const fields: { field: string; label: string; category: string }[] = rules.map(r => ({
    field: r.field,
    label: r.label,
    category: r.category,
  }));
  
  if (townRequirements) {
    const townReqs = getTownRequirements(townRequirements);
    for (const req of townReqs) {
      fields.push({
        field: req.key,
        label: req.label,
        category: "documents",
      });
    }
  }
  
  return fields;
}
