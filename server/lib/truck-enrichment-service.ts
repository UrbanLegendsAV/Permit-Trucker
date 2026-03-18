import * as cheerio from "cheerio";
import { db } from "../db";
import { foodTrucks } from "../../shared/schema";
import { eq, isNotNull } from "drizzle-orm";

interface EnrichResult {
  updated: boolean;
  fields: string[];
  error?: string;
}

function extractFirst<T extends string | null>(arr: T[]): T | null {
  return arr.length > 0 ? arr[0] : null;
}

export async function enrichTruckFromWebsite(slug: string): Promise<EnrichResult> {
  const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, slug));
  if (!truck) return { updated: false, fields: [], error: "truck not found" };
  if (!truck.website) return { updated: false, fields: [], error: "no website" };

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(truck.website, {
      signal: controller.signal,
      headers: { "User-Agent": "PermitPilot-Bot/1.0 (permit data enrichment)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return { updated: false, fields: [], error: `HTTP ${res.status}` };
    html = await res.text();
  } catch (err: any) {
    return { updated: false, fields: [], error: err.message };
  }

  const $ = cheerio.load(html);
  const text = $.text();

  // Extract fields via regex
  const phoneMatches = text.match(/(\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})/g) ?? [];
  const emailMatches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  const igMatches = html.match(/instagram\.com\/([a-zA-Z0-9_.]{1,40})/g) ?? [];
  const ttMatches = html.match(/tiktok\.com\/@([a-zA-Z0-9_.]{1,40})/g) ?? [];
  const fbMatches = html.match(/facebook\.com\/([a-zA-Z0-9_.]{1,80})/g) ?? [];

  const phone = extractFirst(phoneMatches);
  const email = extractFirst(emailMatches.filter(e => !e.endsWith(".png") && !e.endsWith(".jpg")));
  const igHandle = igMatches[0]?.replace("instagram.com/", "").split("?")[0] ?? null;
  const ttHandle = ttMatches[0]?.replace("tiktok.com/@", "").split("?")[0] ?? null;
  const fbHandle = fbMatches[0]?.replace("facebook.com/", "").split("?")[0] ?? null;

  // Description: meta description first, then first long <p>
  let description: string | null = $('meta[name="description"]').attr("content") ?? null;
  if (!description) {
    $("p").each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 50 && !description) description = t.slice(0, 300);
    });
  }

  // Build update object — only fill empty fields
  const updates: Record<string, string | null> = {};
  const updatedFields: string[] = [];

  if (phone && !truck.phone) { updates.phone = phone; updatedFields.push("phone"); }
  if (email && !truck.email) { updates.email = email; updatedFields.push("email"); }
  if (igHandle && !truck.instagramHandle) { updates.instagramHandle = igHandle; updatedFields.push("instagram"); }
  if (ttHandle && !truck.tiktokHandle) { updates.tiktokHandle = ttHandle; updatedFields.push("tiktok"); }
  if (fbHandle && !truck.facebookHandle) { updates.facebookHandle = fbHandle; updatedFields.push("facebook"); }
  if (description && !truck.description) { updates.description = description; updatedFields.push("description"); }

  if (updatedFields.length === 0) return { updated: false, fields: [] };

  await db.update(foodTrucks).set(updates as any).where(eq(foodTrucks.slug, slug));
  return { updated: true, fields: updatedFields };
}

export async function enrichAllTrucks(): Promise<{ slug: string; fields: string[] }[]> {
  console.log("[Enrichment] Starting truck enrichment run...");

  const trucks = await db
    .select({ slug: foodTrucks.slug, name: foodTrucks.name })
    .from(foodTrucks)
    .where(isNotNull(foodTrucks.website));

  const results: { slug: string; fields: string[] }[] = [];

  for (const truck of trucks) {
    try {
      const result = await enrichTruckFromWebsite(truck.slug);
      if (result.updated) {
        console.log(`[Enrichment] ${truck.name}: updated ${result.fields.join(", ")}`);
        results.push({ slug: truck.slug, fields: result.fields });
      }
    } catch (err) {
      console.error(`[Enrichment] ${truck.name}: error`, err);
    }
    // 2 second polite delay between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[Enrichment] Done — ${results.length} trucks updated`);
  return results;
}
