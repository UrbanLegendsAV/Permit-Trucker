import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";
import type { Town, TownForm } from "@shared/schema";
import { PDFDocument } from "pdf-lib";
import * as cheerio from "cheerio";

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

interface CrawledPdf {
  url: string;
  linkText: string;
  sourcePage: string;
}

const DOWNLOAD_TIMEOUT_MS = 30000;
const CRAWL_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const DISCOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class FormDiscoveryService {
  private genAI: GoogleGenerativeAI | null = null;
  private activeDiscoveries = new Set<string>();
  private discoveryAttempts = new Map<string, number>(); // townId -> timestamp of last attempt

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  isDiscoveryActive(townId: string): boolean {
    return this.activeDiscoveries.has(townId);
  }

  isConfigured(): boolean {
    return true; // Crawling works without API key; AI classification is optional
  }

  private buildSeedUrls(town: Town, healthDistrictWebsite?: string | null): string[] {
    const urls: string[] = [];
    const townSlug = town.townName.toLowerCase().replace(/\s+/g, '');
    const townSlugDash = town.townName.toLowerCase().replace(/\s+/g, '-');

    if (town.portalUrl) urls.push(town.portalUrl);
    if (healthDistrictWebsite) urls.push(healthDistrictWebsite);

    urls.push(`https://www.${townSlug}ct.gov`);
    urls.push(`https://www.${townSlugDash}.org`);
    urls.push(`https://${townSlug}ct.gov`);
    urls.push(`https://www.${townSlug}.com`);

    const foodPaths = [
      '/town-departments/health-district/online-forms',
      '/town-departments/health-district',
      '/departments/health/permits',
      '/departments/health',
      '/health/food-service',
      '/health/permits',
      '/permits/food-truck',
      '/permits',
      '/environmental-health/food-service',
      '/health-department/permits-and-licenses',
      '/health-department',
      '/online-forms',
      '/forms',
    ];

    const baseUrl = `https://www.${townSlug}ct.gov`;
    foodPaths.forEach(path => urls.push(baseUrl + path));

    return [...new Set(urls)];
  }

  private async crawlForPdfLinks(url: string): Promise<{ pdfUrls: CrawledPdf[], subpageUrls: string[] }> {
    const pdfUrls: CrawledPdf[] = [];
    const subpageUrls: string[] = [];

    try {
      console.log(`[FormDiscovery] Crawling: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.log(`[FormDiscovery] Crawl failed (${response.status}): ${url}`);
        return { pdfUrls, subpageUrls };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return { pdfUrls, subpageUrls };
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      let baseHost: string;
      try {
        baseHost = new URL(url).origin;
      } catch {
        return { pdfUrls, subpageUrls };
      }

      $('a[href]').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;

        href = href.trim();
        if (href.startsWith('//')) href = 'https:' + href;
        else if (href.startsWith('/')) href = baseHost + href;
        else if (!href.startsWith('http')) {
          try {
            href = new URL(href, url).toString();
          } catch { return; }
        }

        if (href.toLowerCase().endsWith('.pdf')) {
          const linkText = $(el).text().trim().substring(0, 200);
          pdfUrls.push({ url: href, linkText, sourcePage: url });
          return;
        }

        const linkText = $(el).text().toLowerCase();
        const hrefLower = href.toLowerCase();
        const keywords = ['food', 'permit', 'mobile', 'vendor', 'truck', 'temporary', 'application', 'form', 'license', 'vending', 'health', 'inspection'];

        if (keywords.some(kw => linkText.includes(kw) || hrefLower.includes(kw))) {
          if (href.startsWith('http') && !href.includes('mailto:') && !href.includes('javascript:')) {
            subpageUrls.push(href);
          }
        }
      });

      console.log(`[FormDiscovery] Found ${pdfUrls.length} PDFs and ${subpageUrls.length} subpages on ${url}`);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        console.warn(`[FormDiscovery] Crawl timeout: ${url}`);
      } else {
        console.warn(`[FormDiscovery] Crawl error on ${url}: ${err.message}`);
      }
    }

    return { pdfUrls, subpageUrls };
  }

  private async validatePdfUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/pdf,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return false;

      const contentType = response.headers.get('content-type') || '';
      return contentType.includes('pdf') || contentType.includes('octet-stream') || url.toLowerCase().endsWith('.pdf');
    } catch {
      return false;
    }
  }

  private async downloadPdfWithRetry(url: string): Promise<{ base64: string; fileName: string; size: number } | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[FormDiscovery] Retry ${attempt}/${MAX_RETRIES} for ${url}`);
        await sleep(backoffMs);
      }

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/pdf,*/*',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });

        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !url.toLowerCase().endsWith('.pdf')) {
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 1000) continue;

        const base64 = Buffer.from(arrayBuffer).toString('base64');

        const contentDisposition = response.headers.get('content-disposition');
        let fileName = 'form.pdf';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match?.[1]) fileName = match[1].replace(/['"]/g, '');
        } else {
          const urlPath = new URL(url).pathname;
          const urlFileName = urlPath.split('/').pop();
          if (urlFileName) fileName = urlFileName.endsWith('.pdf') ? urlFileName : `${urlFileName}.pdf`;
        }

        console.log(`[FormDiscovery] Downloaded: ${fileName} (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
        return { base64, fileName, size: arrayBuffer.byteLength };
      } catch (err: any) {
        console.warn(`[FormDiscovery] Download attempt ${attempt + 1} failed for ${url}: ${err.message}`);
      }
    }

    return null;
  }

  private async checkPdfFillable(base64: string): Promise<boolean> {
    try {
      const pdfBuffer = Buffer.from(base64, 'base64');
      const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      return fields.length > 0;
    } catch {
      return false;
    }
  }

  private async classifyPdfsWithAI(
    townName: string,
    pdfs: CrawledPdf[]
  ): Promise<Array<{ url: string; name: string; category: string }>> {
    if (pdfs.length === 0) return [];

    if (!this.genAI) {
      console.log(`[FormDiscovery] No Gemini API key, using heuristic classification for ${pdfs.length} PDFs`);
      return this.heuristicFilter(pdfs);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const pdfList = pdfs.map((p, i) =>
        `${i + 1}. URL: ${p.url}\n   Link text: "${p.linkText}"\n   Found on: ${p.sourcePage}`
      ).join('\n');

      const prompt = `I found these PDF documents on government websites for ${townName}, CT.
Which ones are permit APPLICATIONS or official FORMS that a food truck, mobile food vendor, food cart, or temporary food establishment operator would need to fill out and submit?

INCLUDE:
- Permit applications (temporary food, mobile vending, food establishment, food truck)
- Plan review applications
- Seasonal/farmers market vendor applications
- License applications for food service

EXCLUDE (do NOT include these):
- Informational fact sheets, guides, or brochures
- Temperature logs, cooling logs, freezing logs
- Training materials or training logs
- Food codes, regulations, or ordinances
- Infographics or educational posters
- Employee forms (training logs, etc.)
- Non-food-related permits (building, zoning, salon, massage)

PDFs found:
${pdfList}

Return ONLY a valid JSON array of the relevant permit application forms.
[{"index": 1, "name": "Human readable form name", "category": "temporary_permit|yearly_permit|seasonal_permit|plan_review|checklist|fire_safety|other"}]

If none are relevant food truck permit applications, return an empty array: []`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      let jsonText = responseText;
      if (jsonText.includes('```json')) {
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.replace(/```\s*/g, '');
      }

      const parsed = JSON.parse(jsonText.trim());
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item: any) => item.index >= 1 && item.index <= pdfs.length)
        .map((item: any) => ({
          url: pdfs[item.index - 1].url,
          name: item.name || pdfs[item.index - 1].linkText || this.extractNameFromUrl(pdfs[item.index - 1].url),
          category: item.category || 'other',
        }));
    } catch (err: any) {
      console.warn(`[FormDiscovery] AI classification failed: ${err.message}. Using heuristic classification.`);
      return this.heuristicFilter(pdfs);
    }
  }

  private heuristicFilter(pdfs: CrawledPdf[]): Array<{ url: string; name: string; category: string }> {
    const includeKeywords = ['permit', 'application', 'vendor', 'truck', 'mobile food', 'temporary food', 'food establish', 'plan review', 'itinerant', 'farmers market', 'vending'];
    const excludeKeywords = ['fact sheet', 'infographic', 'training', 'log', 'cooling', 'temperature', 'freezing', 'handwashing', 'hand washing', 'food code', 'regulation', 'poster', 'brochure', 'guide'];
    return pdfs
      .filter(p => {
        const combined = (p.linkText + ' ' + p.url).toLowerCase();
        const hasInclude = includeKeywords.some(kw => combined.includes(kw));
        const hasExclude = excludeKeywords.some(kw => combined.includes(kw));
        return hasInclude && !hasExclude;
      })
      .map(p => ({
        url: p.url,
        name: p.linkText || this.extractNameFromUrl(p.url),
        category: this.inferCategoryFromText(p.linkText + ' ' + p.url),
      }));
  }

  private extractNameFromUrl(url: string): string {
    try {
      const fileName = new URL(url).pathname.split('/').pop() || 'form.pdf';
      return fileName
        .replace('.pdf', '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    } catch {
      return 'Permit Form';
    }
  }

  private inferCategoryFromText(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('temporary') || lower.includes('temp') || lower.includes('event') || lower.includes('special')) {
      return 'temporary_permit';
    }
    if (lower.includes('seasonal')) return 'seasonal_permit';
    if (lower.includes('yearly') || lower.includes('annual') || lower.includes('mobile food')) return 'yearly_permit';
    if (lower.includes('checklist') || lower.includes('guide') || lower.includes('requirement')) return 'checklist';
    if (lower.includes('health') || lower.includes('inspection')) return 'health_inspection';
    if (lower.includes('fire')) return 'fire_safety';
    return 'other';
  }

  async discoverFormsForTown(townId: string, options: { force?: boolean } = {}): Promise<DiscoveryResult> {
    console.log(`[FormDiscovery] === CRAWL-BASED Discovery STARTED for town ID: ${townId} ===`);

    const town = await storage.getTown(townId);
    if (!town) {
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Town not found" };
    }

    if (this.activeDiscoveries.has(townId)) {
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Discovery already in progress" };
    }

    // Cooldown check - don't re-discover within 24 hours unless forced
    const lastAttempt = this.discoveryAttempts.get(townId);
    if (lastAttempt && !options.force && (Date.now() - lastAttempt) < DISCOVERY_COOLDOWN_MS) {
      console.log(`[FormDiscovery] Cooldown active for ${town.townName}, skipping`);
      return { success: true, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Discovery attempted recently" };
    }

    const existingForms = await storage.getTownForms(townId);
    if (existingForms.length > 0 && !options.force) {
      return { success: true, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Town already has forms" };
    }

    this.activeDiscoveries.add(townId);
    this.discoveryAttempts.set(townId, Date.now());

    try {
      // Step 1: Build seed URLs
      let healthDistrictWebsite: string | null = null;
      if (town.healthDistrictId) {
        const district = await storage.getHealthDistrict(town.healthDistrictId);
        healthDistrictWebsite = district?.website || null;
      }

      const seedUrls = this.buildSeedUrls(town, healthDistrictWebsite);
      console.log(`[FormDiscovery] Seed URLs for ${town.townName}: ${seedUrls.length}`);

      // Step 2: Crawl seed URLs (in parallel batches)
      const allPdfUrls: CrawledPdf[] = [];
      const allSubpageUrls: string[] = [];
      const visitedUrls = new Set<string>();

      // Crawl seeds in batches of 5
      for (let i = 0; i < seedUrls.length; i += 5) {
        const batch = seedUrls.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(url => {
            if (visitedUrls.has(url)) return Promise.resolve({ pdfUrls: [], subpageUrls: [] });
            visitedUrls.add(url);
            return this.crawlForPdfLinks(url);
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            allPdfUrls.push(...result.value.pdfUrls);
            allSubpageUrls.push(...result.value.subpageUrls);
          }
        }
      }

      // Step 3: Follow subpages ONE level deep (max 15 subpages)
      const uniqueSubpages = [...new Set(allSubpageUrls)]
        .filter(url => !visitedUrls.has(url))
        .slice(0, 15);

      console.log(`[FormDiscovery] Following ${uniqueSubpages.length} subpages for ${town.townName}`);

      for (let i = 0; i < uniqueSubpages.length; i += 5) {
        const batch = uniqueSubpages.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(url => {
            visitedUrls.add(url);
            return this.crawlForPdfLinks(url);
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            allPdfUrls.push(...result.value.pdfUrls);
          }
        }
      }

      // Deduplicate PDFs by URL
      const uniquePdfs = new Map<string, CrawledPdf>();
      for (const pdf of allPdfUrls) {
        if (!uniquePdfs.has(pdf.url)) {
          uniquePdfs.set(pdf.url, pdf);
        }
      }

      const pdfList = [...uniquePdfs.values()];
      console.log(`[FormDiscovery] Total unique PDFs found for ${town.townName}: ${pdfList.length}`);

      if (pdfList.length === 0) {
        console.log(`[FormDiscovery] No PDFs found for ${town.townName}`);
        return {
          success: true,
          formsDiscovered: 0,
          formsDownloaded: 0,
          forms: [],
          townWebsite: seedUrls[0],
          healthDeptWebsite: healthDistrictWebsite || undefined,
        };
      }

      // Step 4: Use AI to classify which PDFs are food truck forms (or heuristic fallback)
      const classifiedForms = await this.classifyPdfsWithAI(town.townName, pdfList);
      console.log(`[FormDiscovery] Classified ${classifiedForms.length} relevant forms for ${town.townName}`);

      if (classifiedForms.length === 0) {
        console.log(`[FormDiscovery] No relevant food truck forms identified for ${town.townName}`);
        return {
          success: true,
          formsDiscovered: pdfList.length,
          formsDownloaded: 0,
          forms: [],
          townWebsite: seedUrls[0],
          healthDeptWebsite: healthDistrictWebsite || undefined,
        };
      }

      // Step 5: Validate, download, and store
      const discoveryResult: DiscoveryResult = {
        success: true,
        formsDiscovered: classifiedForms.length,
        formsDownloaded: 0,
        forms: [],
        townWebsite: seedUrls[0],
        healthDeptWebsite: healthDistrictWebsite || undefined,
      };

      for (const formInfo of classifiedForms) {
        // Dedup against existing forms
        const existing = await storage.getTownFormBySourceUrl(townId, formInfo.url);
        if (existing) {
          console.log(`[FormDiscovery] Dedup: form already exists: ${formInfo.url}`);
          discoveryResult.forms.push({ name: formInfo.name, url: formInfo.url, downloaded: false });
          continue;
        }

        // Validate URL
        const isValid = await this.validatePdfUrl(formInfo.url);
        if (!isValid) {
          console.log(`[FormDiscovery] URL validation failed: ${formInfo.url}`);
          discoveryResult.forms.push({ name: formInfo.name, url: formInfo.url, downloaded: false });
          continue;
        }

        // Download PDF
        const pdfData = await this.downloadPdfWithRetry(formInfo.url);

        // Check if fillable
        let isFillable = false;
        if (pdfData) {
          isFillable = await this.checkPdfFillable(pdfData.base64);
        }

        try {
          await storage.createTownForm({
            townId: town.id,
            name: formInfo.name || `${town.townName} Permit Application`,
            description: null,
            category: formInfo.category as any,
            externalUrl: formInfo.url,
            sourceUrl: formInfo.url,
            fileData: pdfData?.base64 || null,
            fileName: pdfData?.fileName || formInfo.url.split('/').pop() || 'form.pdf',
            fileType: 'application/pdf',
            isAiDiscovered: true,
            isFillable,
          });

          discoveryResult.forms.push({
            name: formInfo.name,
            url: formInfo.url,
            downloaded: !!pdfData,
          });

          if (pdfData) discoveryResult.formsDownloaded++;
          console.log(`[FormDiscovery] Form SAVED: ${formInfo.name} (downloaded: ${!!pdfData}, fillable: ${isFillable})`);
        } catch (err: any) {
          console.error(`[FormDiscovery] Failed to save form: ${err.message}`);
        }
      }

      console.log(`[FormDiscovery] === Discovery COMPLETED for ${town.townName}: ${discoveryResult.formsDownloaded}/${discoveryResult.formsDiscovered} forms downloaded ===`);
      return discoveryResult;
    } catch (error: any) {
      console.error(`[FormDiscovery] === Discovery FAILED for ${town.townName}: ${error.message} ===`);
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: error.message };
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
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: `Town "${townName}, ${state}" not found` };
    }

    return this.discoverFormsForTown(town.id);
  }
}

export const formDiscoveryService = new FormDiscoveryService();
