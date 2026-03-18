/**
 * Truck Discovery Service
 *
 * AUTONOMOUS PIPELINE:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 1. Admin clicks "Discover New Trucks"                                       │
 * │    → discoverNewTrucks() scrapes Google, Instagram hashtags, CT directories │
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

const BOT_UA =
  "Mozilla/5.0 (compatible; PermitPilot-bot/1.0; +https://permitpilot.cloud)";

const DELAY_MS = 1500; // polite crawl delay between requests

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

// ── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// ── Domain extractor ──────────────────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

// ── Polite fetch with timeout ─────────────────────────────────────────────────

async function politeGet(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": BOT_UA },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── SOURCE 1: Google Search scraping ─────────────────────────────────────────

const GOOGLE_QUERIES = [
  "Connecticut food truck catering",
  "CT food truck catering site:facebook.com",
  "food truck Connecticut menu",
  "Hartford CT food truck",
  "Bridgeport CT food truck",
  "New Haven CT food truck",
  "Stamford CT food truck",
  "Waterbury CT food truck",
  "Norwalk CT food truck",
  "Danbury CT food truck",
  "New Britain CT food truck",
  "West Hartford CT food truck",
  "Greenwich CT food truck",
];

async function scrapeGoogle(): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  for (const query of GOOGLE_QUERIES) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20`;
    const html = await politeGet(url);
    if (!html) {
      await sleep(DELAY_MS);
      continue;
    }

    const $ = cheerio.load(html);

    // Google result blocks — various selectors depending on layout
    $("div.g, div[data-hveid]").each((_, el) => {
      const titleEl = $(el).find("h3").first();
      const snippetEl = $(el).find(".VwiC3b, .IsZvec, span").first();
      const linkEl = $(el).find("a[href]").first();

      const rawName = titleEl.text().trim();
      const rawDescription = snippetEl.text().trim();
      const href = linkEl.attr("href") ?? "";
      const rawWebsite =
        href.startsWith("http") && !href.includes("google.com")
          ? href.split("&")[0]
          : undefined;

      if (
        rawName.length > 3 &&
        rawDescription.length > 10 &&
        /food.?truck|catering/i.test(rawName + rawDescription) &&
        /connecticut|CT\b/i.test(rawName + rawDescription)
      ) {
        candidates.push({
          rawName,
          rawDescription,
          rawWebsite,
          sourceLabel: "google",
        });
      }
    });

    await sleep(DELAY_MS);
  }

  return candidates;
}

// ── SOURCE 2: Instagram hashtag pages ────────────────────────────────────────

const IG_HASHTAGS = [
  "https://www.instagram.com/explore/tags/ctfoodtruck/",
  "https://www.instagram.com/explore/tags/connecticutfoodtruck/",
  "https://www.instagram.com/explore/tags/hartfordfoodtruck/",
];

async function scrapeInstagram(): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  for (const url of IG_HASHTAGS) {
    const html = await politeGet(url);
    if (!html) {
      await sleep(DELAY_MS);
      continue;
    }

    // Extract from og:description — Instagram embeds post descriptions here
    const ogDesc =
      html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ??
      "";

    // Extract @handles from full page text near food/CT context
    const handles = (html.match(/@([a-zA-Z0-9_.]{3,30})/g) ?? []).map((h) =>
      h.replace("@", ""),
    );

    for (const handle of handles) {
      // Filter to handles likely to be CT food trucks based on page context
      if (
        ogDesc.toLowerCase().includes(handle.toLowerCase()) ||
        /truck|bbq|taco|grill|eats|food|ct/i.test(handle)
      ) {
        candidates.push({
          rawName: handle,
          rawDescription: `Instagram food truck account @${handle} found on CT food truck hashtag page`,
          rawInstagram: handle,
          sourceLabel: "instagram",
        });
      }
    }

    await sleep(DELAY_MS);
  }

  return candidates;
}

// ── SOURCE 3: CT-specific food truck directories ──────────────────────────────

const DIRECTORY_URLS = [
  "https://www.roaminghunger.com/food-trucks/ct/",
  "https://www.foodtrucksin.com/connecticut/",
];

async function scrapeDirectories(): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];

  for (const url of DIRECTORY_URLS) {
    const html = await politeGet(url);
    if (!html) {
      await sleep(DELAY_MS);
      continue;
    }

    const $ = cheerio.load(html);

    // Roaming Hunger listing cards
    $(
      ".truck-card, .listing-card, article, .truck, [class*='truck'], [class*='listing']",
    ).each((_, el) => {
      const nameEl = $(el).find("h2, h3, h4, .name, .title").first();
      const descEl = $(el)
        .find("p, .description, .bio, .snippet")
        .first();
      const linkEl = $(el).find("a[href]").first();

      const rawName = nameEl.text().trim();
      const rawDescription = descEl.text().trim();
      const href = linkEl.attr("href") ?? "";
      const rawWebsite =
        href.startsWith("http") && !href.includes(new URL(url).hostname)
          ? href
          : undefined;

      if (rawName.length > 3) {
        candidates.push({
          rawName,
          rawDescription: rawDescription || `Food truck listing from ${url}`,
          rawWebsite,
          sourceLabel: url.includes("roaminghunger")
            ? "roaminghunger"
            : "foodtrucksin",
        });
      }
    });

    await sleep(DELAY_MS);
  }

  return candidates;
}

// ── Claude extraction ─────────────────────────────────────────────────────────

async function extractWithClaude(
  candidates: RawCandidate[],
): Promise<ExtractedTruck[]> {
  if (candidates.length === 0) return [];

  // Batch candidates to reduce API calls (up to 10 per request)
  const results: ExtractedTruck[] = [];
  const batchSize = 10;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);

    const prompt = `You are extracting Connecticut food truck data. For each candidate below, extract structured info.

Candidates (JSON array):
${JSON.stringify(batch, null, 2)}

For each candidate, return a JSON array of objects with this exact shape:
{
  "name": "Official truck name (clean, no hashtags)",
  "slug": "url-friendly-slug-from-name",
  "cuisine": "cuisine type (e.g. American, Mexican, BBQ, Asian Fusion)",
  "description": "1-2 sentence description of the truck",
  "website": "https://... or null",
  "instagramHandle": "handle without @ or null",
  "towns": ["Hartford", "New Britain"],
  "confidence": 0.0-1.0
}

Rules:
- confidence >= 0.7 only if this is clearly a real Connecticut food truck
- confidence < 0.5 if it could be a restaurant, not a truck, or not from CT
- Skip Instagram bot/spam accounts (confidence 0.0)
- towns should be a list of CT towns the truck serves (extract from text if possible, else [])
- Return ONLY the JSON array, no other text`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const parsed: ExtractedTruck[] = JSON.parse(jsonMatch[0]);
      for (const t of parsed) {
        if (t.confidence >= 0.7 && t.name && t.slug) {
          results.push(t);
        }
      }
    } catch (err) {
      console.error("[Discovery] Claude extraction error:", err);
    }

    await sleep(500);
  }

  return results;
}

// ── Deduplication check ───────────────────────────────────────────────────────

async function isDuplicate(
  truck: ExtractedTruck,
): Promise<boolean> {
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
  sourceLabel: string,
): Promise<"added" | "duplicate" | "error"> {
  try {
    const dup = await isDuplicate(truck);
    if (dup) return "duplicate";

    // Ensure unique slug by appending -2, -3 etc. if needed
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

// ── Config helpers for rate limiting ─────────────────────────────────────────

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
): Promise<void> {
  try {
    await db.insert(agentLogs).values({
      agentName: "truck_discovery",
      action: "discovery_run",
      input: JSON.stringify({ source: sourceLabel }),
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

// ── Core discovery runner ─────────────────────────────────────────────────────

async function runDiscovery(
  candidates: RawCandidate[],
  sourceLabel: string,
  maxNew: number,
): Promise<DiscoverySummary> {
  const trucks = await extractWithClaude(candidates);

  let added = 0;
  let duplicates = 0;
  let errors = 0;
  const entries: DiscoveryTruckEntry[] = [];

  for (const truck of trucks) {
    if (added >= maxNew) break;

    const result = await insertTruck(truck, sourceLabel);
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

  return {
    discovered: trucks.length,
    added,
    duplicates,
    errors,
    trucks: entries,
  };
}

// ── Public exports ────────────────────────────────────────────────────────────

export async function discoverFromSource(
  source: "google" | "instagram" | "directories",
  maxNew: number = 50,
): Promise<DiscoverySummary> {
  const start = Date.now();
  console.log(`[Discovery] Starting source: ${source}`);

  let candidates: RawCandidate[] = [];

  if (source === "google") candidates = await scrapeGoogle();
  else if (source === "instagram") candidates = await scrapeInstagram();
  else if (source === "directories") candidates = await scrapeDirectories();

  console.log(`[Discovery] ${source}: found ${candidates.length} raw candidates`);

  const summary = await runDiscovery(candidates, source, maxNew);
  await logRun(summary, Date.now() - start, source);

  console.log(
    `[Discovery] ${source} done — discovered: ${summary.discovered}, added: ${summary.added}, dupes: ${summary.duplicates}`,
  );
  return summary;
}

export async function discoverNewTrucks(
  maxNew: number = 50,
): Promise<DiscoverySummary> {
  const start = Date.now();
  console.log("[Discovery] Starting full discovery run (all sources)");

  const [googleCandidates, igCandidates, dirCandidates] = await Promise.all([
    scrapeGoogle(),
    scrapeInstagram(),
    scrapeDirectories(),
  ]);

  // Merge and label
  const all: RawCandidate[] = [
    ...googleCandidates,
    ...igCandidates,
    ...dirCandidates,
  ];

  console.log(`[Discovery] Total raw candidates: ${all.length}`);

  const summary = await runDiscovery(all, "all", maxNew);
  await setLastRunTime();
  await logRun(summary, Date.now() - start, "all");

  console.log(
    `[Discovery] Full run done — discovered: ${summary.discovered}, added: ${summary.added}, dupes: ${summary.duplicates}`,
  );
  return summary;
}

export { getLastRunTime };
