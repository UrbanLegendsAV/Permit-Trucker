import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";
import type { TownForm, DataVault } from "@shared/schema";

export interface FieldMapping {
  page: number;
  x: number;
  y: number;
  fontSize?: number;
  maxWidth?: number;
  isCheckbox?: boolean;
  checkboxValue?: string;
}

export interface FormTemplate {
  formId: string;
  formName: string;
  townName: string;
  pdfPath: string;
  useAcroForm?: boolean;
  fields: Record<string, FieldMapping>;
  acroFieldMap?: Record<string, string>;
}

interface ParsedFieldValue {
  value: string | null;
  status?: string;
  confidence?: number;
  source_text?: string | null;
}

export type ParsedUserData = {
  _meta?: Record<string, unknown>;
  _parsedAt?: string;
  _parsedBy?: string;
  raw_text_extract?: string;
  contact_info?: {
    business_name?: ParsedFieldValue;
    owner_name?: ParsedFieldValue;
    applicant_name?: ParsedFieldValue;
    email?: ParsedFieldValue;
    phone?: ParsedFieldValue;
    address?: ParsedFieldValue;
    mailing_address?: ParsedFieldValue;
    city?: ParsedFieldValue;
    state?: ParsedFieldValue;
    zip?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  vehicle_info?: {
    trailer_make?: ParsedFieldValue;
    trailer_model?: ParsedFieldValue;
    trailer_year?: ParsedFieldValue;
    vin?: ParsedFieldValue;
    license_plate?: ParsedFieldValue;
    dimensions?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  operations?: {
    sanitizer_type?: ParsedFieldValue;
    sanitizing_method?: ParsedFieldValue;
    toilet_facilities?: ParsedFieldValue;
    water_supply_type?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  safety?: {
    hot_holding_method?: ParsedFieldValue;
    cold_storage_method?: ParsedFieldValue;
    waste_water_disposal?: ParsedFieldValue;
    temperature_monitoring_method?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  license_info?: {
    license_type?: ParsedFieldValue;
    license_number?: ParsedFieldValue;
    issuing_authority?: ParsedFieldValue;
    valid_from?: ParsedFieldValue;
    valid_thru?: ParsedFieldValue;
    towns_covered?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  menu_and_prep?: {
    food_items_list?: ParsedFieldValue;
    prep_location?: ParsedFieldValue;
    food_source_location?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  equipment_info?: {
    sanitizer_type?: ParsedFieldValue;
    temp_monitoring?: ParsedFieldValue;
    water_supply?: ParsedFieldValue;
    waste_water?: ParsedFieldValue;
    handwash_setup?: ParsedFieldValue;
    refrigeration?: ParsedFieldValue;
    cooking_equipment?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  food_info?: {
    menu_items?: ParsedFieldValue;
    food_sources?: ParsedFieldValue;
    prep_methods?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  certifications?: {
    food_manager_cert?: ParsedFieldValue;
    cert_expiration?: ParsedFieldValue;
    license_number?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
  commissary_info?: {
    commissary_name?: ParsedFieldValue;
    commissary_address?: ParsedFieldValue;
    toilet_facilities?: ParsedFieldValue;
    [key: string]: ParsedFieldValue | undefined;
  };
} & Record<string, Record<string, ParsedFieldValue | undefined> | string | Record<string, unknown> | undefined>;

const BETHEL_ACRO_FIELD_MAP: Record<string, string> = {
  "Name of Applicant": "owner_name",
  "Address": "address",
  "State": "state",
  "Zip": "zip",
  "Home Phone": "phone",
  "Business Phone": "business_phone",
  "Cell Phone": "cell_phone",
  "Cell Phone_2": "cell_phone",
  "Cell Phone_3": "cell_phone",
  "Name EventllOrganizationl Business": "business_name",
  "Mailing Address": "mailing_address",
  "Town": "city",
  "Location of Event": "event_location",
  "Dates of Event": "event_dates",
  "Hours of Food Service Operation": "hours_of_operation",
  "Person in Charge": "person_in_charge",
  "Please Describe": "water_other_description",
  "Maintain temp": "temperature_control",
  "Describe how food will be stored at the event minimum of 12 inches off the ground 1": "food_storage",
  "how cooled how reheated etc Please note that preparing food ahead of time may not be allowed 1": "food_prep_description",
  "availableused based on type of sanitizer used 1": "sanitizer_description",
  "outdoor elements flies dust etc 1": "food_protection",
};

const BETHEL_CHECKBOX_MAP: Record<string, { dataField: string; matchValue: string }> = {
  "Check Box1": { dataField: "license_type", matchValue: "temporary" },
  "Check Box2": { dataField: "license_type", matchValue: "seasonal" },
  "Check Box6": { dataField: "water_supply", matchValue: "self-contained" },
  "Check Box7": { dataField: "water_supply", matchValue: "public" },
  "Check Box8": { dataField: "water_supply", matchValue: "private well" },
  "Check Box9": { dataField: "water_supply_event", matchValue: "at event" },
  "Check Box10": { dataField: "water_supply_event", matchValue: "public" },
  "Check Box11": { dataField: "water_supply_event", matchValue: "private well" },
  "Check Box12": { dataField: "water_supply", matchValue: "other" },
  "Check Box13": { dataField: "toilet_facilities", matchValue: "rest rooms" },
  "Check Box14": { dataField: "toilet_facilities", matchValue: "portable" },
  "Check Box15": { dataField: "food_prepared_on_site", matchValue: "yes" },
  "Check Box16": { dataField: "food_prepared_on_site", matchValue: "no" },
  "Check Box17": { dataField: "handwash_station", matchValue: "temporary" },
  "Check Box18": { dataField: "handwash_station", matchValue: "permanent" },
  "Check Box19": { dataField: "handwash_on_sketch", matchValue: "yes" },
  "Check Box20": { dataField: "handwash_on_sketch", matchValue: "no" },
  "Check Box21": { dataField: "fee_type", matchValue: "temporary" },
  "Check Box22": { dataField: "fee_type", matchValue: "seasonal" },
  "Check Box4": { dataField: "fee_type", matchValue: "non-profit-temp" },
  "Check Box5": { dataField: "fee_type", matchValue: "non-profit-seasonal" },
};

const FORM_TEMPLATES: Record<string, FormTemplate> = {
  "newtown_mfe": {
    formId: "newtown_mfe",
    formName: "MFE License Application",
    townName: "Newtown",
    pdfPath: "attached_assets/Fillable_FOOD_SERVICE_PLAN_Review_Application_Packet_7-15-25_1766435479788.pdf",
    useAcroForm: false,
    fields: {
      "business_name": { page: 0, x: 200, y: 680, fontSize: 11 },
      "owner_name": { page: 0, x: 200, y: 655, fontSize: 11 },
      "address": { page: 0, x: 200, y: 630, fontSize: 11 },
      "city_state_zip": { page: 0, x: 200, y: 605, fontSize: 11 },
      "phone": { page: 0, x: 200, y: 580, fontSize: 11 },
      "email": { page: 0, x: 200, y: 555, fontSize: 11 },
    }
  },
  "bethel_seasonal": {
    formId: "bethel_seasonal",
    formName: "Temporary/Seasonal Food Service License",
    townName: "Bethel",
    pdfPath: "attached_assets/Fillable_TemporarySeasonal_Food_Service_License_Application_Fi_1766435479788.pdf",
    useAcroForm: true,
    acroFieldMap: BETHEL_ACRO_FIELD_MAP,
    fields: {}
  },
  "newtown_new_license": {
    formId: "newtown_new_license",
    formName: "Food License New/Change Owner/Renewal Application",
    townName: "Newtown",
    pdfPath: "attached_assets/Food_License_New-Chg_Owner-Renewal_Application_2025_Rev.7-10-2_1766435479789.pdf",
    useAcroForm: false,
    fields: {
      "business_name": { page: 0, x: 200, y: 700, fontSize: 11 },
      "owner_name": { page: 0, x: 200, y: 675, fontSize: 11 },
      "address": { page: 0, x: 200, y: 650, fontSize: 11 },
    }
  }
};

function getFieldValue(data: ParsedUserData, category: string, field: string): string | null {
  const cat = data[category as keyof ParsedUserData];
  if (!cat) return null;
  const fieldData = cat[field as keyof typeof cat];
  if (!fieldData || typeof fieldData !== 'object') return null;
  return (fieldData as { value: string | null }).value;
}

function matchesCheckbox(value: string | null, checkboxValue: string): boolean {
  if (!value) return false;
  const normalizedValue = value.toLowerCase();
  const normalizedCheckbox = checkboxValue.toLowerCase();
  return normalizedValue.includes(normalizedCheckbox) || 
         normalizedCheckbox.includes(normalizedValue) ||
         (normalizedCheckbox === "public water" && normalizedValue.includes("municipal")) ||
         (normalizedCheckbox === "tank" && (normalizedValue.includes("fresh water tank") || normalizedValue.includes("potable"))) ||
         (normalizedCheckbox === "holding tank" && normalizedValue.includes("gray water")) ||
         (normalizedCheckbox === "chlorine" && normalizedValue.includes("bleach")) ||
         (normalizedCheckbox === "quaternary" && normalizedValue.includes("quat"));
}

/**
 * Smart checkbox matching - determines if a checkbox should be checked based on field name and data.
 */
function smartMatchCheckbox(
  fieldName: string,
  dataMap: Record<string, string | null>,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  }
): boolean {
  const lowerField = fieldName.toLowerCase();
  
  // Yes/No patterns - must be determined by AI mappings, not hardcoded
  // These fields require context about what specifically is being asked
  if (lowerField.includes("yes") || lowerField === "y") {
    // Return false - let AI field mappings handle yes/no questions
    return false;
  }
  
  // Temporary vs Seasonal license type
  if (lowerField.includes("temporary") || lowerField.includes("temp")) {
    const licenseType = eventData?.licenseType || dataMap.license_type;
    return licenseType?.toLowerCase().includes("temporary") || false;
  }
  if (lowerField.includes("seasonal")) {
    const licenseType = eventData?.licenseType || dataMap.license_type;
    return licenseType?.toLowerCase().includes("seasonal") || false;
  }
  
  // Water supply types
  if (lowerField.includes("public water") || lowerField.includes("municipal")) {
    const water = dataMap.water_supply;
    return water?.toLowerCase().includes("public") || water?.toLowerCase().includes("municipal") || false;
  }
  if (lowerField.includes("self-contained") || lowerField.includes("tank")) {
    const water = dataMap.water_supply;
    return water?.toLowerCase().includes("tank") || water?.toLowerCase().includes("self") || false;
  }
  
  // Toilet facilities
  if (lowerField.includes("portable") && lowerField.includes("toilet")) {
    const toilet = dataMap.toilet_facilities;
    return toilet?.toLowerCase().includes("portable") || false;
  }
  if (lowerField.includes("restroom") || lowerField.includes("rest room")) {
    const toilet = dataMap.toilet_facilities;
    return toilet?.toLowerCase().includes("restroom") || toilet?.toLowerCase().includes("facilities") || toilet?.toLowerCase().includes("event") || false;
  }
  
  // Handwashing station type - NO hardcoded defaults, check actual profile data
  if (lowerField.includes("temporary") && lowerField.includes("handwash")) {
    const handwash = dataMap.handwash_setup;
    return handwash?.toLowerCase().includes("temporary") || handwash?.toLowerCase().includes("portable") || false;
  }
  if (lowerField.includes("permanent") && lowerField.includes("handwash")) {
    const handwash = dataMap.handwash_setup;
    return handwash?.toLowerCase().includes("permanent") || handwash?.toLowerCase().includes("fixed") || false;
  }
  
  // Food prep location - NO hardcoded defaults
  if (lowerField.includes("on-site") || lowerField.includes("on site") || lowerField.includes("onsite")) {
    const prep = dataMap.prep_location;
    return prep?.toLowerCase().includes("on-site") || prep?.toLowerCase().includes("on site") || false;
  }
  if (lowerField.includes("licensed") && (lowerField.includes("establishment") || lowerField.includes("kitchen"))) {
    const prep = dataMap.prep_location || dataMap.commissary_name;
    return prep != null && prep.length > 0;
  }
  if (lowerField.includes("commercially made") || lowerField.includes("commercially purchased")) {
    const sources = dataMap.food_sources;
    return sources?.toLowerCase().includes("commercial") || sources?.toLowerCase().includes("purchased") || false;
  }
  if (lowerField.includes("made by organization") || lowerField.includes("homemade")) {
    const sources = dataMap.food_sources;
    return sources?.toLowerCase().includes("homemade") || sources?.toLowerCase().includes("organization") || false;
  }
  
  return false;
}

async function fillBethelAcroForm(
  pdfDoc: PDFDocument,
  userData: ParsedUserData,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  }
): Promise<void> {
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  console.log("[PDF Service] Filling Bethel AcroForm with", fields.length, "fields");

  const getFromAny = (category: string, ...fieldNames: string[]): string | null => {
    for (const field of fieldNames) {
      const value = getFieldValue(userData, category, field);
      if (value) return value;
    }
    return null;
  };

  const mailingAddress = getFromAny("contact_info", "mailing_address");
  let parsedCity = getFromAny("contact_info", "city");
  let parsedState = getFromAny("contact_info", "state");
  let parsedZip = getFromAny("contact_info", "zip");
  let streetAddress = getFromAny("contact_info", "address");
  
  if (mailingAddress && (!parsedCity || !parsedState || !parsedZip)) {
    const match = mailingAddress.match(/^(.+?)\s+([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (match) {
      if (!streetAddress) streetAddress = match[1].trim();
      if (!parsedCity) parsedCity = match[2].trim();
      if (!parsedState) parsedState = match[3].trim();
      if (!parsedZip) parsedZip = match[4].trim();
    } else {
      const simpleMatch = mailingAddress.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
      if (simpleMatch) {
        const addressParts = simpleMatch[1].trim();
        const lastSpaceIdx = addressParts.lastIndexOf(' ');
        if (lastSpaceIdx > 0) {
          if (!streetAddress) streetAddress = addressParts.substring(0, lastSpaceIdx).trim();
          if (!parsedCity) parsedCity = addressParts.substring(lastSpaceIdx + 1).trim();
        } else {
          if (!parsedCity) parsedCity = addressParts;
        }
        if (!parsedState) parsedState = simpleMatch[2].trim();
        if (!parsedZip) parsedZip = simpleMatch[3].trim();
      } else if (!streetAddress) {
        streetAddress = mailingAddress;
      }
    }
  }

  const parsedLicenseType = getFromAny("license_info", "license_type");
  const licenseType = eventData?.licenseType || 
    (parsedLicenseType?.toLowerCase().includes("temporary") ? "temporary" : 
     parsedLicenseType?.toLowerCase().includes("seasonal") ? "seasonal" : "seasonal");

  const waterSupply = getFromAny("operations", "water_supply_type") || getFromAny("equipment_info", "water_supply") || "";
  const toiletFacilities = getFromAny("operations", "toilet_facilities") || getFromAny("commissary_info", "toilet_facilities") || "";

  const dataMap: Record<string, string | null> = {
    // Contact info
    "owner_name": getFromAny("contact_info", "applicant_name", "owner_name"),
    "applicant_name": getFromAny("contact_info", "applicant_name", "owner_name"),
    "business_name": getFromAny("contact_info", "business_name"),
    "establishment_name": getFromAny("contact_info", "business_name"),
    "name_of_establishment": getFromAny("contact_info", "business_name"),
    "address": streetAddress,
    "establishment_address": streetAddress,
    "mailing_address": mailingAddress || streetAddress,
    "city": parsedCity,
    "state": parsedState,
    "zip": parsedZip,
    "phone": getFromAny("contact_info", "phone"),
    "business_phone": getFromAny("contact_info", "phone"),
    "cell_phone": getFromAny("contact_info", "phone"),
    "email": getFromAny("contact_info", "email"),
    
    // Event data
    "event_name": eventData?.eventName || getFromAny("contact_info", "business_name"),
    "event_location": eventData?.eventAddress || null,
    "event_dates": eventData?.eventDates || null,
    "hours_of_operation": eventData?.hoursOfOperation || null,
    "person_in_charge": eventData?.personInCharge || getFromAny("contact_info", "applicant_name", "owner_name"),
    
    // Operations
    "water_supply": waterSupply,
    "water_supply_event": waterSupply,
    "water_other_description": waterSupply.toLowerCase().includes("other") ? waterSupply : null,
    "sanitizer_type": getFromAny("operations", "sanitizer_type") || getFromAny("equipment_info", "sanitizer_type"),
    "sanitizing_method": getFromAny("operations", "sanitizing_method") || getFromAny("equipment_info", "sanitizing_method"),
    "sanitizer_description": getFromAny("operations", "sanitizer_type") || "Sanitizer test strips available",
    "toilet_facilities": toiletFacilities,
    
    // Safety & temperature
    "temperature_control": getFromAny("safety", "temperature_monitoring_method") || getFromAny("equipment_info", "temp_monitoring"),
    "temp_monitoring": getFromAny("safety", "temperature_monitoring_method") || getFromAny("equipment_info", "temp_monitoring") || "Digital probe thermometer, checked every 2 hours",
    "hot_holding": getFromAny("safety", "hot_holding_method") || "Hot holding with steam tables above 140°F",
    "cold_holding": getFromAny("safety", "cold_storage_method") || "Cold holding in coolers with ice below 40°F",
    "food_storage": getFromAny("safety", "cold_storage_method") || "Fridge and coolers, minimum 12 inches off ground",
    "waste_water": getFromAny("safety", "waste_water_disposal") || getFromAny("equipment_info", "waste_water") || "Gray water tank, disposed at commissary",
    "food_protection": "Food covered and protected from contamination during transport and event",
    
    // Food & menu
    "menu_items": getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"),
    "food_items": getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"),
    "prep_location": getFromAny("menu_and_prep", "prep_location") || getFromAny("commissary_info", "commissary_name"),
    "food_prep_description": getFromAny("menu_and_prep", "prep_location") || "",
    "food_sources": getFromAny("menu_and_prep", "food_source_location") || getFromAny("food_info", "food_sources") || "Restaurant Depot, Costco, local suppliers",
    "prep_methods": getFromAny("food_info", "prep_methods"),
    
    // Commissary
    "commissary_name": getFromAny("commissary_info", "commissary_name"),
    "commissary_address": getFromAny("commissary_info", "commissary_address"),
    
    // Vehicle
    "vin": getFromAny("vehicle_info", "vin"),
    "license_plate": getFromAny("vehicle_info", "license_plate"),
    "vehicle_make": getFromAny("vehicle_info", "trailer_make"),
    "vehicle_model": getFromAny("vehicle_info", "trailer_model"),
    
    // License
    "license_type": licenseType,
    "fee_type": licenseType,
    
    // Equipment
    "handwash_station": getFromAny("equipment_info", "handwash_setup") || "temporary",
    "handwash_setup": getFromAny("equipment_info", "handwash_setup") || "Portable handwash station with soap and paper towels",
    "handwash_on_sketch": "yes",
    "food_prepared_on_site": "yes",
  };

  // Log field count only - avoid logging full data map with potentially large values
  console.log(`[PDF Service] Data map has ${Object.keys(dataMap).length} fields ready for form filling`);

  for (const field of fields) {
    const fieldName = field.getName();
    const fieldType = field.constructor.name;

    try {
      if (fieldType === "PDFTextField") {
        const textField = form.getTextField(fieldName);
        
        // First try hardcoded map, then smart matching
        const dataKey = BETHEL_ACRO_FIELD_MAP[fieldName];
        let value: string | null = null;
        
        if (dataKey && dataMap[dataKey]) {
          value = dataMap[dataKey];
        } else {
          // Use smart matching for unmapped fields
          value = smartMatchFieldToData(fieldName, dataMap, eventData);
        }
        
        if (value) {
          console.log(`[PDF Service] Setting text field "${fieldName}" to "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
          textField.setText(value);
        } else {
          console.log(`[PDF Service] No match for text field: "${fieldName}"`);
        }
      } else if (fieldType === "PDFCheckBox") {
        const checkbox = form.getCheckBox(fieldName);
        const checkboxConfig = BETHEL_CHECKBOX_MAP[fieldName];
        
        // Try hardcoded checkbox map first
        if (checkboxConfig) {
          const dataValue = dataMap[checkboxConfig.dataField];
          if (dataValue) {
            const shouldCheck = dataValue.toLowerCase().includes(checkboxConfig.matchValue.toLowerCase());
            if (shouldCheck) {
              console.log(`[PDF Service] Checking checkbox "${fieldName}" (${checkboxConfig.matchValue})`);
              checkbox.check();
            }
          }
        } else {
          // Smart checkbox matching based on field name
          const shouldCheck = smartMatchCheckbox(fieldName, dataMap, eventData);
          if (shouldCheck) {
            console.log(`[PDF Service] Smart-checking checkbox "${fieldName}"`);
            checkbox.check();
          }
        }
      }
    } catch (err) {
      console.error(`[PDF Service] Error filling field ${fieldName}:`, err);
    }
  }

  form.flatten();
}

export async function fillPdfForm(
  templateId: string,
  userData: ParsedUserData,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  }
): Promise<Uint8Array> {
  const template = FORM_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const pdfPath = path.resolve(template.pdfPath);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  const existingPdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  console.log("[PDF Service] Filling template:", templateId);
  console.log("[PDF Service] useAcroForm:", template.useAcroForm);

  if (template.useAcroForm && templateId === "bethel_seasonal") {
    await fillBethelAcroForm(pdfDoc, userData, eventData);
  } else {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const getFromAny = (category: string, ...fieldNames: string[]): string | null => {
      for (const field of fieldNames) {
        const value = getFieldValue(userData, category, field);
        if (value) return value;
      }
      return null;
    };

    const mailingAddress = getFieldValue(userData, "contact_info", "mailing_address");
    let parsedCity = getFieldValue(userData, "contact_info", "city");
    let parsedState = getFieldValue(userData, "contact_info", "state");
    let parsedZip = getFieldValue(userData, "contact_info", "zip");
    let streetAddress = getFieldValue(userData, "contact_info", "address");
    
    if (mailingAddress && (!parsedCity || !parsedState || !parsedZip)) {
      const match = mailingAddress.match(/^(.+?)\s+([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
      if (match) {
        if (!streetAddress) streetAddress = match[1];
        if (!parsedCity) parsedCity = match[2];
        if (!parsedState) parsedState = match[3];
        if (!parsedZip) parsedZip = match[4];
      } else if (!streetAddress) {
        streetAddress = mailingAddress;
      }
    }

    const fieldDataMap: Record<string, string | null> = {
      "business_name": getFromAny("contact_info", "business_name"),
      "owner_name": getFromAny("contact_info", "owner_name", "applicant_name"),
      "address": streetAddress,
      "city": parsedCity,
      "state": parsedState,
      "zip": parsedZip,
      "phone": getFromAny("contact_info", "phone"),
      "email": getFromAny("contact_info", "email"),
      "city_state_zip": [parsedCity, parsedState, parsedZip].filter(Boolean).join(", "),
    };

    for (const [fieldName, mapping] of Object.entries(template.fields)) {
      const page = pages[mapping.page];
      if (!page) continue;

      if (mapping.isCheckbox) {
        continue;
      } else {
        const value = fieldDataMap[fieldName];
        if (value) {
          const fontSize = mapping.fontSize || 11;
          page.drawText(value, {
            x: mapping.x,
            y: mapping.y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }
      }
    }
  }

  return pdfDoc.save();
}

export async function appendDocumentsToPdf(
  basePdfBytes: Uint8Array,
  documentUrls: { url: string; name: string; type?: string }[]
): Promise<Uint8Array> {
  const basePdf = await PDFDocument.load(basePdfBytes);

  for (const doc of documentUrls) {
    if (!doc.url) continue;

    try {
      let docBytes: Uint8Array;

      if (doc.url.startsWith("data:")) {
        const match = doc.url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        const base64Data = match[2];
        docBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      } else {
        continue;
      }

      if (doc.type?.includes("pdf") || doc.name?.toLowerCase().endsWith(".pdf")) {
        const docPdf = await PDFDocument.load(docBytes);
        const copiedPages = await basePdf.copyPages(docPdf, docPdf.getPageIndices());
        for (const page of copiedPages) {
          basePdf.addPage(page);
        }
      } else if (doc.type?.includes("image") || /\.(jpg|jpeg|png)$/i.test(doc.name || "")) {
        const isJpg = doc.type?.includes("jpeg") || doc.type?.includes("jpg") || 
                     /\.jpe?g$/i.test(doc.name || "");
        const isPng = doc.type?.includes("png") || /\.png$/i.test(doc.name || "");

        let image;
        if (isJpg) {
          image = await basePdf.embedJpg(docBytes);
        } else if (isPng) {
          image = await basePdf.embedPng(docBytes);
        } else {
          continue;
        }

        const imgDims = image.scale(1);
        const pageWidth = 612;
        const pageHeight = 792;
        const scale = Math.min(
          (pageWidth - 72) / imgDims.width,
          (pageHeight - 72) / imgDims.height
        );
        const scaledWidth = imgDims.width * scale;
        const scaledHeight = imgDims.height * scale;

        const page = basePdf.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: (pageWidth - scaledWidth) / 2,
          y: (pageHeight - scaledHeight) / 2,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    } catch (err) {
      console.error(`Error appending document ${doc.name}:`, err);
    }
  }

  return basePdf.save();
}

export function getAvailableTemplates(): { formId: string; formName: string; townName: string }[] {
  return Object.values(FORM_TEMPLATES).map(t => ({
    formId: t.formId,
    formName: t.formName,
    townName: t.townName,
  }));
}

export function getTemplateById(templateId: string): FormTemplate | undefined {
  return FORM_TEMPLATES[templateId];
}

/**
 * Build a complete data map from parsed profile data, vault data, and event data.
 * This is the single source of truth for all field matching in both the questionnaire
 * analyzer and the PDF filler.
 */
export function buildDataMapFromParsedData(
  parsedData: ParsedUserData | null,
  vaultData?: DataVault | null,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  },
  userOverrides?: Record<string, { value: string; savedAt: string; fieldName?: string }> | null,
): Record<string, string | null> {
  const getFieldValue = (data: ParsedUserData | null, category: string, field: string): string | null => {
    if (!data) return null;
    const cat = (data as any)[category];
    if (!cat || typeof cat !== 'object') return null;
    const fieldObj = cat[field];
    if (fieldObj && typeof fieldObj === 'object' && 'value' in fieldObj) {
      return fieldObj.value || null;
    }
    return null;
  };

  const getFromAny = (category: string, ...fieldNames: string[]): string | null => {
    for (const field of fieldNames) {
      const value = getFieldValue(parsedData, category, field);
      if (value) return value;
    }
    return null;
  };

  const mailingAddress = getFromAny("contact_info", "mailing_address");
  let parsedCity = getFromAny("contact_info", "city");
  let parsedState = getFromAny("contact_info", "state");
  let parsedZip = getFromAny("contact_info", "zip");
  let streetAddress = getFromAny("contact_info", "address");

  if (mailingAddress && (!parsedCity || !parsedState || !parsedZip)) {
    const match = mailingAddress.match(/^(.+?)\s+([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (match) {
      if (!streetAddress) streetAddress = match[1].trim();
      if (!parsedCity) parsedCity = match[2].trim();
      if (!parsedState) parsedState = match[3].trim();
      if (!parsedZip) parsedZip = match[4].trim();
    } else {
      const simpleMatch = mailingAddress.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
      if (simpleMatch) {
        const addressParts = simpleMatch[1].trim();
        const lastSpaceIdx = addressParts.lastIndexOf(' ');
        if (lastSpaceIdx > 0) {
          if (!streetAddress) streetAddress = addressParts.substring(0, lastSpaceIdx).trim();
          if (!parsedCity) parsedCity = addressParts.substring(lastSpaceIdx + 1).trim();
        } else {
          if (!parsedCity) parsedCity = addressParts;
        }
        if (!parsedState) parsedState = simpleMatch[2].trim();
        if (!parsedZip) parsedZip = simpleMatch[3].trim();
      } else if (!streetAddress) {
        streetAddress = mailingAddress;
      }
    }
  }

  const dataMap: Record<string, string | null> = {
    business_name: getFromAny("contact_info", "business_name"),
    owner_name: getFromAny("contact_info", "owner_name", "applicant_name"),
    applicant_name: getFromAny("contact_info", "applicant_name", "owner_name"),
    address: streetAddress,
    mailing_address: mailingAddress,
    city: parsedCity,
    town: parsedCity,
    state: parsedState,
    zip: parsedZip,
    phone: getFromAny("contact_info", "phone"),
    email: getFromAny("contact_info", "email"),
    city_state_zip: [parsedCity, parsedState, parsedZip].filter(Boolean).join(", "),
    vin: getFromAny("vehicle_info", "vin"),
    license_plate: getFromAny("vehicle_info", "license_plate"),
    vehicle_make: getFromAny("vehicle_info", "trailer_make"),
    vehicle_model: getFromAny("vehicle_info", "trailer_model"),
    vehicle_year: getFromAny("vehicle_info", "trailer_year"),
    water_supply: getFromAny("operations", "water_supply_type") || getFromAny("equipment_info", "water_supply"),
    sanitizer_type: getFromAny("operations", "sanitizer_type") || getFromAny("equipment_info", "sanitizer_type"),
    sanitizing_method: getFromAny("operations", "sanitizing_method"),
    toilet_facilities: getFromAny("operations", "toilet_facilities") || getFromAny("commissary_info", "toilet_facilities"),
    handwash_setup: getFromAny("equipment_info", "handwash_setup"),
    refrigeration: getFromAny("equipment_info", "refrigeration"),
    cooking_equipment: getFromAny("equipment_info", "cooking_equipment"),
    temp_monitoring: getFromAny("safety", "temperature_monitoring_method") || getFromAny("equipment_info", "temp_monitoring"),
    hot_holding: getFromAny("safety", "hot_holding_method"),
    cold_storage: getFromAny("safety", "cold_storage_method"),
    waste_water: getFromAny("safety", "waste_water_disposal") || getFromAny("equipment_info", "waste_water"),
    garbage_disposal: getFromAny("safety", "garbage_disposal"),
    menu_items: getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"),
    food_items: getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"),
    prep_location: getFromAny("menu_and_prep", "prep_location"),
    food_sources: getFromAny("menu_and_prep", "food_source_location") || getFromAny("food_info", "food_sources"),
    prep_methods: getFromAny("food_info", "prep_methods"),
    food_storage: getFromAny("safety", "cold_storage_method"),
    commissary_name: getFromAny("commissary_info", "commissary_name"),
    commissary_address: getFromAny("commissary_info", "commissary_address"),
    food_manager_cert: getFromAny("certifications", "food_manager_cert"),
    cert_expiration: getFromAny("certifications", "cert_expiration"),
    license_number: getFromAny("license_info", "license_number") || getFromAny("certifications", "license_number"),
    event_name: eventData?.eventName || null,
    event_location: eventData?.eventAddress || null,
    event_dates: eventData?.eventDates || null,
    hours_of_operation: eventData?.hoursOfOperation || null,
    person_in_charge: eventData?.personInCharge || null,
    license_type: eventData?.licenseType || null,
  };

  if (vaultData) {
    const vaultOverrides: Record<string, string | null> = {
      business_name: vaultData.businessName,
      owner_name: vaultData.ownerName,
      applicant_name: vaultData.ownerName,
      address: vaultData.mailingStreet,
      mailing_address: [vaultData.mailingStreet, vaultData.mailingCity, vaultData.mailingState, vaultData.mailingZip].filter(Boolean).join(', ') || null,
      city: vaultData.mailingCity,
      town: vaultData.mailingCity,
      state: vaultData.mailingState,
      zip: vaultData.mailingZip,
      phone: vaultData.phone,
      email: vaultData.email,
      vin: vaultData.vehicleVin,
      license_plate: vaultData.vehicleLicensePlate,
      vehicle_make: vaultData.vehicleMake,
      vehicle_model: vaultData.vehicleModel,
      vehicle_year: vaultData.vehicleYear,
      water_supply: vaultData.waterSupplyType,
      sanitizer_type: vaultData.sanitizerType,
      hot_holding: vaultData.hotHoldingMethod,
      cold_storage: vaultData.coldHoldingMethod,
      commissary_name: vaultData.commissaryName,
      commissary_address: vaultData.commissaryAddress,
      food_handler_cert: vaultData.foodHandlerCertNumber,
      prep_location: vaultData.prepLocationAddress,
      menu_items: vaultData.foodItemsList?.join(', ') || null,
      food_items: vaultData.foodItemsList?.join(', ') || null,
      food_sources: vaultData.foodSourceLocations?.join(', ') || null,
    };
    if (vaultData.mailingCity && vaultData.mailingState && vaultData.mailingZip) {
      vaultOverrides.city_state_zip = `${vaultData.mailingCity}, ${vaultData.mailingState} ${vaultData.mailingZip}`;
    }
    for (const [key, value] of Object.entries(vaultOverrides)) {
      if (value) {
        dataMap[key] = value;
      }
    }
  }

  if (userOverrides) {
    for (const [key, override] of Object.entries(userOverrides)) {
      const fieldName = override.fieldName || key.split('.').pop() || key;
      if (override.value) {
        dataMap[fieldName] = override.value;
      }
    }
  }

  return dataMap;
}

/**
 * Smart field name matching for PDF forms.
 * Maps common PDF field name patterns to our standardized data keys.
 */
export function smartMatchFieldToData(
  fieldName: string,
  dataMap: Record<string, string | null>,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  }
): string | null {
  const lowerField = fieldName.toLowerCase();
  
  // Applicant/Owner name patterns
  if (lowerField.includes("applicant") && lowerField.includes("name")) {
    return dataMap.applicant_name || dataMap.owner_name;
  }
  if (lowerField.includes("owner") && (lowerField.includes("name") || lowerField.includes("operator"))) {
    return dataMap.owner_name || dataMap.applicant_name;
  }
  if (lowerField === "name" || lowerField.includes("name of applicant") || lowerField.includes("applicant name")) {
    return dataMap.applicant_name || dataMap.owner_name;
  }
  
  // Business/Establishment name patterns
  if (lowerField.includes("business") && lowerField.includes("name")) {
    return dataMap.business_name;
  }
  if (lowerField.includes("organization") || (lowerField.includes("event") && lowerField.includes("name"))) {
    return eventData?.eventName || dataMap.business_name;
  }
  if (lowerField.includes("establishment") && (lowerField.includes("name") || !lowerField.includes("address"))) {
    return dataMap.business_name;
  }
  
  // Address patterns - handle "establishment address", "owner/operator address" etc.
  if (lowerField.includes("mailing") && lowerField.includes("address")) {
    return dataMap.mailing_address || dataMap.address;
  }
  if (lowerField.includes("establishment") && lowerField.includes("address")) {
    return dataMap.address || dataMap.mailing_address;
  }
  if (lowerField.includes("owner") && lowerField.includes("address")) {
    return dataMap.address || dataMap.mailing_address;
  }
  if (lowerField.includes("street") || (lowerField === "address" || (lowerField.includes("address") && !lowerField.includes("email")))) {
    return dataMap.address || dataMap.mailing_address;
  }
  
  // Event location - handle "Location of Event", "event location" etc.
  if (lowerField.includes("location") && (lowerField.includes("event") || lowerField.includes("of"))) {
    return eventData?.eventAddress || null;
  }
  if (lowerField === "location of event" || lowerField === "event location") {
    return eventData?.eventAddress || null;
  }
  
  // City/State/Zip patterns
  if (lowerField === "city" || lowerField.includes("city") && !lowerField.includes("state")) {
    return dataMap.city;
  }
  if (lowerField === "town" || lowerField.includes("town")) {
    return dataMap.city;
  }
  if (lowerField === "state" || lowerField.includes("state") && !lowerField.includes("city")) {
    return dataMap.state;
  }
  if (lowerField === "zip" || lowerField.includes("zip") || lowerField.includes("postal")) {
    return dataMap.zip;
  }
  
  // Phone patterns
  if (lowerField.includes("phone") || lowerField.includes("telephone") || lowerField.includes("tel")) {
    return dataMap.phone;
  }
  if (lowerField.includes("cell") || lowerField.includes("mobile")) {
    return dataMap.phone;
  }
  
  // Email patterns
  if (lowerField.includes("email") || lowerField.includes("e-mail")) {
    return dataMap.email;
  }
  
  // Event-specific patterns - handle "Dates of Event", "Event Date(s)", etc.
  if (lowerField.includes("date") && (lowerField.includes("event") || lowerField.includes("of"))) {
    return eventData?.eventDates || null;
  }
  if (lowerField === "dates of event" || lowerField === "event dates" || lowerField === "date of event" || lowerField === "event date") {
    return eventData?.eventDates || null;
  }
  
  // Hours of operation patterns - handle "Hours of Food Service Operation", "Operating Hours"
  if ((lowerField.includes("hours") && (lowerField.includes("operation") || lowerField.includes("service") || lowerField.includes("food"))) ||
      lowerField.includes("operating hours")) {
    return eventData?.hoursOfOperation || null;
  }
  
  // Person in charge patterns
  if (lowerField.includes("person in charge") || lowerField.includes("contact person") || 
      lowerField.includes("person_in_charge") || lowerField.includes("in charge")) {
    return eventData?.personInCharge || dataMap.applicant_name || dataMap.owner_name;
  }
  
  // Vehicle patterns
  if (lowerField.includes("vin") || lowerField.includes("vehicle identification")) {
    return dataMap.vin;
  }
  if (lowerField.includes("license") && lowerField.includes("plate")) {
    return dataMap.license_plate;
  }
  
  // Commissary patterns
  if (lowerField.includes("commissary") && lowerField.includes("name")) {
    return dataMap.commissary_name;
  }
  if (lowerField.includes("commissary") && lowerField.includes("address")) {
    return dataMap.commissary_address;
  }
  
  // Water/sanitation patterns
  if (lowerField.includes("water") && lowerField.includes("supply")) {
    return dataMap.water_supply;
  }
  if (lowerField.includes("sanitizer") || lowerField.includes("sanitiz") || lowerField.includes("utensil wash") || lowerField.includes("warewash")) {
    return dataMap.sanitizer_type || dataMap.sanitizing_method;
  }
  if (lowerField.includes("toilet") || lowerField.includes("restroom")) {
    return dataMap.toilet_facilities;
  }
  
  // Food/Menu patterns - NO hardcoded defaults, only real profile data
  if (lowerField.includes("food item") || lowerField.includes("menu item") || lowerField.includes("list all food") ||
      lowerField.includes("food and beverage") || lowerField.includes("prepared and served") || lowerField.includes("foods to be")) {
    return dataMap.menu_items || dataMap.food_items || null;
  }
  if (lowerField.includes("food") && lowerField.includes("purchased")) {
    return dataMap.food_sources || null;
  }
  if (lowerField.includes("food") && lowerField.includes("stored") || lowerField.includes("storage")) {
    return dataMap.cold_storage || dataMap.food_storage || null;
  }
  if (lowerField.includes("temperature") && (lowerField.includes("monitor") || lowerField.includes("describe"))) {
    return dataMap.temp_monitoring || null;
  }
  if (lowerField.includes("food") && lowerField.includes("prepared") || lowerField.includes("prep location") || lowerField.includes("preparation") ||
      lowerField.includes("tfe site") || lowerField.includes("prepared at")) {
    return dataMap.prep_location || dataMap.commissary_name || null;
  }
  if (lowerField.includes("source") || lowerField.includes("where made") || lowerField.includes("where purchased")) {
    return dataMap.food_sources || dataMap.commissary_name || null;
  }
  // Transport patterns
  if (lowerField.includes("transport") && (lowerField.includes("food") || lowerField.includes("frozen") || lowerField.includes("cold") || lowerField.includes("hot"))) {
    return dataMap.hot_holding || dataMap.cold_storage || null;
  }
  
  // Hot/cold holding patterns - NO hardcoded defaults
  if (lowerField.includes("hot") && lowerField.includes("hold")) {
    return dataMap.hot_holding || null;
  }
  if (lowerField.includes("cold") && lowerField.includes("hold")) {
    return dataMap.cold_storage || null;
  }
  
  // Waste disposal patterns - NO hardcoded defaults
  if (lowerField.includes("waste") && (lowerField.includes("water") || lowerField.includes("disposal"))) {
    return dataMap.waste_water || null;
  }
  if (lowerField.includes("garbage") || lowerField.includes("trash") || lowerField.includes("refuse")) {
    return dataMap.garbage_disposal || null;
  }
  
  // Handwashing patterns - NO hardcoded defaults
  if (lowerField.includes("handwash") || lowerField.includes("hand wash") || lowerField.includes("hand-wash") || lowerField.includes("hand washing")) {
    return dataMap.handwash_setup || dataMap.sanitizing_method || null;
  }
  
  // Direct key match as fallback
  const normalizedFieldName = lowerField.replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  for (const [key, val] of Object.entries(dataMap)) {
    if (key === normalizedFieldName && val) {
      return val;
    }
  }
  
  return null;
}

/**
 * Smart checkbox matching for database forms - determines if a checkbox should be checked.
 * Handles generic checkbox names like "Check Box1", "Check Box2" by looking at form context.
 */
function smartMatchCheckboxForDatabase(
  fieldName: string,
  dataMap: Record<string, string | null>,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  }
): boolean {
  const lowerField = fieldName.toLowerCase();
  
  // NO hardcoded defaults - only match if profile data explicitly matches
  // Temporary/Seasonal license type
  if (lowerField.includes("temporary") && !lowerField.includes("seasonal")) {
    const licenseType = eventData?.licenseType || dataMap.license_type;
    return licenseType?.toLowerCase().includes("temporary") || false;
  }
  if (lowerField.includes("seasonal") && !lowerField.includes("temporary")) {
    const licenseType = eventData?.licenseType || dataMap.license_type;
    return licenseType?.toLowerCase().includes("seasonal") || false;
  }
  
  // Water supply checkboxes
  if (lowerField.includes("public water") || (lowerField.includes("public") && lowerField.includes("water"))) {
    const water = dataMap.water_supply;
    return water?.toLowerCase().includes("public") || water?.toLowerCase().includes("municipal") || false;
  }
  if (lowerField.includes("self-contained") || lowerField.includes("self contained") || lowerField.includes("tank")) {
    const water = dataMap.water_supply;
    return water?.toLowerCase().includes("tank") || water?.toLowerCase().includes("self") || false;
  }
  if (lowerField.includes("private well") || lowerField.includes("well")) {
    const water = dataMap.water_supply;
    return water?.toLowerCase().includes("well") || false;
  }
  
  // Toilet facilities
  if (lowerField.includes("rest room") || lowerField.includes("restroom")) {
    const toilet = dataMap.toilet_facilities;
    return toilet?.toLowerCase().includes("restroom") || 
           toilet?.toLowerCase().includes("facilities") || 
           toilet?.toLowerCase().includes("event") || false;
  }
  if (lowerField.includes("portable") && lowerField.includes("toilet")) {
    const toilet = dataMap.toilet_facilities;
    return toilet?.toLowerCase().includes("portable") || false;
  }
  
  // Hand washing station - NO hardcoded defaults
  if (lowerField.includes("temporary") && lowerField.includes("handwash")) {
    const handwash = dataMap.handwash_setup;
    return handwash?.toLowerCase().includes("temporary") || handwash?.toLowerCase().includes("portable") || false;
  }
  if (lowerField.includes("permanent") && lowerField.includes("handwash")) {
    const handwash = dataMap.handwash_setup;
    return handwash?.toLowerCase().includes("permanent") || handwash?.toLowerCase().includes("fixed") || false;
  }
  
  // Yes/No patterns - cannot assume, need context
  // These should be handled by AI field mapping, not hardcoded
  if (lowerField === "yes" || lowerField.endsWith("_yes")) {
    return false; // Cannot assume - needs specific field context
  }
  if (lowerField === "no" || lowerField.endsWith("_no")) {
    return false; // Cannot assume - needs specific field context
  }
  
  // Fee schedule checkboxes - match based on license type
  if (lowerField.includes("214") && lowerField.includes("temporary")) {
    const licenseType = eventData?.licenseType || dataMap.license_type;
    return licenseType?.toLowerCase().includes("temporary") || false;
  }
  if (lowerField.includes("214.1") || (lowerField.includes("seasonal") && lowerField.includes("food"))) {
    const licenseType = eventData?.licenseType || dataMap.license_type;
    return licenseType?.toLowerCase().includes("seasonal") || false;
  }
  
  // Generic "Check Box" names can't be matched without knowing what they represent
  // These need to be mapped manually in fieldMappings or discovered through AI
  if (lowerField.startsWith("check box") || lowerField.match(/^checkbox\d+$/)) {
    // Can't determine what this checkbox represents
    return false;
  }
  
  return false;
}

// Type for cached AI field mappings
export interface CachedAIFieldMapping {
  pdfFieldName: string;
  fieldType: "text" | "checkbox";
  label: string;
  dataKey: string | null;
  matchValue?: string | null; // For checkboxes: the value that dataKey should contain to check this box
  confidence: number;
}

/**
 * Fill a PDF form from the database town_forms table.
 * This uses the stored fileData (base64 PDF) and fieldMappings from the database.
 * When aiFieldMappings are provided, uses those INSTEAD of heuristic matching.
 * Supports both AcroForm fields and coordinate-based filling.
 */
export async function fillPdfFromDatabase(
  townForm: TownForm,
  userData: ParsedUserData,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
    personInCharge?: string;
    licenseType?: "temporary" | "seasonal";
  },
  aiFieldMappings?: CachedAIFieldMapping[],
  userAnswers?: Record<string, string>,
  vaultData?: DataVault | null
): Promise<Uint8Array> {
  if (!townForm.fileData) {
    throw new Error(`No PDF data stored for form: ${townForm.name}`);
  }

  // Decode base64 PDF data
  const pdfBuffer = Buffer.from(townForm.fileData, "base64");
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.registerFontkit(fontkit);

  console.log(`[PDF Service] Filling database form: ${townForm.name} (ID: ${townForm.id})`);

  // Check if this is an AcroForm PDF by looking for form fields
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const hasAcroFields = fields.length > 0;

  console.log(`[PDF Service] Form has ${fields.length} AcroForm fields, isFillable: ${townForm.isFillable}`);

  // Build data map from userData
  const getFromAny = (category: string, ...fieldNames: string[]): string | null => {
    for (const field of fieldNames) {
      const value = getFieldValue(userData, category, field);
      if (value) return value;
    }
    return null;
  };

  const mailingAddress = getFromAny("contact_info", "mailing_address");
  let parsedCity = getFromAny("contact_info", "city");
  let parsedState = getFromAny("contact_info", "state");
  let parsedZip = getFromAny("contact_info", "zip");
  let streetAddress = getFromAny("contact_info", "address");
  
  // Parse mailing address into components if not already set
  // Example: "126 Morningside Drive Bridgeport, CT 06606"
  if (mailingAddress && (!streetAddress || !parsedCity || !parsedState || !parsedZip)) {
    // Pattern 1: "123 Street Name City, ST 12345" - street + city before comma
    // Regex captures: (street) (city), (ST) (ZIP)
    const match = mailingAddress.match(/^(.+?)\s+([A-Za-z]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (match) {
      // match[1] = street address (e.g., "126 Morningside Drive")
      // match[2] = city (e.g., "Bridgeport")
      // match[3] = state (e.g., "CT")
      // match[4] = zip (e.g., "06606")
      if (!streetAddress) streetAddress = match[1].trim();
      if (!parsedCity) parsedCity = match[2].trim();
      if (!parsedState) parsedState = match[3].trim();
      if (!parsedZip) parsedZip = match[4].trim();
    } else {
      // Pattern 2: "Street, City, ST ZIP" - comma-separated
      const parts = mailingAddress.split(',');
      if (parts.length >= 2) {
        if (!streetAddress) streetAddress = parts[0].trim();
        // Last part should be "ST ZIP"
        const lastPart = parts[parts.length - 1].trim();
        const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
        if (stateZipMatch) {
          if (!parsedState) parsedState = stateZipMatch[1];
          if (!parsedZip) parsedZip = stateZipMatch[2];
        }
        // City is the part before state/zip
        if (parts.length === 3 && !parsedCity) {
          parsedCity = parts[1].trim();
        } else if (parts.length === 2 && !parsedCity) {
          // "Street, City ST ZIP" format - extract city from last part before state
          const cityMatch = lastPart.match(/^([A-Za-z\s]+?)\s+[A-Z]{2}\s*\d{5}/);
          if (cityMatch) {
            parsedCity = cityMatch[1].trim();
          }
        }
      }
    }
  }

  // Debug: Log parsed address components
  console.log(`[PDF Service] Parsed address: street="${streetAddress}", city="${parsedCity}", state="${parsedState}", zip="${parsedZip}"`);

  // Standard data map for form filling
  const dataMap: Record<string, string | null> = {
    // Contact info
    business_name: getFromAny("contact_info", "business_name"),
    owner_name: getFromAny("contact_info", "owner_name", "applicant_name"),
    applicant_name: getFromAny("contact_info", "applicant_name", "owner_name"),
    address: streetAddress,
    mailing_address: mailingAddress,
    city: parsedCity,
    town: parsedCity, // "Town" is often used interchangeably with "City"
    state: parsedState,
    zip: parsedZip,
    phone: getFromAny("contact_info", "phone"),
    email: getFromAny("contact_info", "email"),
    city_state_zip: [parsedCity, parsedState, parsedZip].filter(Boolean).join(", "),
    // Vehicle info
    vin: getFromAny("vehicle_info", "vin"),
    license_plate: getFromAny("vehicle_info", "license_plate"),
    vehicle_make: getFromAny("vehicle_info", "trailer_make"),
    vehicle_model: getFromAny("vehicle_info", "trailer_model"),
    vehicle_year: getFromAny("vehicle_info", "trailer_year"),
    // Operations & equipment
    water_supply: getFromAny("operations", "water_supply_type") || getFromAny("equipment_info", "water_supply"),
    sanitizer_type: getFromAny("operations", "sanitizer_type") || getFromAny("equipment_info", "sanitizer_type"),
    toilet_facilities: getFromAny("operations", "toilet_facilities") || getFromAny("commissary_info", "toilet_facilities"),
    handwash_setup: getFromAny("equipment_info", "handwash_setup"),
    refrigeration: getFromAny("equipment_info", "refrigeration"),
    cooking_equipment: getFromAny("equipment_info", "cooking_equipment"),
    // Safety & temperature
    temp_monitoring: getFromAny("safety", "temperature_monitoring_method") || getFromAny("equipment_info", "temp_monitoring"),
    hot_holding: getFromAny("safety", "hot_holding_method"),
    cold_storage: getFromAny("safety", "cold_storage_method"),
    waste_water: getFromAny("safety", "waste_water_disposal") || getFromAny("equipment_info", "waste_water"),
    // Menu & food
    menu_items: getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"),
    food_items: getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"),
    prep_location: getFromAny("menu_and_prep", "prep_location"),
    food_sources: getFromAny("menu_and_prep", "food_source_location") || getFromAny("food_info", "food_sources"),
    prep_methods: getFromAny("food_info", "prep_methods"),
    food_storage: getFromAny("safety", "cold_storage_method"),
    // Commissary
    commissary_name: getFromAny("commissary_info", "commissary_name"),
    commissary_address: getFromAny("commissary_info", "commissary_address"),
    // Certifications
    food_manager_cert: getFromAny("certifications", "food_manager_cert"),
    cert_expiration: getFromAny("certifications", "cert_expiration"),
    license_number: getFromAny("license_info", "license_number") || getFromAny("certifications", "license_number"),
    // Event data
    event_name: eventData?.eventName || null,
    event_location: eventData?.eventAddress || null,
    event_dates: eventData?.eventDates || null,
    hours_of_operation: eventData?.hoursOfOperation || null,
    person_in_charge: eventData?.personInCharge || null,
    license_type: eventData?.licenseType || null,
  };

  // Layer 2: Overlay Data Vault fields (structured, curated data takes priority over raw parsed data)
  if (vaultData) {
    console.log(`[PDF Service] Merging Data Vault data for profile ${vaultData.profileId}`);
    const vaultOverrides: Record<string, string | null> = {
      business_name: vaultData.businessName,
      owner_name: vaultData.ownerName,
      applicant_name: vaultData.ownerName,
      address: vaultData.mailingStreet,
      mailing_address: [vaultData.mailingStreet, vaultData.mailingCity, vaultData.mailingState, vaultData.mailingZip].filter(Boolean).join(', ') || null,
      city: vaultData.mailingCity,
      town: vaultData.mailingCity,
      state: vaultData.mailingState,
      zip: vaultData.mailingZip,
      phone: vaultData.phone,
      email: vaultData.email,
      vin: vaultData.vehicleVin,
      license_plate: vaultData.vehicleLicensePlate,
      vehicle_make: vaultData.vehicleMake,
      vehicle_model: vaultData.vehicleModel,
      vehicle_year: vaultData.vehicleYear,
      water_supply: vaultData.waterSupplyType,
      sanitizer_type: vaultData.sanitizerType,
      hot_holding: vaultData.hotHoldingMethod,
      cold_storage: vaultData.coldHoldingMethod,
      commissary_name: vaultData.commissaryName,
      commissary_address: vaultData.commissaryAddress,
      food_handler_cert: vaultData.foodHandlerCertNumber,
      prep_location: vaultData.prepLocationAddress,
      menu_items: vaultData.foodItemsList?.join(', ') || null,
      food_items: vaultData.foodItemsList?.join(', ') || null,
      food_sources: vaultData.foodSourceLocations?.join(', ') || null,
    };
    if (vaultData.mailingCity && vaultData.mailingState && vaultData.mailingZip) {
      vaultOverrides.city_state_zip = `${vaultData.mailingCity}, ${vaultData.mailingState} ${vaultData.mailingZip}`;
    }

    for (const [key, value] of Object.entries(vaultOverrides)) {
      if (value) {
        dataMap[key] = value;
      }
    }
  }

  if (hasAcroFields && townForm.isFillable) {
    // Use AcroForm field filling
    const fieldMappings = townForm.fieldMappings || {};
    
    // Build lookup from AI mappings if provided (most efficient - uses cached Datalab results)
    const aiMappingLookup = new Map<string, CachedAIFieldMapping>();
    if (aiFieldMappings && aiFieldMappings.length > 0) {
      console.log(`[PDF Service] Using ${aiFieldMappings.length} CACHED AI field mappings (no Datalab API call!)`);
      for (const mapping of aiFieldMappings) {
        aiMappingLookup.set(mapping.pdfFieldName, mapping);
      }
    } else {
      console.log(`[PDF Service] Filling ${fields.length} AcroForm fields using heuristic matching`);
    }

    for (const field of fields) {
      const fieldName = field.getName();
      
      try {
        let value: string | null = null;
        const fieldType = field.constructor.name;

        // PRIORITY 0: Check user-provided answers first (highest priority - user explicitly answered this)
        if (userAnswers && userAnswers[fieldName]) {
          value = userAnswers[fieldName];
          console.log(`[PDF Service] User answer: "${fieldName}" = "${value?.substring(0, 50)}..."`);
        }
        // PRIORITY 1: Check cached AI mappings (most accurate, saves API calls)
        else {
          const aiMapping = aiMappingLookup.get(fieldName);
          if (aiMapping && aiMapping.dataKey && dataMap[aiMapping.dataKey]) {
            value = dataMap[aiMapping.dataKey];
            console.log(`[PDF Service] AI mapping: "${fieldName}" -> "${aiMapping.dataKey}" = "${value?.substring(0, 50)}..."`);
          }
          // PRIORITY 2: Check manual fieldMappings from database
          else if (fieldMappings[fieldName] && dataMap[fieldMappings[fieldName]]) {
            value = dataMap[fieldMappings[fieldName]];
            console.log(`[PDF Service] Manual mapping: "${fieldName}" -> "${fieldMappings[fieldName]}"`);
          }
          // PRIORITY 3: Fall back to heuristic matching (least reliable)
          else {
            value = smartMatchFieldToData(fieldName, dataMap, eventData);
          }
        }
        
        if (fieldType === "PDFTextField") {
          if (value) {
            const textField = form.getTextField(fieldName);
            textField.setText(value);
            console.log(`[PDF Service] Set field "${fieldName}" = "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
          } else {
            console.log(`[PDF Service] No data for field: "${fieldName}"`);
          }
        } else if (fieldType === "PDFCheckBox") {
          // Handle checkboxes - evaluate semantic rules against REAL profile data
          const checkbox = form.getCheckBox(fieldName);
          let shouldCheck = false;
          
          // Get AI mapping for this checkbox field
          const checkboxAiMapping = aiMappingLookup.get(fieldName);
          
          // PRIORITY 0: Check user-provided answers first (highest priority)
          if (userAnswers && userAnswers[fieldName]) {
            const userAnswer = userAnswers[fieldName].toLowerCase().trim();
            shouldCheck = ["yes", "true", "1", "checked", "on", "x"].includes(userAnswer);
            console.log(`[PDF Service] User answer checkbox: "${fieldName}" = "${userAnswers[fieldName]}" -> ${shouldCheck}`);
          }
          // PRIORITY 1: AI semantic rules
          else if (checkboxAiMapping && checkboxAiMapping.dataKey && checkboxAiMapping.matchValue) {
            // Semantic rule: check if user's data matches the required value
            const userValue = dataMap[checkboxAiMapping.dataKey];
            if (userValue) {
              // Case-insensitive partial match
              shouldCheck = userValue.toLowerCase().includes(checkboxAiMapping.matchValue.toLowerCase());
              console.log(`[PDF Service] Semantic checkbox: "${fieldName}" (${checkboxAiMapping.label}) - dataKey="${checkboxAiMapping.dataKey}" userValue="${userValue}" matchValue="${checkboxAiMapping.matchValue}" -> ${shouldCheck}`);
            } else {
              console.log(`[PDF Service] Semantic checkbox: "${fieldName}" - no data for key "${checkboxAiMapping.dataKey}"`);
            }
          } else if (checkboxAiMapping && checkboxAiMapping.dataKey) {
            // Simple boolean check - data key exists and is truthy
            const checkboxValue = dataMap[checkboxAiMapping.dataKey];
            shouldCheck = !!checkboxValue && checkboxValue.toLowerCase() !== "false" && checkboxValue.toLowerCase() !== "no";
            console.log(`[PDF Service] AI checkbox: "${fieldName}" -> "${checkboxAiMapping.dataKey}" = ${shouldCheck}`);
          } else {
            // Fall back to heuristic matching
            shouldCheck = smartMatchCheckboxForDatabase(fieldName, dataMap, eventData);
          }
          
          if (shouldCheck) {
            checkbox.check();
            console.log(`[PDF Service] Checked checkbox: "${fieldName}"`);
          } else {
            console.log(`[PDF Service] Skipped checkbox: "${fieldName}"`);
          }
        } else {
          console.log(`[PDF Service] Unknown field type "${fieldType}" for: "${fieldName}"`);
        }
      } catch (err) {
        console.error(`[PDF Service] Error filling field ${fieldName}:`, err);
      }
    }

    // Flatten the form to prevent further editing
    try {
      form.flatten();
    } catch (err) {
      console.log("[PDF Service] Could not flatten form, continuing without flattening");
    }
  } else {
    console.log(`[PDF Service] Form is not fillable or has no AcroForm fields, returning unmodified PDF`);
  }

  return pdfDoc.save();
}

/**
 * Get list of fillable forms from database for a specific town.
 * This replaces the hardcoded getAvailableTemplates for database-backed forms.
 */
export interface DatabaseFormTemplate {
  formId: string;
  formName: string;
  townId: string;
  townName?: string;
  isFillable: boolean;
  hasFieldMappings: boolean;
  category: string | null;
}

export function townFormToTemplate(form: TownForm, townName?: string): DatabaseFormTemplate {
  return {
    formId: form.id,
    formName: form.name,
    townId: form.townId,
    townName: townName,
    isFillable: form.isFillable ?? false,
    hasFieldMappings: !!form.fieldMappings && Object.keys(form.fieldMappings).length > 0,
    category: form.category,
  };
}
