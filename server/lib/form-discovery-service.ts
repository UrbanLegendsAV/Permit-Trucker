/**
 * Form Discovery Service — Playwright + fetch/cheerio crawler
 *
 * Strategy:
 *  1. Build targeted Google search queries for the town (e.g. "Bethel CT food truck permit filetype:pdf site:.gov")
 *  2. Use Playwright to open Google and collect every .gov URL from the result page
 *  3. Fall back to DuckDuckGo HTML search if Google returns nothing or shows a CAPTCHA
 *  4. Crawl each discovered .gov page with fetch+cheerio (fast); fall back to Playwright for JS-heavy pages
 *  5. Follow one level of relevant sub-links on those pages
 *  6. Filter collected PDF links with a heuristic keyword list — no AI classification
 *  7. Download, check fillability, and store in town_forms (isAiDiscovered: false)
 *
 * URLs are NEVER generated or guessed — every URL comes from a real search result or a
 * live crawled page. This eliminates the previous hallucination problem and $28/day AI cost.
 */

import { storage } from "../storage";
import type { Town } from "@shared/schema";
import { PDFDocument } from "pdf-lib";
import * as cheerio from "cheerio";
import type { Browser, Page } from "playwright";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  success: boolean;
  formsDiscovered: number;
  formsDownloaded: number;
  forms: Array<{ name: string; url: string; downloaded: boolean }>;
  error?: string;
  searchedUrls?: string[];
}

interface CrawledPdf {
  url: string;
  linkText: string;
  sourcePage: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOWNLOAD_TIMEOUT_MS = 30_000;
const CRAWL_TIMEOUT_MS    = 15_000;
const SEARCH_TIMEOUT_MS   = 20_000;
const MAX_RETRIES          = 2;
const DISCOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1_000; // 24 h

/** Max unique .gov root URLs to crawl from search results */
const MAX_GOV_PAGES = 8;
/** Max sub-links to follow per discovered .gov page */
const MAX_SUBPAGES_PER_PAGE = 3;

// PDF link text / URL fragments that signal a food-truck permit application
const INCLUDE_KEYWORDS = [
  "permit", "application", "vendor", "truck", "mobile food",
  "temporary food", "food establish", "plan review", "itinerant",
  "farmers market", "vending", "food service", "mobile vendor",
  "food license", "food cart",
];

// Fragments that indicate the PDF is NOT an application form
const EXCLUDE_KEYWORDS = [
  "fact sheet", "infographic", "training log", "cooling log",
  "temperature log", "freezing log", "handwashing log", "hand washing log",
  "food code", "regulation", "ordinance", "poster", "brochure",
  "employee", "inspection report", "violation",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Resolve a possibly-relative href to an absolute URL. Returns null on failure. */
function resolveUrl(href: string, base: string): string | null {
  try {
    if (href.startsWith("//")) return "https:" + href;
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Extract the actual destination URL from a DuckDuckGo redirect href. */
function unwrapDdgUrl(href: string): string | null {
  if (!href) return null;
  // DuckDuckGo redirects look like: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }
  if (href.startsWith("//")) return "https:" + href;
  return href;
}

// ─── FormDiscoveryService ─────────────────────────────────────────────────────

export class FormDiscoveryService {
  private activeDiscoveries  = new Set<string>();
  private discoveryAttempts  = new Map<string, number>(); // townId → last attempt ts

  isDiscoveryActive(townId: string): boolean {
    return this.activeDiscoveries.has(townId);
  }

  isConfigured(): boolean {
    return true; // no external API keys required
  }

  // ── Search query construction ──────────────────────────────────────────────

  private buildSearchQueries(townName: string, state: string): string[] {
    const t = townName;
    const s = state.toUpperCase();
    return [
      `"${t}" ${s} food truck permit application filetype:pdf site:.gov`,
      `"${t}" ${s} mobile food vendor permit application site:.gov`,
      `"${t}" ${s} temporary food establishment permit filetype:pdf`,
      `"${t}" ${s} health department food service permit application pdf`,
    ];
  }

  // ── Google search via Playwright ───────────────────────────────────────────

  /**
   * Opens a Google search and collects every .gov URL visible in results.
   * Returns an empty array if a CAPTCHA appears or the search fails.
   */
  private async searchGoogleWithPlaywright(page: Page, query: string): Promise<string[]> {
    const govUrls: string[] = [];
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
      console.log(`[FormDiscovery] Google: ${query}`);

      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: SEARCH_TIMEOUT_MS });
      await page.waitForTimeout(1500);

      // Bail if CAPTCHA is present
      const hasCaptcha = await page.$('form#captcha-form, div#recaptcha, iframe[title*="recaptcha" i]');
      if (hasCaptcha) {
        console.warn("[FormDiscovery] Google CAPTCHA detected — switching to DuckDuckGo");
        return [];
      }

      // page.evaluate can read the real resolved href, not the raw attribute
      const links: string[] = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .map(a => (a as HTMLAnchorElement).href)
          .filter(Boolean)
      );

      for (const link of links) {
        try {
          const u = new URL(link);
          if (u.hostname.endsWith(".gov") && !u.hostname.includes("google")) {
            const clean = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`;
            if (!govUrls.includes(clean)) govUrls.push(clean);
          }
        } catch { /* skip malformed */ }
      }

      console.log(`[FormDiscovery] Google → ${govUrls.length} .gov URLs`);
    } catch (err: any) {
      console.warn(`[FormDiscovery] Google search error: ${err.message}`);
    }
    return govUrls;
  }

  // ── DuckDuckGo fallback (no browser needed) ────────────────────────────────

  /**
   * Fetches DuckDuckGo HTML search results and extracts .gov URLs.
   * Used when Google is blocked or returns nothing.
   */
  private async searchDuckDuckGoWithFetch(query: string): Promise<string[]> {
    const govUrls: string[] = [];
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      console.log(`[FormDiscovery] DuckDuckGo: ${query}`);

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (!response.ok) return [];

      const html = await response.text();
      const $ = cheerio.load(html);

      $("a.result__a, a.result__url").each((_, el) => {
        const raw = $(el).attr("href") || "";
        const href = unwrapDdgUrl(raw);
        if (!href) return;
        try {
          const u = new URL(href);
          if (u.hostname.endsWith(".gov") && !u.hostname.includes("duckduckgo")) {
            const clean = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`;
            if (!govUrls.includes(clean)) govUrls.push(clean);
          }
        } catch { /* skip */ }
      });

      console.log(`[FormDiscovery] DuckDuckGo → ${govUrls.length} .gov URLs`);
    } catch (err: any) {
      console.warn(`[FormDiscovery] DuckDuckGo error: ${err.message}`);
    }
    return govUrls;
  }

  // ── Page crawling ──────────────────────────────────────────────────────────

  /**
   * Crawl a page with fetch + cheerio (fast, no browser overhead).
   * Returns PDF link objects and sub-links worth following.
   */
  private async crawlPageWithFetch(url: string): Promise<{ pdfUrls: CrawledPdf[]; subpageUrls: string[] }> {
    const pdfUrls: CrawledPdf[] = [];
    const subpageUrls: string[] = [];

    try {
      console.log(`[FormDiscovery] Fetch-crawl: ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
      });

      if (!response.ok) return { pdfUrls, subpageUrls };

      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return { pdfUrls, subpageUrls };

      const html = await response.text();
      const $ = cheerio.load(html);

      $("a[href]").each((_, el) => {
        const raw = $(el).attr("href") || "";
        const resolved = resolveUrl(raw, url);
        if (!resolved) return;

        const lower = resolved.toLowerCase();
        const text  = $(el).text().trim().substring(0, 200);

        if (lower.endsWith(".pdf") || lower.includes(".pdf?") || lower.includes("/pdf/")) {
          pdfUrls.push({ url: resolved, linkText: text, sourcePage: url });
          return;
        }

        // Collect sub-links that look food/permit related
        const combined = (text + " " + resolved).toLowerCase();
        const relevant = ["food", "permit", "mobile", "vendor", "truck", "temporary",
                          "application", "form", "license", "vending", "health", "inspection"];
        if (relevant.some(kw => combined.includes(kw))) {
          if (resolved.startsWith("http") && !resolved.includes("mailto:")) {
            subpageUrls.push(resolved);
          }
        }
      });

      console.log(`[FormDiscovery] Fetch-crawl found ${pdfUrls.length} PDFs, ${subpageUrls.length} sub-links on ${url}`);
    } catch (err: any) {
      const label = err.name === "TimeoutError" || err.name === "AbortError" ? "timeout" : err.message;
      console.warn(`[FormDiscovery] Fetch-crawl failed (${label}): ${url}`);
    }

    return { pdfUrls, subpageUrls };
  }

  /**
   * Crawl a page with Playwright — used when fetch fails (JS-rendered pages, bot-blocks, etc.).
   */
  private async crawlPageWithPlaywright(
    page: Page,
    url: string
  ): Promise<{ pdfUrls: CrawledPdf[]; subpageUrls: string[] }> {
    const pdfUrls: CrawledPdf[] = [];
    const subpageUrls: string[] = [];

    try {
      console.log(`[FormDiscovery] Playwright-crawl: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: CRAWL_TIMEOUT_MS });
      await page.waitForLoadState("networkidle").catch(() => {});

      const links: Array<{ href: string; text: string }> = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]")).map(a => ({
          href: (a as HTMLAnchorElement).href,
          text: (a as HTMLAnchorElement).textContent?.trim().substring(0, 200) ?? "",
        }))
      );

      for (const { href, text } of links) {
        if (!href || !href.startsWith("http")) continue;
        const lower = href.toLowerCase();

        if (lower.endsWith(".pdf") || lower.includes(".pdf?") || lower.includes("/pdf/")) {
          pdfUrls.push({ url: href, linkText: text, sourcePage: url });
          continue;
        }

        const combined = (text + " " + href).toLowerCase();
        const relevant = ["food", "permit", "mobile", "vendor", "truck", "temporary",
                          "application", "form", "license", "vending", "health"];
        if (relevant.some(kw => combined.includes(kw))) {
          subpageUrls.push(href);
        }
      }

      console.log(`[FormDiscovery] Playwright-crawl found ${pdfUrls.length} PDFs, ${subpageUrls.length} sub-links`);
    } catch (err: any) {
      console.warn(`[FormDiscovery] Playwright-crawl failed: ${err.message}`);
    }

    return { pdfUrls, subpageUrls };
  }

  // ── PDF helpers ────────────────────────────────────────────────────────────

  /**
   * Filter raw crawled PDFs to only those that look like permit application forms.
   * No AI — pure keyword heuristics.
   */
  private heuristicFilter(pdfs: CrawledPdf[]): Array<{ url: string; name: string; category: string }> {
    return pdfs
      .filter(p => {
        const combined = (p.linkText + " " + p.url).toLowerCase();
        return (
          INCLUDE_KEYWORDS.some(kw => combined.includes(kw)) &&
          !EXCLUDE_KEYWORDS.some(kw => combined.includes(kw))
        );
      })
      .map(p => ({
        url: p.url,
        name: p.linkText || this.extractNameFromUrl(p.url),
        category: this.inferCategoryFromText(p.linkText + " " + p.url),
      }));
  }

  private extractNameFromUrl(url: string): string {
    try {
      const fileName = new URL(url).pathname.split("/").pop() || "form.pdf";
      return fileName
        .replace(/\.pdf$/i, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, l => l.toUpperCase());
    } catch {
      return "Permit Form";
    }
  }

  private inferCategoryFromText(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("temporary") || lower.includes("temp") || lower.includes("event") || lower.includes("special")) return "temporary_permit";
    if (lower.includes("seasonal")) return "seasonal_permit";
    if (lower.includes("yearly") || lower.includes("annual") || lower.includes("mobile food")) return "yearly_permit";
    if (lower.includes("plan review")) return "plan_review";
    if (lower.includes("checklist") || lower.includes("guide") || lower.includes("requirement")) return "checklist";
    if (lower.includes("fire")) return "fire_safety";
    return "other";
  }

  private async validatePdfUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/pdf,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return false;
      const ct = response.headers.get("content-type") || "";
      return ct.includes("pdf") || ct.includes("octet-stream") || url.toLowerCase().endsWith(".pdf");
    } catch {
      return false;
    }
  }

  private async downloadPdfWithRetry(url: string): Promise<{ base64: string; fileName: string; size: number } | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(Math.pow(2, attempt) * 1_000);
        console.log(`[FormDiscovery] Retry ${attempt}/${MAX_RETRIES}: ${url}`);
      }
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/pdf,*/*" },
          redirect: "follow",
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!response.ok) continue;

        const ct = response.headers.get("content-type") || "";
        if (!ct.includes("pdf") && !ct.includes("octet-stream") && !url.toLowerCase().endsWith(".pdf")) continue;

        const buf = await response.arrayBuffer();
        if (buf.byteLength < 1_000) continue;

        const base64 = Buffer.from(buf).toString("base64");

        let fileName = "form.pdf";
        const cd = response.headers.get("content-disposition");
        if (cd) {
          const m = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (m?.[1]) fileName = m[1].replace(/['"]/g, "");
        } else {
          const p = new URL(url).pathname.split("/").pop();
          if (p) fileName = p.endsWith(".pdf") ? p : `${p}.pdf`;
        }

        console.log(`[FormDiscovery] Downloaded: ${fileName} (${Math.round(buf.byteLength / 1024)} KB)`);
        return { base64, fileName, size: buf.byteLength };
      } catch (err: any) {
        console.warn(`[FormDiscovery] Download attempt ${attempt + 1} failed: ${err.message}`);
      }
    }
    return null;
  }

  private async checkPdfFillable(base64: string): Promise<boolean> {
    try {
      const pdfDoc = await PDFDocument.load(Buffer.from(base64, "base64"), { ignoreEncryption: true });
      return pdfDoc.getForm().getFields().length > 0;
    } catch {
      return false;
    }
  }

  // ── Main discovery orchestration ───────────────────────────────────────────

  async discoverFormsForTown(townId: string, options: { force?: boolean } = {}): Promise<DiscoveryResult> {
    const town = await storage.getTown(townId);
    if (!town) {
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Town not found" };
    }

    console.log(`[FormDiscovery] === START for ${town.townName}, ${town.state} ===`);

    if (this.activeDiscoveries.has(townId)) {
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Discovery already in progress" };
    }

    const lastAttempt = this.discoveryAttempts.get(townId);
    if (lastAttempt && !options.force && Date.now() - lastAttempt < DISCOVERY_COOLDOWN_MS) {
      return { success: true, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Discovery attempted recently" };
    }

    const existingForms = await storage.getTownForms(townId);
    if (existingForms.length > 0 && !options.force) {
      return { success: true, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: "Town already has forms" };
    }

    this.activeDiscoveries.add(townId);
    this.discoveryAttempts.set(townId, Date.now());

    let browser: Browser | null = null;

    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });

      // ── Step 1: Collect .gov URLs via search ─────────────────────────────

      const queries = this.buildSearchQueries(town.townName, town.state);
      const collectedGovUrls = new Set<string>();

      // If the town already has a known portal or .gov URL, seed from that
      if (town.portalUrl) {
        try {
          const u = new URL(town.portalUrl);
          if (u.hostname.endsWith(".gov")) collectedGovUrls.add(town.portalUrl);
        } catch { /* ignore */ }
      }

      const searchPage = await browser.newPage();
      await searchPage.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });

      for (const query of queries) {
        if (collectedGovUrls.size >= MAX_GOV_PAGES) break;

        // Try Google first
        let results = await this.searchGoogleWithPlaywright(searchPage, query);

        // Fall back to DuckDuckGo if Google gave nothing
        if (results.length === 0) {
          results = await this.searchDuckDuckGoWithFetch(query);
        }

        for (const url of results) {
          if (collectedGovUrls.size >= MAX_GOV_PAGES) break;
          collectedGovUrls.add(url);
        }

        // Small delay between searches to avoid rate limiting
        await sleep(1_500);
      }

      await searchPage.close();

      const govUrls = [...collectedGovUrls];
      console.log(`[FormDiscovery] ${govUrls.length} unique .gov pages to crawl for ${town.townName}`);

      if (govUrls.length === 0) {
        console.log(`[FormDiscovery] No .gov URLs found via search for ${town.townName}`);
        return {
          success: true, formsDiscovered: 0, formsDownloaded: 0, forms: [],
          searchedUrls: [],
          error: "No .gov pages found in search results",
        };
      }

      // ── Step 2: Crawl each .gov page for PDF links ───────────────────────

      const allPdfs = new Map<string, CrawledPdf>(); // url → CrawledPdf
      const visitedUrls = new Set<string>(govUrls);
      const crawlPage = await browser.newPage();

      for (const govUrl of govUrls) {
        // Try fast fetch first
        let { pdfUrls, subpageUrls } = await this.crawlPageWithFetch(govUrl);

        // If fetch returned nothing (JS-rendered or blocked), try Playwright
        if (pdfUrls.length === 0 && subpageUrls.length === 0) {
          ({ pdfUrls, subpageUrls } = await this.crawlPageWithPlaywright(crawlPage, govUrl));
        }

        for (const p of pdfUrls) {
          if (!allPdfs.has(p.url)) allPdfs.set(p.url, p);
        }

        // Follow relevant sub-links one level deep (limit per gov page)
        const subpagesToFollow = subpageUrls
          .filter(u => !visitedUrls.has(u))
          .slice(0, MAX_SUBPAGES_PER_PAGE);

        for (const sub of subpagesToFollow) {
          visitedUrls.add(sub);
          const { pdfUrls: subPdfs } = await this.crawlPageWithFetch(sub);
          for (const p of subPdfs) {
            if (!allPdfs.has(p.url)) allPdfs.set(p.url, p);
          }
        }
      }

      await crawlPage.close();

      console.log(`[FormDiscovery] Total unique PDF links found: ${allPdfs.size}`);

      // ── Step 3: Heuristic filter — no AI ────────────────────────────────

      const filtered = this.heuristicFilter([...allPdfs.values()]);
      console.log(`[FormDiscovery] After heuristic filter: ${filtered.length} candidate forms`);

      if (filtered.length === 0) {
        return {
          success: true, formsDiscovered: 0, formsDownloaded: 0, forms: [],
          searchedUrls: govUrls,
        };
      }

      // ── Step 4: Validate, download, store ───────────────────────────────

      const result: DiscoveryResult = {
        success: true,
        formsDiscovered: filtered.length,
        formsDownloaded: 0,
        forms: [],
        searchedUrls: govUrls,
      };

      for (const formInfo of filtered) {
        // Dedup: skip if already stored
        const existing = await storage.getTownFormBySourceUrl(townId, formInfo.url);
        if (existing) {
          console.log(`[FormDiscovery] Already stored: ${formInfo.url}`);
          result.forms.push({ name: formInfo.name, url: formInfo.url, downloaded: false });
          continue;
        }

        // Validate the URL is actually reachable
        const valid = await this.validatePdfUrl(formInfo.url);
        if (!valid) {
          console.log(`[FormDiscovery] URL not reachable: ${formInfo.url}`);
          continue;
        }

        // Download
        const pdfData = await this.downloadPdfWithRetry(formInfo.url);
        const isFillable = pdfData ? await this.checkPdfFillable(pdfData.base64) : false;

        try {
          await storage.createTownForm({
            townId: town.id,
            name: formInfo.name || `${town.townName} Permit Application`,
            description: null,
            category: formInfo.category as any,
            externalUrl: formInfo.url,
            sourceUrl: formInfo.url,
            fileData: pdfData?.base64 || null,
            fileName: pdfData?.fileName || (new URL(formInfo.url).pathname.split("/").pop() || "form.pdf"),
            fileType: "application/pdf",
            isAiDiscovered: false, // real crawled URL, not AI-generated
            isFillable,
          });

          result.forms.push({ name: formInfo.name, url: formInfo.url, downloaded: !!pdfData });
          if (pdfData) result.formsDownloaded++;

          console.log(`[FormDiscovery] Stored: ${formInfo.name} (fillable: ${isFillable}, downloaded: ${!!pdfData})`);
        } catch (err: any) {
          console.error(`[FormDiscovery] Failed to store form: ${err.message}`);
        }
      }

      console.log(`[FormDiscovery] === DONE for ${town.townName}: ${result.formsDownloaded}/${result.formsDiscovered} forms stored ===`);
      return result;

    } catch (err: any) {
      console.error(`[FormDiscovery] === FAILED for ${town.townName}: ${err.message} ===`);
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [], error: err.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
      this.activeDiscoveries.delete(townId);
    }
  }

  async discoverFormsForTownByName(townName: string, state = "CT"): Promise<DiscoveryResult> {
    const towns = await storage.getTowns();
    const town = towns.find(
      t => t.townName.toLowerCase() === townName.toLowerCase() &&
           t.state.toUpperCase() === state.toUpperCase()
    );
    if (!town) {
      return { success: false, formsDiscovered: 0, formsDownloaded: 0, forms: [],
               error: `Town "${townName}, ${state}" not found` };
    }
    return this.discoverFormsForTown(town.id);
  }
}

export const formDiscoveryService = new FormDiscoveryService();
