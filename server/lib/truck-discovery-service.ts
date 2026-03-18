/**
 * Truck Discovery Service
 *
 * AUTONOMOUS PIPELINE:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 1. Admin clicks "Discover New Trucks"                                       │
 * │    → discoverNewTrucks() scrapes DuckDuckGo, Yelp, CT directories          │
 * │    → Claude Haiku extracts structured data (name, slug, cuisine, etc.)      │
 * │    → Deduplicates by slug / name / website domain                           │
 * │    → Inserts unclaimed listings into food_trucks                            │
 * │                                                                             │
 * │ 2. Admin clicks "Run Outreach"                                              │
 * │    → outreach-service emails every unclaimed truck with a website/email     │
 * │                                                                             │
 * │ 3. Truck owner replies                                                      │
 * │    → orchestrator classifies the email intent                               │
 * │    → claim-agent or catering-agent handles it automatically                 │
 * │                                                                             │
 * │ 4. Owner clicks "Claim Listing" in the email                                │
 * │    → 4-step claim flow → DataVault synced → permit filing available         │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { foodTrucks, agentLogs, configs } from "../../shared/schema";
import { eq, ilike, or, sql } from "drizzle-orm";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// DuckDuckGo HTML is bot-friendly — use a realistic browser UA for best results
const BOT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DELAY_MS = 2000; // polite crawl delay between requests

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveryTruckEntry {
  name: string;
  slug: string;
  status: "added" | "duplicate" | "error";
  source: string;
  error?: string;
}

export interface DiscoverySummary {
  discovered: number;
  added: number;
  duplicates: number;
  errors: number;
  trucks: DiscoveryTruckEntry[];
}

interface RawCandidate {
  rawName: string;
  rawDescription: string;
  rawWebsite?: string;
  rawInstagram?: string;
  sourceLabel: string;
  townHint?: string;
}

interface ExtractedTruck {
  name: string;
  slug: string;
  cuisine: string;
  description: string;
  website: string | null;
  instagramHandle: string | null;
  towns: string[];
  confidence: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

async function politeGet(url: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BOT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        ...extraHeaders,
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`[Discovery] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    console.log(`[Discovery] Fetch failed for ${url}: ${err.message}`);
    return null;
  }
}

// DuckDuckGo HTML endpoint requires a POST with form-encoded body
async function politePost(url: string, body: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "User-Agent": BOT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://duckduckgo.com",
        "Referer": "https://duckduckgo.com/",
        ...extraHeaders,
      },
      body,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.log(`[Discovery] POST HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err: any) {
    console.log(`[Discovery] POST failed for ${url}: ${err.message}`);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function townSlug(town: string): string {
  return town.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ── SOURCE 1: DuckDuckGo HTML + Bing search ───────────────────────────────────
// DDG HTML endpoint requires a POST request (not GET) to get real results.
// Bing is used as a fallback — generally bot-tolerant.

function buildSearchQueries(targetTown?: string): string[] {
  if (targetTown) {
    return [
      `${targetTown} CT food truck`,
      `${targetTown} Connecticut food truck catering`,
      `food truck ${targetTown} CT menu`,
      `${targetTown} CT food truck catering events`,
    ];
  }
  return [
    "Connecticut food truck catering",
    "Hartford CT food truck",
    "New Haven CT food truck",
    "Bridgeport CT food truck",
    "Stamford CT food truck",
    "Waterbury CT food truck",
    "Danbury CT food truck",
    "Norwalk CT food truck",
    "New Britain CT food truck",
    "West Hartford CT food truck",
    "Greenwich CT food truck",
    "Meriden CT food truck",
    "Bristol CT food truck",
  ];
}

function parseSearchHtml(html: string, query: string, sourceLabel: string, targetTown?: string): RawCandidate[] {
  const $ = cheerio.load(html);
  const candidates: RawCandidate[] = [];

  // Debug: log page size and a snippet to understand what we got
  console.log(`[Discovery] ${sourceLabel} response: ${html.length} chars`);
  if (html.length < 500) {
    console.log(`[Discovery] ${sourceLabel} short response snippet: ${html.slice(0, 300)}`);
  }

  // ── DDG HTML selectors ──
  $(".result, .web-result").each((_, el) => {
    const titleEl = $(el).find(".result__title, .result__a, h2 a").first();
    const snippetEl = $(el).find(".result__snippet, .result__extras").first();
    const urlEl = $(el).find(".result__url, .result__extras__url").first();

    const rawName = titleEl.text().trim();
    const rawDescription = snippetEl.text().trim();
    const rawWebsite = urlEl.text().trim().replace(/\s+/g, "");

    if (rawName.length < 3) return;
    const combined = `${rawName} ${rawDescription}`.toLowerCase();
    const isFoodTruck = /food.?truck|catering|foodtruck/i.test(combined);
    const isCT = targetTown ? true : /connecticut|\bct\b|hartford|new haven|bridgeport|stamford/i.test(combined);
    if (isFoodTruck && isCT) {
      candidates.push({ rawName, rawDescription, rawWebsite: rawWebsite ? `https://${rawWebsite.replace(/^https?:\/\//,"")}` : undefined, sourceLabel, townHint: targetTown });
    }
  });

  // ── Bing selectors ──
  if (candidates.length === 0) {
    $("#b_results .b_algo, .b_algo").each((_, el) => {
      const titleEl = $(el).find("h2 a, h3 a").first();
      const snippetEl = $(el).find(".b_caption p, p").first();
      const rawName = titleEl.text().trim();
      const rawDescription = snippetEl.text().trim();
      const rawWebsite = titleEl.attr("href") ?? "";
      if (rawName.length < 3) return;
      const combined = `${rawName} ${rawDescription}`.toLowerCase();
      const isFoodTruck = /food.?truck|catering|foodtruck/i.test(combined);
      const isCT = targetTown ? true : /connecticut|\bct\b|hartford|new haven|bridgeport|stamford/i.test(combined);
      if (isFoodTruck && isCT) {
        candidates.push({ rawName, rawDescription, rawWebsite: rawWebsite.startsWith("http") ? rawWebsite : undefined, sourceLabel: "bing", townHint: targetTown });
      }
    });
  }

  // ── Generic fallback — any h3 near food truck text ──
  if (candidates.length === 0) {
    $("h3, h2").each((_, el) => {
      const rawName = $(el).text().trim();
      const parent = $(el).parent();
      const rawDescription = parent.find("p, span").first().text().trim();
      const combined = `${rawName} ${rawDescription}`.toLowerCase();
      if (rawName.length < 3 || rawName.length > 100) return;
      const isFoodTruck = /food.?truck|catering|foodtruck/i.test(combined);
      const isCT = targetTown ? true : /connecticut|\bct\b/i.test(combined);
      if (isFoodTruck && isCT) {
        candidates.push({ rawName, rawDescription, sourceLabel, townHint: targetTown });
      }
    });
  }

  return candidates;
}

async function scrapeDuckDuckGo(targetTown?: string): Promise<RawCandidate[]> {
  const allCandidates: RawCandidate[] = [];
  const queries = buildSearchQueries(targetTown);

  for (const query of queries) {
    console.log(`[Discovery] DDG POST query: ${query}`);

    // DDG HTML requires POST with form-encoded body
    const html = await politePost(
      "https://html.duckduckgo.com/html/",
      `q=${encodeURIComponent(query)}&kl=us-en&kp=-2`,
    );

    if (!html) {
      // DDG blocked — try Bing for this query
      console.log(`[Discovery] DDG failed, trying Bing for: ${query}`);
      const bingHtml = await politeGet(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&mkt=en-US`,
        { "Referer": "https://www.bing.com/" },
      );
      if (bingHtml) {
        const found = parseSearchHtml(bingHtml, query, "bing", targetTown);
        console.log(`[Discovery] Bing "${query}" → ${found.length} candidates`);
        allCandidates.push(...found);
      }
      await sleep(DELAY_MS);
      continue;
    }

    const found = parseSearchHtml(html, query, "duckduckgo", targetTown);

    // If DDG returned HTML but 0 results, also try Bing
    if (found.length === 0) {
      console.log(`[Discovery] DDG returned 0 for "${query}", trying Bing`);
      const bingHtml = await politeGet(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&mkt=en-US`,
        { "Referer": "https://www.bing.com/" },
      );
      if (bingHtml) {
        const bingFound = parseSearchHtml(bingHtml, query, "bing", targetTown);
        console.log(`[Discovery] Bing "${query}" → ${bingFound.length} candidates`);
        allCandidates.push(...bingFound);
      }
    } else {
      console.log(`[Discovery] DDG "${query}" → ${found.length} candidates`);
      allCandidates.push(...found);
    }

    await sleep(DELAY_MS);
  }

  return allCandidates;
}

// ── SOURCE 2: Yelp search ─────────────────────────────────────────────────────
// Yelp's search pages are indexable and return real business names/descriptions

async function scrapeYelp(targetTown?: string): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  const locations = targetTown
    ? [`${targetTown}, CT`]
    : ["Hartford, CT", "New Haven, CT", "Bridgeport, CT", "Stamford, CT", "Waterbury, CT", "Danbury, CT"];

  for (const location of locations) {
    const url = `https://www.yelp.com/search?find_desc=food+truck&find_loc=${encodeURIComponent(location)}&sortby=rating`;
    console.log(`[Discovery] Yelp: ${location}`);

    const html = await politeGet(url);
    if (!html) {
      await sleep(DELAY_MS);
      continue;
    }

    const $ = cheerio.load(html);
    let found = 0;

    // Yelp result cards — business names are in h3/h4 tags or data attributes
    $("h3, h4").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 2 && text.length < 100) {
        const parent = $(el).closest("li, div[class*='container'], div[class*='businessResult']");
        const snippet = parent.find("p, span[class*='snippet'], span[class*='category']").first().text().trim();

        candidates.push({
          rawName: text,
          rawDescription: snippet || `Food truck business found on Yelp in ${location}`,
          sourceLabel: "yelp",
          townHint: targetTown || location.split(",")[0],
        });
        found++;
      }
    });

    // Also extract from JSON-LD structured data which Yelp includes
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() ?? "{}");
        const items = Array.isArray(json) ? json : json["@graph"] ?? [json];
        for (const item of items) {
          if (item.name && (item["@type"] === "FoodEstablishment" || item["@type"] === "LocalBusiness")) {
            candidates.push({
              rawName: item.name,
              rawDescription: item.description || item.servesCuisine || `Food business in ${location}`,
              rawWebsite: item.url || undefined,
              sourceLabel: "yelp",
              townHint: targetTown || location.split(",")[0],
            });
            found++;
          }
        }
      } catch {
        // ignore parse errors
      }
    });

    console.log(`[Discovery] Yelp "${location}" → ${found} candidates`);
    await sleep(DELAY_MS);
  }

  return candidates;
}

// ── SOURCE 3: CT-specific food truck directories ──────────────────────────────

async function scrapeDirectories(targetTown?: string): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  // Roaming Hunger has town-specific URLs when a town is selected
  const rhUrls = targetTown
    ? [
        `https://www.roaminghunger.com/food-trucks/ct/${townSlug(targetTown)}/`,
        `https://www.roaminghunger.com/food-trucks/ct/`,
      ]
    : [
        "https://www.roaminghunger.com/food-trucks/ct/",
        "https://www.roaminghunger.com/food-trucks/ct/hartford/",
        "https://www.roaminghunger.com/food-trucks/ct/new-haven/",
        "https://www.roaminghunger.com/food-trucks/ct/bridgeport/",
        "https://www.roaminghunger.com/food-trucks/ct/stamford/",
      ];

  for (const url of rhUrls) {
    console.log(`[Discovery] Directory: ${url}`);
    const html = await politeGet(url);
    if (!html) {
      await sleep(DELAY_MS);
      continue;
    }

    const $ = cheerio.load(html);
    let found = 0;

    // Try multiple selector strategies since sites vary their HTML
    const selectors = [
      ".truck-card",
      ".listing-card",
      ".truck-listing",
      "[class*='TruckCard']",
      "[class*='truck-card']",
      "[class*='listing']",
      "article",
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const nameEl = $(el).find("h2, h3, h4, [class*='name'], [class*='title']").first();
        const descEl = $(el).find("p, [class*='description'], [class*='cuisine']").first();
        const linkEl = $(el).find("a[href]").first();
        const href = linkEl.attr("href") ?? "";

        const rawName = nameEl.text().trim();
        if (rawName.length < 3) return;

        candidates.push({
          rawName,
          rawDescription: descEl.text().trim() || `Food truck listing from Roaming Hunger`,
          rawWebsite: href.startsWith("http") && !href.includes("roaminghunger.com") ? href : undefined,
          sourceLabel: "roaminghunger",
          townHint: targetTown,
        });
        found++;
      });
      if (found > 0) break; // stop trying selectors once one works
    }

    // Fallback: extract from JSON-LD structured data
    if (found === 0) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() ?? "{}");
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item.name) {
              candidates.push({
                rawName: item.name,
                rawDescription: item.description || "Food truck",
                rawWebsite: item.url || undefined,
                sourceLabel: "roaminghunger",
                townHint: targetTown,
              });
              found++;
            }
          }
        } catch { /* ignore */ }
      });
    }

    // Last resort: grab all h3 text that looks like a business name
    if (found === 0) {
      $("h3").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 3 && text.length < 80) {
          candidates.push({
            rawName: text,
            rawDescription: "Food truck from CT directory",
            sourceLabel: "roaminghunger",
            townHint: targetTown,
          });
          found++;
        }
      });
    }

    console.log(`[Discovery] ${url} → ${found} candidates`);
    await sleep(DELAY_MS);
  }

  return candidates;
}

// ── Claude extraction ─────────────────────────────────────────────────────────

async function extractWithClaude(
  candidates: RawCandidate[],
  targetTown?: string,
): Promise<ExtractedTruck[]> {
  if (candidates.length === 0) return [];

  const results: ExtractedTruck[] = [];
  const batchSize = 10;
  const townContext = targetTown ? `Focus: ${targetTown}, Connecticut` : "Focus: Connecticut statewide";

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);

    const prompt = `You are extracting Connecticut food truck data for the PermitPilot directory.
${townContext}

Candidates (JSON array):
${JSON.stringify(batch, null, 2)}

For each candidate, return a JSON array with this exact shape per item:
{
  "name": "Official business name (clean, title case, no hashtags)",
  "slug": "url-friendly-slug-from-name",
  "cuisine": "cuisine type (e.g. American, Mexican, BBQ, Latin, Asian Fusion, etc.)",
  "description": "1-2 sentence description of the truck and food",
  "website": "full URL starting with https:// or null",
  "instagramHandle": "instagram handle without @ or null",
  "towns": ["${targetTown ?? "Hartford"}"],
  "confidence": 0.0-1.0
}

Confidence rules:
- 0.8+ = clearly a real CT food truck with a specific name
- 0.65-0.79 = likely a CT food truck but less certain
- below 0.65 = skip (restaurants, bars, generic entries, no clear truck identity)
- If rawName is just a URL, website domain, or generic phrase → confidence 0.0
- If the candidate is from a food truck directory listing → boost confidence by 0.1
- townHint field = the CT town this was found for, use it to populate towns array

Return ONLY valid JSON array, no explanation text.`;

    // Retry up to 3 times on 529 overloaded
    let lastErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        });

        const text =
          response.content[0].type === "text" ? response.content[0].text : "";

        // Strip any markdown code fences
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.log(`[Discovery] Claude returned no JSON array for batch ${i}`);
          break;
        }

        const parsed: ExtractedTruck[] = JSON.parse(jsonMatch[0]);
        for (const t of parsed) {
          if (t.confidence >= 0.65 && t.name && t.name.length > 2) {
            if (!t.slug) {
              t.slug = t.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
            }
            results.push(t);
          }
        }
        lastErr = null;
        break; // success
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 529 && attempt < 2) {
          console.log(`[Discovery] Claude overloaded (529), retrying in ${(attempt + 1) * 5}s...`);
          await sleep((attempt + 1) * 5000);
        } else {
          break;
        }
      }
    }
    if (lastErr) {
      console.error("[Discovery] Claude extraction failed after retries:", lastErr.message);
    }

    await sleep(500);
  }

  return results;
}

// ── Deduplication check ───────────────────────────────────────────────────────

async function isDuplicate(truck: ExtractedTruck): Promise<boolean> {
  // 1. Exact slug match
  const bySlug = await db
    .select({ id: foodTrucks.id })
    .from(foodTrucks)
    .where(eq(foodTrucks.slug, truck.slug))
    .limit(1);
  if (bySlug.length > 0) return true;

  // 2. Fuzzy name match
  const byName = await db
    .select({ id: foodTrucks.id })
    .from(foodTrucks)
    .where(
      or(
        ilike(foodTrucks.name, `%${truck.name}%`),
        ilike(foodTrucks.name, truck.name),
      ),
    )
    .limit(1);
  if (byName.length > 0) return true;

  // 3. Website domain match
  if (truck.website) {
    const domain = extractDomain(truck.website);
    if (domain) {
      const existing = await db
        .select({ id: foodTrucks.id, website: foodTrucks.website })
        .from(foodTrucks)
        .where(sql`website IS NOT NULL`)
        .limit(500);

      for (const row of existing) {
        if (row.website && extractDomain(row.website) === domain) return true;
      }
    }
  }

  return false;
}

// ── Insert helper ─────────────────────────────────────────────────────────────

async function insertTruck(
  truck: ExtractedTruck,
): Promise<"added" | "duplicate" | "error"> {
  try {
    const dup = await isDuplicate(truck);
    if (dup) return "duplicate";

    // Ensure unique slug
    let slug = truck.slug;
    let attempt = 1;
    while (true) {
      const existing = await db
        .select({ id: foodTrucks.id })
        .from(foodTrucks)
        .where(eq(foodTrucks.slug, slug))
        .limit(1);
      if (existing.length === 0) break;
      attempt++;
      slug = `${truck.slug}-${attempt}`;
    }

    await db
      .insert(foodTrucks)
      .values({
        slug,
        name: truck.name,
        cuisine: truck.cuisine || null,
        description: truck.description || null,
        website: truck.website || null,
        instagramHandle: truck.instagramHandle || null,
        towns: truck.towns.length > 0 ? truck.towns : null,
        status: "unclaimed",
        outreachSent: false,
        source: "auto_discovered",
      })
      .onConflictDoNothing();

    return "added";
  } catch (err: any) {
    console.error(`[Discovery] Insert error for ${truck.name}:`, err.message);
    return "error";
  }
}

// ── Config helpers ────────────────────────────────────────────────────────────

async function getLastRunTime(): Promise<Date | null> {
  try {
    const [row] = await db
      .select({ value: configs.value })
      .from(configs)
      .where(eq(configs.key, "discovery_last_run"));
    return row ? new Date(row.value) : null;
  } catch {
    return null;
  }
}

async function setLastRunTime(): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(configs)
    .values({ key: "discovery_last_run", value: now, description: "Last truck discovery run timestamp" })
    .onConflictDoUpdate({
      target: configs.key,
      set: { value: now, updatedAt: new Date() },
    });
}

// ── Log to agent_logs ─────────────────────────────────────────────────────────

async function logRun(
  summary: DiscoverySummary,
  durationMs: number,
  sourceLabel: string,
  targetTown?: string,
): Promise<void> {
  try {
    await db.insert(agentLogs).values({
      agentName: "truck_discovery",
      action: "discovery_run",
      input: JSON.stringify({ source: sourceLabel, targetTown }),
      output: JSON.stringify({
        discovered: summary.discovered,
        added: summary.added,
        duplicates: summary.duplicates,
        errors: summary.errors,
      }),
      success: true,
      durationMs,
    });
  } catch (err) {
    console.error("[Discovery] Failed to write agent log:", err);
  }
}

// ── Core runner ───────────────────────────────────────────────────────────────

async function runDiscovery(
  candidates: RawCandidate[],
  sourceLabel: string,
  maxNew: number,
  targetTown?: string,
): Promise<DiscoverySummary> {
  console.log(`[Discovery] Extracting from ${candidates.length} raw candidates...`);
  const trucks = await extractWithClaude(candidates, targetTown);
  console.log(`[Discovery] Claude extracted ${trucks.length} confident trucks`);

  let added = 0;
  let duplicates = 0;
  let errors = 0;
  const entries: DiscoveryTruckEntry[] = [];

  for (const truck of trucks) {
    if (added >= maxNew) break;

    const result = await insertTruck(truck);
    if (result === "added") added++;
    else if (result === "duplicate") duplicates++;
    else errors++;

    entries.push({
      name: truck.name,
      slug: truck.slug,
      status: result,
      source: sourceLabel,
    });
  }

  return { discovered: trucks.length, added, duplicates, errors, trucks: entries };
}

// ── Public exports ────────────────────────────────────────────────────────────

export async function discoverFromSource(
  source: "duckduckgo" | "yelp" | "directories",
  maxNew: number = 50,
  targetTown?: string,
): Promise<DiscoverySummary> {
  const start = Date.now();
  const label = targetTown ? `${source}:${targetTown}` : source;
  console.log(`[Discovery] Starting source: ${label}`);

  let candidates: RawCandidate[] = [];

  if (source === "duckduckgo") candidates = await scrapeDuckDuckGo(targetTown);
  else if (source === "yelp") candidates = await scrapeYelp(targetTown);
  else if (source === "directories") candidates = await scrapeDirectories(targetTown);

  console.log(`[Discovery] ${label}: ${candidates.length} raw candidates`);

  const summary = await runDiscovery(candidates, source, maxNew, targetTown);
  await logRun(summary, Date.now() - start, source, targetTown);

  console.log(
    `[Discovery] ${label} done — discovered: ${summary.discovered}, added: ${summary.added}, dupes: ${summary.duplicates}`,
  );
  return summary;
}

export async function discoverNewTrucks(
  maxNew: number = 50,
  targetTown?: string,
): Promise<DiscoverySummary> {
  const start = Date.now();
  const label = targetTown ? `all:${targetTown}` : "all sources";
  console.log(`[Discovery] Starting full run — ${label}`);

  // Run sources sequentially when town-targeted (less noise, more focused)
  // Run in parallel for statewide (faster)
  let all: RawCandidate[];

  if (targetTown) {
    const ddg = await scrapeDuckDuckGo(targetTown);
    await sleep(DELAY_MS);
    const yelp = await scrapeYelp(targetTown);
    await sleep(DELAY_MS);
    const dirs = await scrapeDirectories(targetTown);
    all = [...ddg, ...yelp, ...dirs];
  } else {
    const [ddg, yelp, dirs] = await Promise.all([
      scrapeDuckDuckGo(),
      scrapeYelp(),
      scrapeDirectories(),
    ]);
    all = [...ddg, ...yelp, ...dirs];
  }

  console.log(`[Discovery] Total raw candidates: ${all.length}`);

  const summary = await runDiscovery(all, "all", maxNew, targetTown);
  await setLastRunTime();
  await logRun(summary, Date.now() - start, "all", targetTown);

  console.log(
    `[Discovery] Full run done — discovered: ${summary.discovered}, added: ${summary.added}, dupes: ${summary.duplicates}`,
  );
  return summary;
}

export { getLastRunTime };
