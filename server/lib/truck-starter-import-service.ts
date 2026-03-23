import fs from "fs";
import path from "path";
import { db } from "../db";
import { foodTrucks } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import { enrichTruckFromWebsite } from "./truck-enrichment-service";

type StarterRow = {
  name: string;
  website: string | null;
  town: string | null;
  cuisine: string | null;
};

export type StarterImportResult = {
  found: boolean;
  filePath: string | null;
  added: number;
  updated: number;
  duplicates: number;
  errors: number;
  rows: number;
};

const DEFAULT_STARTER_PATHS = [
  "data/ct-food-trucks-starter.csv",
  "data/food-trucks-starter.csv",
  "data/trucks.csv",
  "attached_assets/ct-food-trucks-starter.csv",
  "attached_assets/food-trucks-starter.csv",
  "attached_assets/trucks.csv",
];

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuote = false;

  for (const char of line) {
    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (char === "," && !inQuote) {
      cols.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cols.push(current.trim());
  return cols.map((value) => value.replace(/^"|"$/g, "").trim());
}

function normalizeRows(raw: string): StarterRow[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLower = lines[0].toLowerCase();
  const hasHeader = /name|website|truck|url|town|city|category|cuisine/.test(firstLower);
  const headers = hasHeader ? parseCsvLine(lines[0]).map((header) => header.toLowerCase()) : [];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const findIndex = (patterns: RegExp[], fallback: number) => {
    const matchIndex = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return matchIndex >= 0 ? matchIndex : fallback;
  };

  const nameIdx = hasHeader ? findIndex([/name/, /truck/], 0) : 0;
  const websiteIdx = hasHeader ? findIndex([/website/, /url/, /site/], 1) : 1;
  const townIdx = hasHeader ? findIndex([/town/, /city/, /location/, /base/, /municipality/], 2) : 2;
  const cuisineIdx = hasHeader ? findIndex([/category/, /cuisine/, /type/], 3) : 3;

  return dataLines
    .map((line) => parseCsvLine(line))
    .map((cols) => ({
      name: String(cols[nameIdx] ?? "").trim(),
      website: String(cols[websiteIdx] ?? "").trim() || null,
      town: String(cols[townIdx] ?? "").trim() || null,
      cuisine: String(cols[cuisineIdx] ?? "").trim() || null,
    }))
    .filter((row) => row.name.length > 1);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

export function findStarterCsvPath(): string | null {
  const configured = process.env.TRUCK_STARTER_CSV_PATH ? [process.env.TRUCK_STARTER_CSV_PATH] : [];
  const candidates = [...configured, ...DEFAULT_STARTER_PATHS]
    .map((candidate) => path.resolve(candidate))
    .filter((candidate, index, all) => all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && candidate.toLowerCase().endsWith(".csv")) {
      return candidate;
    }
  }

  return null;
}

export async function importStarterCsvIfAvailable(): Promise<StarterImportResult> {
  const filePath = findStarterCsvPath();
  if (!filePath) {
    return { found: false, filePath: null, added: 0, updated: 0, duplicates: 0, errors: 0, rows: 0 };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const rows = normalizeRows(raw);
  let added = 0;
  let updated = 0;
  let duplicates = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const slug = slugify(row.name);
      const [bySlug] = await db.select({
        id: foodTrucks.id,
        slug: foodTrucks.slug,
        website: foodTrucks.website,
        towns: foodTrucks.towns,
        cuisine: foodTrucks.cuisine,
      }).from(foodTrucks).where(eq(foodTrucks.slug, slug)).limit(1);

      if (bySlug) {
        const mergedTowns = Array.from(new Set([...(bySlug.towns ?? []), ...(row.town ? [row.town] : [])]));
        const updates: Record<string, unknown> = {};
        if (!bySlug.website && row.website) updates.website = row.website;
        if (!bySlug.cuisine && row.cuisine) updates.cuisine = row.cuisine;
        if (mergedTowns.length > (bySlug.towns?.length ?? 0)) updates.towns = mergedTowns;

        if (Object.keys(updates).length > 0) {
          await db.update(foodTrucks).set(updates as any).where(eq(foodTrucks.id, bySlug.id));
          updated++;
          if (row.website || bySlug.website) enrichTruckFromWebsite(bySlug.slug).catch(() => undefined);
        } else {
          duplicates++;
        }
        continue;
      }

      const [byName] = await db.select({
        id: foodTrucks.id,
        slug: foodTrucks.slug,
        website: foodTrucks.website,
        towns: foodTrucks.towns,
        cuisine: foodTrucks.cuisine,
      }).from(foodTrucks).where(sql`LOWER(name) LIKE LOWER(${"%" + row.name + "%"})`).limit(1);

      if (byName) {
        const mergedTowns = Array.from(new Set([...(byName.towns ?? []), ...(row.town ? [row.town] : [])]));
        const updates: Record<string, unknown> = {};
        if (!byName.website && row.website) updates.website = row.website;
        if (!byName.cuisine && row.cuisine) updates.cuisine = row.cuisine;
        if (mergedTowns.length > (byName.towns?.length ?? 0)) updates.towns = mergedTowns;

        if (Object.keys(updates).length > 0) {
          await db.update(foodTrucks).set(updates as any).where(eq(foodTrucks.id, byName.id));
          updated++;
          if (row.website || byName.website) enrichTruckFromWebsite(byName.slug).catch(() => undefined);
        } else {
          duplicates++;
        }
        continue;
      }

      let finalSlug = slug;
      let attempt = 1;
      while (true) {
        const [existing] = await db.select({ id: foodTrucks.id }).from(foodTrucks).where(eq(foodTrucks.slug, finalSlug)).limit(1);
        if (!existing) break;
        attempt += 1;
        finalSlug = `${slug}-${attempt}`;
      }

      await db.insert(foodTrucks).values({
        slug: finalSlug,
        name: row.name,
        website: row.website,
        towns: row.town ? [row.town] : null,
        cuisine: row.cuisine,
        status: "unclaimed",
        outreachSent: false,
        source: "starter_csv",
      }).onConflictDoNothing();

      added++;
      if (row.website) enrichTruckFromWebsite(finalSlug).catch(() => undefined);
    } catch (error) {
      errors++;
      console.error("[Starter CSV] Import error:", error);
    }
  }

  return { found: true, filePath, added, updated, duplicates, errors, rows: rows.length };
}
