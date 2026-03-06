import Tesseract from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  extractedData: ExtractedPermitData;
}

export interface ExtractedPermitData {
  businessName?: string;
  licenseNumber?: string;
  expirationDate?: string;
  issuedDate?: string;
  address?: string;
  vin?: string;
  licensePlate?: string;
  vinPlate?: string;
}

const datePatterns = [
  /(?:exp(?:ires?|iration)?[:\s]*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
];

const licensePatterns = [
  /(?:license|permit|cert(?:ificate)?)\s*(?:#|no\.?|number)?[:\s]*([A-Z0-9\-]+)/gi,
  /(?:#|no\.?)\s*([A-Z0-9\-]{5,})/gi,
];

const vinPatterns = [
  /\b[A-HJ-NPR-Z0-9]{17}\b/g,
  /(?:plate|reg(?:istration)?)[:\s]*([A-Z0-9\-]{2,10})/gi,
];

function extractDates(text: string): string[] {
  const dates: string[] = [];
  for (const pattern of datePatterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      dates.push(match[1] || match[0]);
    }
  }
  return Array.from(new Set(dates));
}

function extractLicenseNumbers(text: string): string[] {
  const licenses: string[] = [];
  for (const pattern of licensePatterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      licenses.push(match[1] || match[0]);
    }
  }
  return Array.from(new Set(licenses)).filter(l => l.length >= 5);
}

function extractVinAndPlate(text: string): { vin?: string; licensePlate?: string } {
  let vin: string | undefined;
  let licensePlate: string | undefined;
  
  for (const pattern of vinPatterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] || match[0];
      if (value.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
        vin = value;
      } else if (value.length >= 2 && value.length <= 10) {
        licensePlate = value;
      }
    }
  }
  return { vin, licensePlate };
}

function extractBusinessName(text: string): string | undefined {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  for (const line of lines.slice(0, 5)) {
    if (line.length > 5 && line.length < 50) {
      const isLikelyName = /^[A-Z][a-zA-Z\s&',.-]+$/.test(line) ||
                          /(?:LLC|INC|CORP|CO\.?|TRUCK|FOOD|MOBILE)/i.test(line);
      if (isLikelyName) {
        return line;
      }
    }
  }
  return undefined;
}

function extractAddress(text: string): string | undefined {
  const addressPatterns = [
    /\d+\s+[A-Za-z\s]+(?:St(?:reet)?|Ave(?:nue)?|Rd|Road|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)[,.\s]+[A-Za-z\s]+,?\s*(?:CT|MA|NY|RI|NJ|PA)\s*\d{5}/gi,
    /\d+\s+[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}/gi,
  ];
  
  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

export async function performOCR(
  imageSource: string | File,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  const result = await Tesseract.recognize(
    imageSource,
    'eng',
    {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(m.progress * 100);
        }
      },
    }
  );

  const text = result.data.text;
  const confidence = result.data.confidence;

  const dates = extractDates(text);
  const licenses = extractLicenseNumbers(text);
  const { vin, licensePlate } = extractVinAndPlate(text);
  
  const extractedData: ExtractedPermitData = {
    businessName: extractBusinessName(text),
    licenseNumber: licenses[0],
    expirationDate: dates.length > 0 ? dates[dates.length - 1] : undefined,
    issuedDate: dates.length > 1 ? dates[0] : undefined,
    address: extractAddress(text),
    vin,
    licensePlate,
  };

  return {
    text,
    confidence,
    extractedData,
  };
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || 
         /\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i.test(file.name);
}

export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || 
         file.name.toLowerCase().endsWith('.pdf');
}

export function detectDocumentType(text: string, fileName?: string): { type: string; confidence: number } {
  const combinedText = `${fileName || ''} ${text}`.toLowerCase();
  
  // Menu detection - food items, prices, descriptions
  if (/menu|appetizer|entree|dessert|beverage|sandwich|burger|taco|pizza|\$\d+\.\d{2}|food.*item/i.test(combinedText)) {
    return { type: 'menu', confidence: 85 };
  }
  
  // Trailer/Truck diagram - dimensions, layout, equipment positions
  if (/diagram|layout|dimension|floor.*plan|equipment.*location|sink|grill|fryer|refrigerat|freezer|propane.*tank|exhaust|ventilation|schematic/i.test(combinedText)) {
    return { type: 'trailer-diagram', confidence: 80 };
  }
  
  // Certificate of Insurance (COI)
  if (/certificate.*insurance|cert.*of.*ins|coi|general.*liability|commercial.*auto|workers.*comp|policy.*number|insured|insurer|coverage.*limit/i.test(combinedText)) {
    return { type: 'coi', confidence: 90 };
  }
  
  // Food Manager Certificate / ServSafe
  if (/servsafe|food.*manager|food.*handler|food.*protection|cfpm|food.*safety.*cert|manager.*cert/i.test(combinedText)) {
    return { type: 'food-manager-cert', confidence: 90 };
  }
  
  // Vehicle Registration
  if (/registr|dmv|motor.*vehicle|title|vin|vehicle.*identification|plate.*number|department.*motor/i.test(combinedText)) {
    return { type: 'vehicle-registration', confidence: 85 };
  }
  
  // Health Permit
  if (/health.*permit|health.*dept|health.*department|sanitar|food.*establishment|food.*service.*license|health.*inspection/i.test(combinedText)) {
    return { type: 'health-permit', confidence: 85 };
  }
  
  // Fire Safety Certificate
  if (/fire.*safety|fire.*marshal|fire.*suppression|extinguisher|fire.*inspect|propane.*cert|ansul|hood.*system/i.test(combinedText)) {
    return { type: 'fire-safety', confidence: 85 };
  }
  
  // Commissary Letter/Agreement
  if (/commissary|shared.*kitchen|commercial.*kitchen|food.*prep.*facility|agreement.*use|kitchen.*agreement/i.test(combinedText)) {
    return { type: 'commissary-letter', confidence: 80 };
  }
  
  // Business License
  if (/business.*license|dba|doing.*business|trade.*name|llc|corporation|business.*registration/i.test(combinedText)) {
    return { type: 'business-license', confidence: 80 };
  }
  
  // Tax Clearance
  if (/tax.*clear|tax.*certificate|good.*standing|revenue|dept.*revenue|tax.*compliance/i.test(combinedText)) {
    return { type: 'tax-clearance', confidence: 80 };
  }
  
  // Permit Application - forms to apply for permits
  if (/application|itinerant|vendor.*permit|food.*vendor|apply.*permit|permit.*form|town.*of|municipality/i.test(combinedText)) {
    return { type: 'permit-application', confidence: 75 };
  }
  
  // Bond / Surety
  if (/bond|surety|guaranty|indemnity|performance.*bond|surety.*bond/i.test(combinedText)) {
    return { type: 'bond-surety', confidence: 85 };
  }
  
  // Supplier List
  if (/supplier|vendor.*list|food.*source|purveyors|wholesale|distributor|supply.*chain/i.test(combinedText)) {
    return { type: 'supplier-list', confidence: 80 };
  }
  
  // Equipment List
  if (/equipment.*list|inventory|appliance|cooking.*equipment|refrigeration|freezer.*list|equipment.*schedule/i.test(combinedText)) {
    return { type: 'equipment-list', confidence: 80 };
  }
  
  return { type: 'other', confidence: 0 };
}

export function detectDocumentTypeFromFileName(fileName: string): { type: string; confidence: number } {
  const name = fileName.toLowerCase();
  
  if (/menu/i.test(name)) return { type: 'menu', confidence: 95 };
  if (/diagram|layout|floor.*plan|schematic/i.test(name)) return { type: 'trailer-diagram', confidence: 90 };
  if (/coi|insurance|liability/i.test(name)) return { type: 'coi', confidence: 90 };
  if (/servsafe|food.*manager|cfpm|handler/i.test(name)) return { type: 'food-manager-cert', confidence: 90 };
  if (/registration|dmv|title|vehicle/i.test(name)) return { type: 'vehicle-registration', confidence: 85 };
  if (/health.*permit|health.*license/i.test(name)) return { type: 'health-permit', confidence: 85 };
  if (/fire|propane|suppression/i.test(name)) return { type: 'fire-safety', confidence: 85 };
  if (/commissary|kitchen.*agreement/i.test(name)) return { type: 'commissary-letter', confidence: 80 };
  if (/business.*license|llc|dba/i.test(name)) return { type: 'business-license', confidence: 80 };
  if (/tax.*clear|good.*standing/i.test(name)) return { type: 'tax-clearance', confidence: 80 };
  if (/application|itinerant|vendor.*app|permit.*app/i.test(name)) return { type: 'permit-application', confidence: 80 };
  if (/bond|surety/i.test(name)) return { type: 'bond-surety', confidence: 85 };
  if (/supplier|vendor.*list|source/i.test(name)) return { type: 'supplier-list', confidence: 80 };
  if (/equipment|inventory|appliance/i.test(name)) return { type: 'equipment-list', confidence: 80 };
  
  return { type: 'other', confidence: 0 };
}
