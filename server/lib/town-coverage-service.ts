import { storage } from "../storage";
import type { Town } from "@shared/schema";
import { formDiscoveryService } from "./form-discovery-service";
import { detectPortalProvider } from "./portal-automation-service";

type CoverageStatus = "unprocessed" | "processing" | "classified" | "needs_review" | "not_found";
type ApplicationMode = "unknown" | "pdf_only" | "portal_only" | "mixed" | "mail_in";

export interface TownCoverageResult {
  townId: string;
  townName: string;
  status: CoverageStatus;
  applicationMode: ApplicationMode;
  confidence: number;
  pdfFormsFound: number;
  fillableFormsFound: number;
  portalUrl: string | null;
  searchedUrls: string[];
  sourceUrls: string[];
  portalCandidates: string[];
  notes: string[];
}

export interface TownCoverageBatchResult {
  processed: number;
  classified: number;
  needsReview: number;
  notFound: number;
  remaining: number;
  completed: boolean;
  towns: TownCoverageResult[];
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function isPortalUrl(url?: string | null): boolean {
  if (!url) return false;
  return detectPortalProvider(url) !== "unknown";
}

function inferApplicationMode(town: Town, pdfFormsFound: number, portalUrl: string | null): ApplicationMode {
  if (town.formType === "mail_in") return "mail_in";
  if (pdfFormsFound > 0 && portalUrl) return "mixed";
  if (pdfFormsFound > 0) return "pdf_only";
  if (portalUrl || town.formType === "online_portal") return "portal_only";
  return "unknown";
}

function inferCoverageStatus(mode: ApplicationMode, confidence: number, sourceUrls: string[]): CoverageStatus {
  if (mode === "unknown") {
    return sourceUrls.length > 0 ? "needs_review" : "not_found";
  }
  if (confidence < 60) return "needs_review";
  return "classified";
}

function scoreCoverageEvidence(params: {
  town: Town;
  pdfFormsFound: number;
  fillableFormsFound: number;
  portalUrl: string | null;
  searchedUrls: string[];
  sourceUrls: string[];
}): number {
  const { town, pdfFormsFound, fillableFormsFound, portalUrl, searchedUrls, sourceUrls } = params;
  let score = 15;
  if (pdfFormsFound > 0) score += 35;
  if (fillableFormsFound > 0) score += 15;
  if (portalUrl) score += 25;
  if (town.portalUrl) score += 5;
  if (searchedUrls.length > 0) score += 10;
  if (sourceUrls.length >= 3) score += 5;
  if (town.formType === "mail_in") score += 20;
  return Math.min(score, 95);
}

function buildNotes(params: {
  mode: ApplicationMode;
  pdfFormsFound: number;
  fillableFormsFound: number;
  portalUrl: string | null;
  searchedUrls: string[];
}): string[] {
  const notes: string[] = [];
  if (params.mode === "pdf_only") {
    notes.push(`Stored ${params.pdfFormsFound} PDF form(s) for this town.`);
  }
  if (params.mode === "mixed") {
    notes.push(`Found both stored PDFs (${params.pdfFormsFound}) and a portal path.`);
  }
  if (params.mode === "portal_only") {
    notes.push("Classified as portal-first because a supported municipal portal was found.");
  }
  if (params.mode === "mail_in") {
    notes.push("Town is currently configured as a mail-in or offline workflow.");
  }
  if (params.fillableFormsFound > 0) {
    notes.push(`${params.fillableFormsFound} fillable PDF form(s) are ready for autofill.`);
  }
  if (params.portalUrl) {
    notes.push(`Portal evidence: ${params.portalUrl}`);
  }
  if (params.searchedUrls.length === 0) {
    notes.push("No official source pages were captured during this coverage run.");
  }
  return notes;
}

function compareCoveragePriority(a: Town, b: Town): number {
  const statusRank: Record<string, number> = {
    unprocessed: 0,
    processing: 1,
    needs_review: 2,
    not_found: 3,
    classified: 4,
  };
  const rankDiff = (statusRank[a.coverageStatus ?? "unprocessed"] ?? 9) - (statusRank[b.coverageStatus ?? "unprocessed"] ?? 9);
  if (rankDiff !== 0) return rankDiff;
  const aChecked = a.coverageLastCheckedAt?.getTime?.() ?? 0;
  const bChecked = b.coverageLastCheckedAt?.getTime?.() ?? 0;
  return aChecked - bChecked;
}

export async function classifyTownCoverage(townId: string, options: { force?: boolean } = {}): Promise<TownCoverageResult> {
  const town = await storage.getTown(townId);
  if (!town) {
    throw new Error("Town not found");
  }

  await storage.updateTown(townId, {
    coverageStatus: "processing",
    coverageLastCheckedAt: new Date(),
    coverageAttempts: (town.coverageAttempts ?? 0) + 1,
  });

  const discovery = await formDiscoveryService.discoverFormsForTown(townId, { force: options.force });
  const forms = await storage.getTownForms(townId);
  const pdfFormsFound = forms.length;
  const fillableFormsFound = forms.filter((form) => form.isFillable).length;
  const portalCandidates = uniq([
    town.portalUrl,
    ...(discovery.portalCandidates ?? []),
  ]).filter(isPortalUrl);
  const portalUrl = portalCandidates[0] ?? (town.formType === "online_portal" ? town.portalUrl ?? null : null);

  const sourceUrls = uniq([
    town.portalUrl,
    ...(discovery.searchedUrls ?? []),
    ...(discovery.portalCandidates ?? []),
    ...forms.flatMap((form) => [form.externalUrl, form.sourceUrl]),
  ]);

  const applicationMode = inferApplicationMode(town, pdfFormsFound, portalUrl);
  const confidence = scoreCoverageEvidence({
    town,
    pdfFormsFound,
    fillableFormsFound,
    portalUrl,
    searchedUrls: discovery.searchedUrls ?? [],
    sourceUrls,
  });
  const notes = buildNotes({
    mode: applicationMode,
    pdfFormsFound,
    fillableFormsFound,
    portalUrl,
    searchedUrls: discovery.searchedUrls ?? [],
  });
  const status = inferCoverageStatus(applicationMode, confidence, sourceUrls);
  const provider = portalUrl ? detectPortalProvider(portalUrl) : "unknown";

  await storage.updateTown(townId, {
    portalUrl: portalUrl ?? town.portalUrl,
    portalProvider:
      provider === "viewpoint"
        ? "viewpoint_opengov"
        : provider === "opengov"
          ? "viewpoint_opengov"
          : provider === "seamlessdocs"
            ? "other"
            : town.portalProvider,
    formType:
      applicationMode === "portal_only"
        ? "online_portal"
        : applicationMode === "mail_in"
          ? "mail_in"
          : town.formType === "mail_in"
            ? "mail_in"
            : "pdf_download",
    coverageStatus: status,
    applicationMode,
    coverageConfidence: confidence,
    coverageNotes: notes,
    coverageSourceUrls: sourceUrls,
    coverageEvidence: {
      searchedUrls: discovery.searchedUrls ?? [],
      sourceUrls,
      portalCandidates,
      pdfFormsFound,
      fillableFormsFound,
      portalProvider: provider === "unknown" ? null : provider,
      lastClassificationReason: notes[0] ?? null,
    },
    coverageLastCheckedAt: new Date(),
    coverageCompletedAt: status === "classified" || status === "needs_review" || status === "not_found" ? new Date() : null,
    confidenceScore: Math.max(town.confidenceScore ?? 0, confidence),
  });

  return {
    townId: town.id,
    townName: town.townName,
    status,
    applicationMode,
    confidence,
    pdfFormsFound,
    fillableFormsFound,
    portalUrl,
    searchedUrls: discovery.searchedUrls ?? [],
    sourceUrls,
    portalCandidates,
    notes,
  };
}

export async function getTownCoverageSummary(state = "CT") {
  const towns = await storage.getTowns(state);
  const summary = {
    total: towns.length,
    unprocessed: 0,
    processing: 0,
    classified: 0,
    needsReview: 0,
    notFound: 0,
    remaining: 0,
  };

  for (const town of towns) {
    const status = town.coverageStatus ?? "unprocessed";
    if (status === "unprocessed") summary.unprocessed++;
    if (status === "processing") summary.processing++;
    if (status === "classified") summary.classified++;
    if (status === "needs_review") summary.needsReview++;
    if (status === "not_found") summary.notFound++;
  }

  summary.remaining = summary.unprocessed + summary.processing;
  return summary;
}

export async function runTownCoverageBatch(limit = 1, options: { force?: boolean; state?: string } = {}): Promise<TownCoverageBatchResult> {
  const state = options.state ?? "CT";
  const towns = (await storage.getTowns(state)).sort(compareCoveragePriority);
  const staleProcessingCutoff = Date.now() - 60 * 60 * 1000;
  const queue = towns.filter((town) => {
    if (options.force) return true;
    const status = town.coverageStatus ?? "unprocessed";
    if (status === "unprocessed") return true;
    if (status === "processing") {
      const checkedAt = town.coverageLastCheckedAt?.getTime?.() ?? 0;
      return checkedAt < staleProcessingCutoff;
    }
    return false;
  });
  const targets = queue.slice(0, Math.max(1, limit));
  const results: TownCoverageResult[] = [];

  for (const town of targets) {
    const result = await classifyTownCoverage(town.id, { force: options.force });
    results.push(result);
  }

  const summary = await getTownCoverageSummary(state);
  return {
    processed: results.length,
    classified: results.filter((result) => result.status === "classified").length,
    needsReview: results.filter((result) => result.status === "needs_review").length,
    notFound: results.filter((result) => result.status === "not_found").length,
    remaining: summary.remaining,
    completed: summary.remaining === 0,
    towns: results,
  };
}
