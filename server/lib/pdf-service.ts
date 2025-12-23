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
  fields: Record<string, FieldMapping>;
}

interface ParsedFieldValue {
  value: string | null;
  status?: string;
  confidence?: number;
  source_text?: string | null;
}

// Dynamic parsed data structure - matches Gemini AI extraction output
// Using Record type for flexibility as Gemini outputs vary
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

const FORM_TEMPLATES: Record<string, FormTemplate> = {
  "newtown_mfe": {
    formId: "newtown_mfe",
    formName: "MFE License Application",
    townName: "Newtown",
    pdfPath: "attached_assets/Fillable_FOOD_SERVICE_PLAN_Review_Application_Packet_7-15-25_1766435479788.pdf",
    fields: {
      "business_name": { page: 0, x: 200, y: 680, fontSize: 11 },
      "owner_name": { page: 0, x: 200, y: 655, fontSize: 11 },
      "address": { page: 0, x: 200, y: 630, fontSize: 11 },
      "city_state_zip": { page: 0, x: 200, y: 605, fontSize: 11 },
      "phone": { page: 0, x: 200, y: 580, fontSize: 11 },
      "email": { page: 0, x: 200, y: 555, fontSize: 11 },
      "trailer_info": { page: 0, x: 200, y: 530, fontSize: 11 },
      "vin": { page: 0, x: 200, y: 505, fontSize: 11 },
      "license_plate": { page: 0, x: 200, y: 480, fontSize: 11 },
      "menu_items": { page: 0, x: 100, y: 350, fontSize: 10, maxWidth: 400 },
      "water_supply_public": { page: 0, x: 105, y: 280, isCheckbox: true, checkboxValue: "public water" },
      "water_supply_tank": { page: 0, x: 105, y: 260, isCheckbox: true, checkboxValue: "tank" },
      "waste_water_holding": { page: 0, x: 105, y: 220, isCheckbox: true, checkboxValue: "holding tank" },
      "waste_water_commissary": { page: 0, x: 105, y: 200, isCheckbox: true, checkboxValue: "commissary" },
      "sanitizer_chlorine": { page: 0, x: 300, y: 280, isCheckbox: true, checkboxValue: "chlorine" },
      "sanitizer_quat": { page: 0, x: 300, y: 260, isCheckbox: true, checkboxValue: "quaternary" },
      "temp_monitoring": { page: 0, x: 200, y: 180, fontSize: 10 },
      "commissary_name": { page: 0, x: 200, y: 140, fontSize: 10 },
      "commissary_address": { page: 0, x: 200, y: 120, fontSize: 10 },
    }
  },
  "bethel_seasonal": {
    formId: "bethel_seasonal",
    formName: "Temporary/Seasonal Food Service License",
    townName: "Bethel",
    pdfPath: "attached_assets/Fillable_TemporarySeasonal_Food_Service_License_Application_Fi_1766435479788.pdf",
    fields: {
      "business_name": { page: 0, x: 180, y: 695, fontSize: 11 },
      "owner_name": { page: 0, x: 180, y: 670, fontSize: 11 },
      "address": { page: 0, x: 180, y: 645, fontSize: 11 },
      "city_state_zip": { page: 0, x: 180, y: 620, fontSize: 11 },
      "phone": { page: 0, x: 180, y: 595, fontSize: 11 },
      "email": { page: 0, x: 400, y: 595, fontSize: 11 },
      "event_name": { page: 0, x: 180, y: 540, fontSize: 11 },
      "event_address": { page: 0, x: 180, y: 515, fontSize: 11 },
      "event_dates": { page: 0, x: 180, y: 490, fontSize: 11 },
      "menu_items": { page: 0, x: 100, y: 400, fontSize: 10, maxWidth: 400 },
      "water_supply_public": { page: 0, x: 95, y: 320, isCheckbox: true, checkboxValue: "public water" },
      "water_supply_tank": { page: 0, x: 95, y: 300, isCheckbox: true, checkboxValue: "tank" },
      "waste_water_holding": { page: 0, x: 95, y: 260, isCheckbox: true, checkboxValue: "holding tank" },
      "sanitizer_type": { page: 0, x: 180, y: 220, fontSize: 10 },
      "temp_monitoring": { page: 0, x: 180, y: 200, fontSize: 10 },
    }
  },
  "newtown_new_license": {
    formId: "newtown_new_license",
    formName: "Food License New/Change Owner/Renewal Application",
    townName: "Newtown",
    pdfPath: "attached_assets/Food_License_New-Chg_Owner-Renewal_Application_2025_Rev.7-10-2_1766435479789.pdf",
    fields: {
      "business_name": { page: 0, x: 200, y: 700, fontSize: 11 },
      "owner_name": { page: 0, x: 200, y: 675, fontSize: 11 },
      "address": { page: 0, x: 200, y: 650, fontSize: 11 },
      "city": { page: 0, x: 200, y: 625, fontSize: 11 },
      "state": { page: 0, x: 350, y: 625, fontSize: 11 },
      "zip": { page: 0, x: 420, y: 625, fontSize: 11 },
      "phone": { page: 0, x: 200, y: 600, fontSize: 11 },
      "email": { page: 0, x: 350, y: 600, fontSize: 11 },
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

export async function fillPdfForm(
  templateId: string,
  userData: ParsedUserData,
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
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

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  // Helper to get value from various possible field names
  const getFromAny = (category: string, ...fieldNames: string[]): string | null => {
    for (const field of fieldNames) {
      const value = getFieldValue(userData, category, field);
      if (value) return value;
    }
    return null;
  };

  // Parse address components from mailing_address if individual fields don't exist
  const mailingAddress = getFieldValue(userData, "contact_info", "mailing_address");
  let parsedCity = getFieldValue(userData, "contact_info", "city");
  let parsedState = getFieldValue(userData, "contact_info", "state");
  let parsedZip = getFieldValue(userData, "contact_info", "zip");
  let streetAddress = getFieldValue(userData, "contact_info", "address");
  
  if (mailingAddress && (!parsedCity || !parsedState || !parsedZip)) {
    // Try to parse: "126 Morningside Drive Bridgeport, CT 06606"
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

  // Log field extraction for debugging
  console.log("[PDF Service] Extracting data from parsed profile...");
  console.log("[PDF Service] Business Name:", getFromAny("contact_info", "business_name"));
  console.log("[PDF Service] Owner/Applicant:", getFromAny("contact_info", "owner_name", "applicant_name"));
  console.log("[PDF Service] Email:", getFromAny("contact_info", "email"));
  console.log("[PDF Service] Phone:", getFromAny("contact_info", "phone"));
  console.log("[PDF Service] Address:", streetAddress);
  console.log("[PDF Service] Menu Items:", getFromAny("menu_and_prep", "food_items_list") || getFromAny("food_info", "menu_items"));
  
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
    "trailer_info": [
      getFromAny("vehicle_info", "trailer_year"),
      getFromAny("vehicle_info", "trailer_make"),
      getFromAny("vehicle_info", "trailer_model")
    ].filter(Boolean).join(" "),
    "vin": getFromAny("vehicle_info", "vin"),
    "license_plate": getFromAny("license_info", "license_number", "vehicle_license_plate") || 
                     getFromAny("vehicle_info", "license_plate"),
    "menu_items": getFromAny("menu_and_prep", "food_items_list") || 
                  getFromAny("food_info", "menu_items"),
    "sanitizer_type": getFromAny("operations", "sanitizer_type") || 
                      getFromAny("equipment_info", "sanitizer_type"),
    "temp_monitoring": getFromAny("safety", "temperature_monitoring_method") ||
                       getFromAny("equipment_info", "temp_monitoring"),
    "commissary_name": getFromAny("menu_and_prep", "prep_location") ||
                       getFromAny("commissary_info", "commissary_name"),
    "commissary_address": getFromAny("commissary_info", "commissary_address"),
    "event_name": eventData?.eventName || null,
    "event_address": eventData?.eventAddress || null,
    "event_dates": eventData?.eventDates || null,
  };

  const waterSupply = getFromAny("operations", "water_supply_type") ||
                      getFromAny("equipment_info", "water_supply");
  const wasteWater = getFromAny("safety", "waste_water_disposal") ||
                     getFromAny("equipment_info", "waste_water");
  const sanitizer = getFromAny("operations", "sanitizer_type") ||
                    getFromAny("equipment_info", "sanitizer_type");

  for (const [fieldName, mapping] of Object.entries(template.fields)) {
    const page = pages[mapping.page];
    if (!page) continue;

    if (mapping.isCheckbox) {
      let shouldCheck = false;
      
      if (fieldName.includes("water_supply")) {
        shouldCheck = matchesCheckbox(waterSupply, mapping.checkboxValue || "");
      } else if (fieldName.includes("waste_water")) {
        shouldCheck = matchesCheckbox(wasteWater, mapping.checkboxValue || "");
      } else if (fieldName.includes("sanitizer")) {
        shouldCheck = matchesCheckbox(sanitizer, mapping.checkboxValue || "");
      }

      if (shouldCheck) {
        page.drawText("X", {
          x: mapping.x,
          y: mapping.y,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      const value = fieldDataMap[fieldName];
      if (value) {
        const fontSize = mapping.fontSize || 11;
        let textToDraw = value;
        
        if (mapping.maxWidth) {
          const textWidth = font.widthOfTextAtSize(value, fontSize);
          if (textWidth > mapping.maxWidth) {
            const charWidth = textWidth / value.length;
            const maxChars = Math.floor(mapping.maxWidth / charWidth);
            textToDraw = value.substring(0, maxChars - 3) + "...";
          }
        }

        page.drawText(textToDraw, {
          x: mapping.x,
          y: mapping.y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
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
