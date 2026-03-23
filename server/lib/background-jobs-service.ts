import { storage } from "../storage";
import { discoverNewTrucks } from "./truck-discovery-service";
import { enrichAllTrucks } from "./truck-enrichment-service";
import { importStarterCsvIfAvailable } from "./truck-starter-import-service";
import { runTownCoverageBatch } from "./town-coverage-service";

type JobName = "starter_import" | "truck_discovery" | "truck_enrichment" | "town_coverage";

const runningJobs = new Set<JobName>();
const timers: NodeJS.Timeout[] = [];
let coverageTimer: NodeJS.Timeout | null = null;

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runExclusive(jobName: JobName, work: () => Promise<void>) {
  if (runningJobs.has(jobName)) return;
  runningJobs.add(jobName);
  try {
    await work();
  } catch (error) {
    console.error(`[BackgroundJobs] ${jobName} failed:`, error);
  } finally {
    runningJobs.delete(jobName);
  }
}

async function runStarterImport() {
  await runExclusive("starter_import", async () => {
    const result = await importStarterCsvIfAvailable();
    if (!result.found) {
      console.log("[BackgroundJobs] No starter CSV found. Skipping bootstrap import.");
      return;
    }
    console.log(
      `[BackgroundJobs] Starter CSV import complete from ${result.filePath}: ${result.added} added, ${result.updated} updated, ${result.duplicates} duplicates, ${result.errors} errors.`,
    );
  });
}

async function runTruckDiscovery(maxNew: number) {
  await runExclusive("truck_discovery", async () => {
    const summary = await discoverNewTrucks(maxNew);
    console.log(
      `[BackgroundJobs] Discovery complete: ${summary.added} added, ${summary.duplicates} duplicates, ${summary.errors} errors.`,
    );
  });
}

async function runTruckEnrichment() {
  await runExclusive("truck_enrichment", async () => {
    const results = await enrichAllTrucks();
    console.log(`[BackgroundJobs] Enrichment complete: ${results.length} trucks updated.`);
  });
}

async function runTownCoverage(limit: number) {
  await runExclusive("town_coverage", async () => {
    const result = await runTownCoverageBatch(limit, { state: "CT" });
    for (const town of result.towns) {
      console.log(
        `[BackgroundJobs] Coverage for ${town.townName}: ${town.status} (${town.applicationMode}, confidence ${town.confidence}).`,
      );
    }
    if (result.completed && coverageTimer) {
      clearInterval(coverageTimer);
      coverageTimer = null;
      console.log("[BackgroundJobs] Connecticut town coverage is complete. Stopping finite coverage scheduler.");
    } else {
      console.log(
        `[BackgroundJobs] Coverage batch complete: processed=${result.processed}, remaining=${result.remaining}.`,
      );
    }
  });
}

export function startBackgroundJobs() {
  const jobsEnabled = process.env.ENABLE_BACKGROUND_JOBS !== "false";
  if (!jobsEnabled) {
    console.log("[BackgroundJobs] Disabled via ENABLE_BACKGROUND_JOBS=false");
    return;
  }

  const discoveryIntervalMs = toPositiveInt(process.env.BACKGROUND_DISCOVERY_INTERVAL_MS, 24 * 60 * 60 * 1000);
  const enrichmentIntervalMs = toPositiveInt(process.env.BACKGROUND_ENRICHMENT_INTERVAL_MS, 6 * 60 * 60 * 1000);
  const coverageIntervalMs = toPositiveInt(process.env.BACKGROUND_TOWN_COVERAGE_INTERVAL_MS, 30 * 60 * 1000);
  const discoveryMaxNew = toPositiveInt(process.env.BACKGROUND_DISCOVERY_MAX_NEW, 20);
  const coverageBatchSize = toPositiveInt(process.env.BACKGROUND_TOWN_COVERAGE_BATCH_SIZE, 1);

  setTimeout(() => void runStarterImport(), 5_000);
  setTimeout(() => void runTruckEnrichment(), 15_000);
  setTimeout(() => void runTruckDiscovery(discoveryMaxNew), 30_000);
  setTimeout(() => void runTownCoverage(coverageBatchSize), 45_000);

  timers.push(setInterval(() => void runTruckEnrichment(), enrichmentIntervalMs));
  timers.push(setInterval(() => void runTruckDiscovery(discoveryMaxNew), discoveryIntervalMs));
  coverageTimer = setInterval(() => void runTownCoverage(coverageBatchSize), coverageIntervalMs);
  timers.push(coverageTimer);

  console.log(
    `[BackgroundJobs] Started. enrichment=${enrichmentIntervalMs}ms discovery=${discoveryIntervalMs}ms coverage=${coverageIntervalMs}ms`,
  );
}

export function stopBackgroundJobs() {
  for (const timer of timers) clearInterval(timer);
  timers.length = 0;
  coverageTimer = null;
}
