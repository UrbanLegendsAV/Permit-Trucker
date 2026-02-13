import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";
import type { Town, TownForm } from "@shared/schema";
import { z } from "zod";

const formDiscoveryResponseSchema = z.object({
  town_website: z.string().nullable().optional(),
  health_department_website: z.string().nullable().optional(),
  forms_found: z.array(z.object({
    url: z.string(),
    name: z.string(),
    type: z.enum(["temporary_permit", "yearly_permit", "seasonal_permit", "checklist", "health_inspection", "fire_safety", "other"]).optional().default("other"),
    is_pdf: z.boolean().optional().default(true),
    description: z.string().optional(),
  })).optional().default([]),
  notes: z.array(z.string()).optional().default([]),
  confidence_score: z.number().min(0).max(100).optional().default(50),
});

type FormDiscoveryResponse = z.infer<typeof formDiscoveryResponseSchema>;

interface DiscoveryResult {
  success: boolean;
  formsDiscovered: number;
  formsDownloaded: number;
  forms: Array<{
    name: string;
    url: string;
    downloaded: boolean;
  }>;
  error?: string;
  townWebsite?: string;
  healthDeptWebsite?: string;
}

const DOWNLOAD_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const SKIP_STATUS_CODES = [403, 404, 406];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class FormDiscoveryService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  private buildDiscoveryPrompt(townName: string, state: string, county?: string | null): string {
    const location = county ? `${townName}, ${county} County, ${state}` : `${townName}, ${state}`;
    
    return `You are an expert at finding official government permit forms. Research food truck and mobile food vendor permit applications for: ${location}

IMPORTANT: You must find ACTUAL, REAL URLs to official PDF forms from this specific municipality's government website. Do NOT make up URLs or guess at domain names.

Search strategy:
1. Find the official town/city website for ${townName}, ${state}
2. Look for the Health Department or Environmental Health section
3. Find the Licensing/Permits section
4. Locate food service, mobile food vendor, food truck, or itinerant vendor permit applications

Common form names to look for:
- Mobile Food Establishment Application/Permit
- Temporary Food Service Permit
- Food Vendor License Application
- Itinerant Vendor Application
- Mobile Food Unit Registration
- Seasonal Food Permit
- Event Vendor Permit

Connecticut-specific knowledge:
- Many CT towns use their local Health District for food permits
- Common health districts: NDDH, Quinnipiack Valley, Farmington Valley, etc.
- Forms often at: town websites, health district sites, or CT DPH

Return ONLY valid JSON in this exact format:
{
  "town_website": "Official town/city website URL or null",
  "health_department_website": "Health department or licensing portal URL or null",
  "forms_found": [
    {
      "url": "EXACT URL to the PDF form (must be real, verified URL ending in .pdf or direct download link)",
      "name": "Human-readable form name",
      "type": "temporary_permit | yearly_permit | seasonal_permit | checklist | health_inspection | fire_safety | other",
      "is_pdf": true,
      "description": "Brief description of what this form is for"
    }
  ],
  "notes": ["Any important notes about the permit process"],
  "confidence_score": 0-100 (how confident you are these are REAL, working URLs)
}

CRITICAL: Only include forms_found entries if you are confident the URL is real and accessible. An empty array is better than fake URLs.`;
  }

  private parseAndValidateResponse(responseText: string): { parsed: FormDiscoveryResponse | null; error?: string } {
    try {
      let jsonText = responseText;
      if (jsonText.includes("```json")) {
        jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonText.includes("```")) {
        jsonText = jsonText.replace(/```\s*/g, "");
      }
      
      const rawParsed = JSON.parse(jsonText.trim());
      const validated = formDiscoveryResponseSchema.safeParse(rawParsed);
      
      if (!validated.success) {
        console.error("[FormDiscovery] Schema validation failed:", validated.error.errors);
        return { parsed: null, error: `Schema validation failed: ${validated.error.message}` };
      }
      
      return { parsed: validated.data };
    } catch (error: any) {
      console.error("[FormDiscovery] JSON parse error:", error.message);
      return { parsed: null, error: `JSON parse error: ${error.message}` };
    }
  }

  private async validateUrl(url: string): Promise<{ valid: boolean; reason?: string }> {
    console.log(`[FormDiscovery] Validating URL with HEAD request: ${url}`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (SKIP_STATUS_CODES.includes(response.status)) {
        console.log(`[FormDiscovery] URL validation FAILED - status ${response.status}: ${url}`);
        return { valid: false, reason: `HTTP ${response.status}` };
      }

      if (!response.ok) {
        console.log(`[FormDiscovery] URL validation FAILED - status ${response.status}: ${url}`);
        return { valid: false, reason: `HTTP ${response.status}` };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !url.toLowerCase().endsWith('.pdf')) {
        console.log(`[FormDiscovery] URL validation FAILED - not PDF (content-type: ${contentType}): ${url}`);
        return { valid: false, reason: `Non-PDF content-type: ${contentType}` };
      }

      console.log(`[FormDiscovery] URL validation PASSED: ${url}`);
      return { valid: true };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`[FormDiscovery] URL validation FAILED - timeout: ${url}`);
        return { valid: false, reason: 'HEAD request timeout' };
      }
      console.log(`[FormDiscovery] URL validation FAILED - error: ${error.message}: ${url}`);
      return { valid: false, reason: error.message };
    }
  }

  private async downloadPdfWithRetry(url: string): Promise<{ base64: string; fileName: string; size: number } | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[FormDiscovery] Retry ${attempt}/${MAX_RETRIES} for ${url} after ${backoffMs}ms backoff`);
        await sleep(backoffMs);
      }

      const result = await this.downloadPdf(url);
      if (result) {
        return result;
      }

      if (attempt < MAX_RETRIES) {
        console.log(`[FormDiscovery] Download attempt ${attempt + 1} failed for ${url}, will retry...`);
      }
    }

    console.error(`[FormDiscovery] Download FAILED after ${MAX_RETRIES + 1} attempts, skipping URL: ${url}`);
    return null;
  }

  private async downloadPdf(url: string): Promise<{ base64: string; fileName: string; size: number } | null> {
    try {
      console.log(`[FormDiscovery] Attempting to download PDF from: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[FormDiscovery] Download failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !url.toLowerCase().endsWith('.pdf')) {
        console.warn(`[FormDiscovery] Not a PDF (content-type: ${contentType}), skipping`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength < 1000) {
        console.warn(`[FormDiscovery] File too small (${arrayBuffer.byteLength} bytes), likely not a valid PDF`);
        return null;
      }

      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const fileName = this.extractFileName(url, response);
      const size = arrayBuffer.byteLength;

      console.log(`[FormDiscovery] Download SUCCESS: ${fileName} (${Math.round(size / 1024)}KB)`);
      
      return { base64, fileName, size };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error(`[FormDiscovery] Download timeout for ${url}`);
      } else {
        console.error(`[FormDiscovery] Error downloading from ${url}:`, error.message);
      }
      return null;
    }
  }

  private extractFileName(url: string, response: Response): string {
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        return match[1].replace(/['"]/g, '');
      }
    }
    
    const urlPath = new URL(url).pathname;
    const fileName = urlPath.split('/').pop() || 'form.pdf';
    return fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  }

  private inferCategory(formType: string, name: string): "temporary_permit" | "seasonal_permit" | "yearly_permit" | "checklist" | "health_inspection" | "fire_safety" | "other" {
    const nameLower = name.toLowerCase();
    
    if (formType !== "other") {
      return formType as any;
    }
    
    if (nameLower.includes('temporary') || nameLower.includes('event') || nameLower.includes('special')) {
      return 'temporary_permit';
    }
    if (nameLower.includes('seasonal')) {
      return 'seasonal_permit';
    }
    if (nameLower.includes('yearly') || nameLower.includes('annual') || nameLower.includes('mobile food')) {
      return 'yearly_permit';
    }
    if (nameLower.includes('checklist') || nameLower.includes('guide') || nameLower.includes('requirement')) {
      return 'checklist';
    }
    if (nameLower.includes('health') || nameLower.includes('inspection')) {
      return 'health_inspection';
    }
    if (nameLower.includes('fire')) {
      return 'fire_safety';
    }
    
    return 'other';
  }

  private activeDiscoveries = new Set<string>();

  isDiscoveryActive(townId: string): boolean {
    return this.activeDiscoveries.has(townId);
  }

  isConfigured(): boolean {
    return this.genAI !== null;
  }

  async discoverFormsForTown(townId: string, options: { force?: boolean } = {}): Promise<DiscoveryResult> {
    console.log(`[FormDiscovery] === Discovery STARTED for town ID: ${townId} (force: ${options.force || false}) ===`);
    
    if (!this.genAI) {
      console.log(`[FormDiscovery] Discovery ABORTED - GOOGLE_API_KEY not configured`);
      return { 
        success: false, 
        formsDiscovered: 0, 
        formsDownloaded: 0, 
        forms: [],
        error: "GOOGLE_API_KEY not configured" 
      };
    }

    const town = await storage.getTown(townId);
    if (!town) {
      console.log(`[FormDiscovery] Discovery ABORTED - Town not found: ${townId}`);
      return { 
        success: false, 
        formsDiscovered: 0, 
        formsDownloaded: 0, 
        forms: [],
        error: "Town not found" 
      };
    }

    if (this.activeDiscoveries.has(townId)) {
      console.log(`[FormDiscovery] Discovery SKIPPED - already in progress for ${town.townName}`);
      return {
        success: false,
        formsDiscovered: 0,
        formsDownloaded: 0,
        forms: [],
        error: "Discovery already in progress for this town"
      };
    }

    const existingForms = await storage.getTownForms(townId);
    if (existingForms.length > 0 && !options.force) {
      console.log(`[FormDiscovery] Discovery SKIPPED - ${town.townName} already has ${existingForms.length} forms`);
      return {
        success: true,
        formsDiscovered: 0,
        formsDownloaded: 0,
        forms: [],
        error: "Town already has forms"
      };
    }

    this.activeDiscoveries.add(townId);

    try {
      console.log(`[FormDiscovery] Querying Gemini AI for forms in ${town.townName}, ${town.state}...`);
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = this.buildDiscoveryPrompt(town.townName, town.state, town.county);

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      console.log(`[FormDiscovery] Gemini response received, parsing...`);

      const { parsed, error } = this.parseAndValidateResponse(responseText);
      
      if (!parsed) {
        console.error(`[FormDiscovery] Failed to parse Gemini response: ${error}`);
        return { 
          success: false, 
          formsDiscovered: 0, 
          formsDownloaded: 0, 
          forms: [],
          error: error || "Failed to parse AI response" 
        };
      }

      const formsFound = parsed.forms_found || [];
      console.log(`[FormDiscovery] URLs found: ${formsFound.length} potential forms for ${town.townName}`);
      formsFound.forEach((f, i) => console.log(`[FormDiscovery]   ${i + 1}. ${f.name}: ${f.url}`));

      const discoveryResult: DiscoveryResult = {
        success: true,
        formsDiscovered: formsFound.length,
        formsDownloaded: 0,
        forms: [],
        townWebsite: parsed.town_website || undefined,
        healthDeptWebsite: parsed.health_department_website || undefined,
      };

      for (const formInfo of formsFound) {
        if (!formInfo.url || !formInfo.url.startsWith('http')) {
          console.warn(`[FormDiscovery] Skipping invalid URL (not http): ${formInfo.url}`);
          continue;
        }

        const existingForm = await storage.getTownFormBySourceUrl(townId, formInfo.url);
        if (existingForm) {
          console.log(`[FormDiscovery] Dedup: form with sourceUrl already exists, skipping: ${formInfo.url}`);
          discoveryResult.forms.push({
            name: formInfo.name,
            url: formInfo.url,
            downloaded: false,
          });
          continue;
        }

        const validation = await this.validateUrl(formInfo.url);
        if (!validation.valid) {
          console.log(`[FormDiscovery] Skipping URL that failed validation (${validation.reason}): ${formInfo.url}`);
          discoveryResult.forms.push({
            name: formInfo.name,
            url: formInfo.url,
            downloaded: false,
          });
          continue;
        }

        const pdfData = await this.downloadPdfWithRetry(formInfo.url);
        const category = this.inferCategory(formInfo.type || 'other', formInfo.name);
        
        try {
          await storage.createTownForm({
            townId: town.id,
            name: formInfo.name || `${town.townName} Permit Application`,
            description: formInfo.description || null,
            category,
            externalUrl: formInfo.url,
            sourceUrl: formInfo.url,
            fileData: pdfData?.base64 || null,
            fileName: pdfData?.fileName || formInfo.url.split('/').pop() || 'form.pdf',
            fileType: 'application/pdf',
            isAiDiscovered: true,
            isFillable: false,
          });

          discoveryResult.forms.push({
            name: formInfo.name,
            url: formInfo.url,
            downloaded: !!pdfData,
          });

          if (pdfData) {
            discoveryResult.formsDownloaded++;
          }

          console.log(`[FormDiscovery] Form SAVED: ${formInfo.name} (downloaded: ${!!pdfData})`);
        } catch (createError: any) {
          console.error(`[FormDiscovery] Failed to save form entry:`, createError.message);
        }
      }

      if (parsed.town_website || parsed.health_department_website) {
        try {
          await storage.updateTown(townId, {
            portalUrl: parsed.health_department_website || parsed.town_website || town.portalUrl,
          });
        } catch (updateError) {
          console.warn(`[FormDiscovery] Failed to update town portal URL:`, updateError);
        }
      }

      console.log(`[FormDiscovery] === Discovery COMPLETED for ${town.townName}: ${discoveryResult.formsDownloaded}/${discoveryResult.formsDiscovered} forms downloaded ===`);
      
      return discoveryResult;
    } catch (error: any) {
      console.error(`[FormDiscovery] === Discovery FAILED for town ${townId}: ${error.message} ===`);
      return { 
        success: false, 
        formsDiscovered: 0, 
        formsDownloaded: 0, 
        forms: [],
        error: error.message || "Form discovery failed" 
      };
    } finally {
      this.activeDiscoveries.delete(townId);
    }
  }

  async discoverFormsForTownByName(townName: string, state: string = "CT"): Promise<DiscoveryResult> {
    const towns = await storage.getTowns();
    const town = towns.find(t => 
      t.townName.toLowerCase() === townName.toLowerCase() && 
      t.state.toUpperCase() === state.toUpperCase()
    );

    if (!town) {
      return {
        success: false,
        formsDiscovered: 0,
        formsDownloaded: 0,
        forms: [],
        error: `Town "${townName}, ${state}" not found in database`
      };
    }

    return this.discoverFormsForTown(town.id);
  }
}

export const formDiscoveryService = new FormDiscoveryService();
