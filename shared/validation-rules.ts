import { z } from "zod";

export type PermitType = "yearly" | "temporary" | "seasonal";

export interface ValidationRule {
  field: string;
  label: string;
  required: boolean;
  permitTypes: PermitType[];
  category: "profile" | "event" | "documents" | "certifications";
  description?: string;
  validationFn?: (value: any) => boolean;
}

export interface TownRequirement {
  key: string;
  label: string;
  required: boolean;
  documentType?: string;
}

export const baseProfileRules: ValidationRule[] = [
  {
    field: "business_name",
    label: "Business Name",
    required: true,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "profile",
  },
  {
    field: "owner_name",
    label: "Owner Name",
    required: true,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "profile",
  },
  {
    field: "mailing_address",
    label: "Mailing Address",
    required: true,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "profile",
  },
  {
    field: "phone",
    label: "Phone Number",
    required: true,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "profile",
  },
  {
    field: "email",
    label: "Email Address",
    required: true,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "profile",
  },
  {
    field: "vehicle_vin",
    label: "Vehicle VIN",
    required: true,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
    description: "Required for yearly and seasonal permits",
  },
  {
    field: "vehicle_plate",
    label: "License Plate",
    required: true,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
  },
  {
    field: "vehicle_make",
    label: "Vehicle Make",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
  },
  {
    field: "vehicle_model",
    label: "Vehicle Model",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
  },
  {
    field: "vehicle_year",
    label: "Vehicle Year",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
  },
  {
    field: "commissary_name",
    label: "Commissary Name",
    required: true,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
    description: "Required for yearly and seasonal permits",
  },
  {
    field: "commissary_address",
    label: "Commissary Address",
    required: true,
    permitTypes: ["yearly", "seasonal"],
    category: "profile",
  },
];

export const eventRules: ValidationRule[] = [
  {
    field: "eventName",
    label: "Event Name",
    required: true,
    permitTypes: ["temporary"],
    category: "event",
    description: "Required for temporary event permits",
  },
  {
    field: "eventDate",
    label: "Event Date",
    required: true,
    permitTypes: ["temporary"],
    category: "event",
  },
  {
    field: "eventAddress",
    label: "Event Location",
    required: true,
    permitTypes: ["temporary"],
    category: "event",
  },
  {
    field: "eventCity",
    label: "Event City",
    required: true,
    permitTypes: ["temporary"],
    category: "event",
  },
  {
    field: "eventContactName",
    label: "Event Contact Name",
    required: false,
    permitTypes: ["temporary"],
    category: "event",
  },
  {
    field: "eventContactPhone",
    label: "Event Contact Phone",
    required: false,
    permitTypes: ["temporary"],
    category: "event",
  },
];

export const documentRules: ValidationRule[] = [
  {
    field: "coi",
    label: "Certificate of Insurance",
    required: false,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "documents",
    description: "General liability insurance certificate",
  },
  {
    field: "health_permit",
    label: "Health Department Permit",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "documents",
  },
  {
    field: "fire_safety",
    label: "Fire Safety Certificate",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "documents",
  },
  {
    field: "vehicle_registration",
    label: "Vehicle Registration",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "documents",
  },
  {
    field: "commissary_letter",
    label: "Commissary Agreement Letter",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "documents",
  },
  {
    field: "menu",
    label: "Menu",
    required: false,
    permitTypes: ["yearly", "temporary", "seasonal"],
    category: "documents",
  },
];

export const certificationRules: ValidationRule[] = [
  {
    field: "food_handler_cert",
    label: "Food Handler Certificate",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "certifications",
  },
  {
    field: "servsafe_cert",
    label: "ServSafe Certification",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "certifications",
  },
  {
    field: "propane_cert",
    label: "Propane/QFO Certificate",
    required: false,
    permitTypes: ["yearly", "seasonal"],
    category: "certifications",
    description: "Required if using propane equipment",
  },
];

export function getTownRequirements(requirementsJson: any): TownRequirement[] {
  if (!requirementsJson) return [];
  
  const requirements: TownRequirement[] = [];
  
  if (requirementsJson.coi) {
    requirements.push({
      key: "coi",
      label: "Certificate of Insurance",
      required: true,
      documentType: "insurance",
    });
  }
  
  if (requirementsJson.background) {
    requirements.push({
      key: "background",
      label: "Background Check",
      required: true,
    });
  }
  
  if (requirementsJson.healthInspection) {
    requirements.push({
      key: "health_inspection",
      label: "Health Inspection Certificate",
      required: true,
      documentType: "health",
    });
  }
  
  if (requirementsJson.fireInspection) {
    requirements.push({
      key: "fire_inspection",
      label: "Fire Inspection Certificate",
      required: true,
      documentType: "fire",
    });
  }
  
  if (requirementsJson.vehicleInspection) {
    requirements.push({
      key: "vehicle_inspection",
      label: "Vehicle Inspection",
      required: true,
      documentType: "vehicle",
    });
  }
  
  if (requirementsJson.commissaryLetter) {
    requirements.push({
      key: "commissary_letter",
      label: "Commissary Agreement Letter",
      required: true,
      documentType: "commissary",
    });
  }
  
  if (requirementsJson.menuRequired) {
    requirements.push({
      key: "menu",
      label: "Menu",
      required: true,
      documentType: "menu",
    });
  }
  
  return requirements;
}

export interface ValidationResult {
  isValid: boolean;
  missingRequired: ValidationIssue[];
  missingOptional: ValidationIssue[];
  townRequirements: ValidationIssue[];
  completionPercentage: number;
}

export interface ValidationIssue {
  field: string;
  label: string;
  category: string;
  description?: string;
  isTownSpecific?: boolean;
}

export function getAllRulesForPermitType(permitType: PermitType): ValidationRule[] {
  const allRules = [
    ...baseProfileRules,
    ...eventRules,
    ...documentRules,
    ...certificationRules,
  ];
  
  return allRules.filter(rule => rule.permitTypes.includes(permitType));
}
