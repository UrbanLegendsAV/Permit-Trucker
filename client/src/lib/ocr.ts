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

function extractVinPlate(text: string): string | undefined {
  for (const pattern of vinPatterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] || match[0];
      if (value.length >= 2 && value.length <= 17) {
        return value;
      }
    }
  }
  return undefined;
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
  
  const extractedData: ExtractedPermitData = {
    businessName: extractBusinessName(text),
    licenseNumber: licenses[0],
    expirationDate: dates.length > 0 ? dates[dates.length - 1] : undefined,
    issuedDate: dates.length > 1 ? dates[0] : undefined,
    address: extractAddress(text),
    vinPlate: extractVinPlate(text),
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
