import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";

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

const DANBURY_ACRO_FIELD_MAP: Record<string, string> = {
  "Trade Name": "business_name",
  "Vehicle License Plate": "license_plate",
  "Color": "vehicle_color",
  "Make  Model of Vehicle": "trailer_make_model",
  "VIN": "vin",
  "Owner of Vehicle": "owner_name",
  "Address": "address",
  "Telephone": "phone",
  "Email": "email",
  "Name of Qualified Food Operators": "person_in_charge",
  "Proposed Locations": "event_location",
  "What type of sanitizer is used": "sanitizer_type",
  "Describe setup if not a fixed handsink": "handwash_setup",
  "Will nonlatex disposable gloves andor utensils andor food grade paper be used to minimize handling": "glove_usage",
  "Where will food products be purchased All items must be from an approved source 1": "food_source_1",
  "Where will food products be purchased All items must be from an approved source 2": "food_source_2",
  "Where will food be stored outside of operation hours": "food_storage",
  "Food Preparation Describe 1": "food_prep_1",
  "Food Preparation Describe 2": "food_prep_2",
  "List types of cooking equipment": "cooking_equipment",
  "s be maintained at 140F 60C and above during holding for service Indicate type": "hot_holding",
  "and number of hot holding units 1": "hot_holding_units_1",
  "and number of hot holding units 2": "hot_holding_units_2",
  "70F to 45F in 4 hours 1": "cooling_method_1",
  "70F to 45F in 4 hours 2": "cooling_method_2",
  "70F to 45F in 4 hours 3": "cooling_method_3",
  "the food reach a temperature of at least 165F for 15 seconds Indicate type and number of units used": "reheating_method",
  "for reheating foods": "reheating_units",
  "and number of cold holding units 1": "cold_holding_units_1",
  "and number of cold holding units 2": "cold_holding_units_2",
  "Are toilet facilities available Describe location available to operator": "toilet_facilities",
  "Year": "year",
  "Hours of Operation Mon": "hours_mon",
  "Tues": "hours_tue",
  "Wed": "hours_wed",
  "Thurs": "hours_thu",
  "Fri": "hours_fri",
  "Sat": "hours_sat",
  "Sun": "hours_sun",
};

const DANBURY_CHECKBOX_MAP: Record<string, { dataField: string; matchValue: string }> = {
  "Please check appropriately  New Operation": { dataField: "application_type", matchValue: "new" },
  "Change of Ownership": { dataField: "application_type", matchValue: "change_ownership" },
  "License Renewal": { dataField: "application_type", matchValue: "renewal" },
  "Equipment Type Truck": { dataField: "equipment_type", matchValue: "truck" },
  "Van": { dataField: "equipment_type", matchValue: "van" },
  "Trailer": { dataField: "equipment_type", matchValue: "trailer" },
  "Cart": { dataField: "equipment_type", matchValue: "cart" },
  "Operating Season Year Round": { dataField: "operating_season", matchValue: "year_round" },
  "Seasonal": { dataField: "operating_season", matchValue: "seasonal" },
  "Public": { dataField: "water_source", matchValue: "public" },
  "Private": { dataField: "water_source", matchValue: "private" },
  "Is a Three compartment sink available  YES": { dataField: "three_compartment_sink", matchValue: "yes" },
  "NO_2": { dataField: "three_compartment_sink", matchValue: "no" },
  "Are handwashing facilities available YES": { dataField: "handwash_available", matchValue: "yes" },
  "NO_3": { dataField: "handwash_available", matchValue: "no" },
  "Is hot and cold running water under pressure available at each handwashing sink YES": { dataField: "running_water", matchValue: "yes" },
  "NO_4": { dataField: "running_water", matchValue: "no" },
  "Complete Menu included  YES": { dataField: "menu_included", matchValue: "yes" },
  "NO_5": { dataField: "menu_included", matchValue: "no" },
  "refrigerated foods at 45F 5C and below YES": { dataField: "cold_storage_available", matchValue: "yes" },
  "NO_6": { dataField: "cold_storage_available", matchValue: "no" },
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
  },
  "danbury_itinerant": {
    formId: "danbury_itinerant",
    formName: "Itinerant Food Vendor Application",
    townName: "Danbury",
    pdfPath: "attached_assets/Itinerant-Food-Vendor-Application-PDF_1766452214150.pdf",
    useAcroForm: true,
    acroFieldMap: DANBURY_ACRO_FIELD_MAP,
    fields: {}
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
    "owner_name": getFromAny("contact_info", "applicant_name", "owner_name"),
    "business_name": getFromAny("contact_info", "business_name"),
    "address": streetAddress,
    "mailing_address": mailingAddress || streetAddress,
    "city": parsedCity,
    "state": parsedState,
    "zip": parsedZip,
    "phone": getFromAny("contact_info", "phone"),
    "business_phone": getFromAny("contact_info", "phone"),
    "cell_phone": getFromAny("contact_info", "phone"),
    "email": getFromAny("contact_info", "email"),
    "event_name": eventData?.eventName || getFromAny("contact_info", "business_name"),
    "event_location": eventData?.eventAddress || null,
    "event_dates": eventData?.eventDates || null,
    "hours_of_operation": eventData?.hoursOfOperation || null,
    "person_in_charge": eventData?.personInCharge || getFromAny("contact_info", "applicant_name", "owner_name"),
    "water_supply": waterSupply,
    "water_supply_event": waterSupply,
    "water_other_description": waterSupply.toLowerCase().includes("other") ? waterSupply : null,
    "sanitizer_type": getFromAny("operations", "sanitizer_type") || getFromAny("equipment_info", "sanitizer_type"),
    "temperature_control": getFromAny("safety", "temperature_monitoring_method") || getFromAny("equipment_info", "temp_monitoring"),
    "food_storage": getFromAny("safety", "cold_storage_method") || "Kept in coolers with ice, minimum 12 inches off ground",
    "sanitizer_description": getFromAny("operations", "sanitizer_type") || "Sanitizer test strips available",
    "food_prep_description": getFromAny("menu_and_prep", "prep_location") || "",
    "food_protection": "Food covered and protected from contamination",
    "license_type": licenseType,
    "toilet_facilities": toiletFacilities,
    "handwash_station": getFromAny("equipment_info", "handwash_setup") || "temporary",
    "handwash_on_sketch": "yes",
    "food_prepared_on_site": "yes",
    "fee_type": licenseType,
  };

  console.log("[PDF Service] Data map:", JSON.stringify(dataMap, null, 2));

  for (const field of fields) {
    const fieldName = field.getName();
    const fieldType = field.constructor.name;

    try {
      if (fieldType === "PDFTextField") {
        const textField = form.getTextField(fieldName);
        const dataKey = BETHEL_ACRO_FIELD_MAP[fieldName];
        
        if (dataKey && dataMap[dataKey]) {
          console.log(`[PDF Service] Setting text field "${fieldName}" to "${dataMap[dataKey]}"`);
          textField.setText(dataMap[dataKey] || "");
        }
      } else if (fieldType === "PDFCheckBox") {
        const checkbox = form.getCheckBox(fieldName);
        const checkboxConfig = BETHEL_CHECKBOX_MAP[fieldName];
        
        if (checkboxConfig) {
          const dataValue = dataMap[checkboxConfig.dataField];
          if (dataValue) {
            const shouldCheck = dataValue.toLowerCase().includes(checkboxConfig.matchValue.toLowerCase());
            if (shouldCheck) {
              console.log(`[PDF Service] Checking checkbox "${fieldName}" (${checkboxConfig.matchValue})`);
              checkbox.check();
            }
          }
        }
      }
    } catch (err) {
      console.error(`[PDF Service] Error filling field ${fieldName}:`, err);
    }
  }

  form.flatten();
}

async function fillDanburyAcroForm(
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
  
  console.log("[PDF Service] Filling Danbury AcroForm with", fields.length, "fields");

  const getFromAny = (category: string, ...fieldNames: string[]): string | null => {
    for (const field of fieldNames) {
      const value = getFieldValue(userData, category, field);
      if (value) return value;
    }
    return null;
  };

  const mailingAddress = getFromAny("contact_info", "mailing_address");
  let streetAddress = getFromAny("contact_info", "address");
  if (!streetAddress && mailingAddress) {
    streetAddress = mailingAddress;
  }

  const trailerMake = getFromAny("vehicle_info", "trailer_make");
  const trailerModel = getFromAny("vehicle_info", "trailer_model");
  const trailerMakeModel = [trailerMake, trailerModel].filter(Boolean).join(" ");

  const equipmentType = getFromAny("vehicle_info", "equipment_type") || "trailer";

  const dataMap: Record<string, string | null> = {
    "business_name": getFromAny("contact_info", "business_name"),
    "owner_name": getFromAny("contact_info", "owner_name", "applicant_name"),
    "address": streetAddress,
    "phone": getFromAny("contact_info", "phone"),
    "email": getFromAny("contact_info", "email"),
    "vin": getFromAny("vehicle_info", "vin"),
    "license_plate": getFromAny("vehicle_info", "license_plate"),
    "vehicle_color": getFromAny("vehicle_info", "color"),
    "trailer_make_model": trailerMakeModel || getFromAny("vehicle_info", "trailer_make"),
    "person_in_charge": eventData?.personInCharge || getFromAny("contact_info", "applicant_name", "owner_name"),
    "event_location": eventData?.eventAddress || null,
    "sanitizer_type": getFromAny("operations", "sanitizer_type") || getFromAny("equipment_info", "sanitizer_type"),
    "handwash_setup": getFromAny("equipment_info", "handwash_setup"),
    "glove_usage": "Yes, disposable gloves used",
    "food_source_1": getFromAny("menu_and_prep", "food_source_location"),
    "food_source_2": "",
    "food_storage": getFromAny("safety", "cold_storage_method") || "Commercial refrigeration at commissary",
    "food_prep_1": getFromAny("menu_and_prep", "prep_location"),
    "food_prep_2": "",
    "cooking_equipment": getFromAny("equipment_info", "cooking_equipment"),
    "hot_holding": getFromAny("safety", "hot_holding_method"),
    "hot_holding_units_1": "",
    "hot_holding_units_2": "",
    "cooling_method_1": "",
    "cooling_method_2": "",
    "cooling_method_3": "",
    "reheating_method": "",
    "reheating_units": "",
    "cold_holding_units_1": "",
    "cold_holding_units_2": "",
    "toilet_facilities": getFromAny("commissary_info", "toilet_facilities") || getFromAny("operations", "toilet_facilities"),
    "year": new Date().getFullYear().toString(),
    "equipment_type": equipmentType,
    "application_type": "renewal",
    "operating_season": eventData?.licenseType === "seasonal" ? "seasonal" : "year_round",
    "water_source": "public",
    "three_compartment_sink": "yes",
    "handwash_available": "yes",
    "running_water": "yes",
    "menu_included": "yes",
    "cold_storage_available": "yes",
  };

  console.log("[PDF Service] Danbury Data map:", JSON.stringify(dataMap, null, 2));

  for (const field of fields) {
    const fieldName = field.getName();
    const fieldType = field.constructor.name;

    try {
      if (fieldType === "PDFTextField") {
        const textField = form.getTextField(fieldName);
        const dataKey = DANBURY_ACRO_FIELD_MAP[fieldName];
        
        if (dataKey && dataMap[dataKey]) {
          console.log(`[PDF Service] Danbury: Setting text field "${fieldName}" to "${dataMap[dataKey]}"`);
          textField.setText(dataMap[dataKey] || "");
        }
      } else if (fieldType === "PDFCheckBox") {
        const checkbox = form.getCheckBox(fieldName);
        const checkboxConfig = DANBURY_CHECKBOX_MAP[fieldName];
        
        if (checkboxConfig) {
          const dataValue = dataMap[checkboxConfig.dataField];
          if (dataValue) {
            const shouldCheck = dataValue.toLowerCase().includes(checkboxConfig.matchValue.toLowerCase());
            if (shouldCheck) {
              console.log(`[PDF Service] Danbury: Checking checkbox "${fieldName}" (${checkboxConfig.matchValue})`);
              checkbox.check();
            }
          }
        }
      }
    } catch (err) {
      console.error(`[PDF Service] Error filling Danbury field ${fieldName}:`, err);
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
  } else if (template.useAcroForm && templateId === "danbury_itinerant") {
    await fillDanburyAcroForm(pdfDoc, userData, eventData);
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
