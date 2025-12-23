import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";
import type { ResearchJob, TownRequest, InsertTown } from "@shared/schema";
import { z } from "zod";

const geminiResponseSchema = z.object({
  health_department_url: z.string().nullable().optional(),
  permit_portal_url: z.string().nullable().optional(),
  is_portal_only: z.boolean().optional().default(false),
  has_downloadable_forms: z.boolean().optional().default(false),
  form_urls: z.array(z.string()).optional().default([]),
  permit_types: z.array(z.string()).optional().default(["temporary"]),
  fees: z.object({
    yearly: z.number().nullable().optional(),
    temporary: z.number().nullable().optional(),
    seasonal: z.number().nullable().optional(),
  }).optional().default({}),
  requirements: z.array(z.string()).optional().default([]),
  notes: z.array(z.string()).optional().default([]),
  confidence_score: z.number().min(0).max(100).optional().default(50),
});

type GeminiResearchResponse = z.infer<typeof geminiResponseSchema>;

interface ResearchResult {
  success: boolean;
  healthDeptUrl?: string;
  permitPortalUrl?: string;
  confidenceScore?: number;
  requirements?: {
    permitTypes: string[];
    fees: { yearly?: number; temporary?: number; seasonal?: number };
    requirements: string[];
    notes: string[];
    hasDownloadableForms: boolean;
    formUrls: string[];
    isPortalOnly: boolean;
  };
  error?: string;
  needsReview?: boolean;
}

export class TownResearchService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  private buildResearchPrompt(townName: string, state: string, county?: string): string {
    const location = county ? `${townName}, ${county} County, ${state}` : `${townName}, ${state}`;
    
    return `You are a research assistant helping food truck operators find permit requirements.

Research the following location: ${location}

Find information about food truck/mobile food vendor permits for this municipality. Search for:
1. The official health department or licensing website URL
2. The permit application portal URL (if different from health dept)
3. Whether permits can be downloaded as PDF forms or must be submitted through an online portal
4. Types of permits available (yearly, temporary/event, seasonal)
5. Fee amounts for each permit type
6. General requirements (insurance, health inspection, fire safety, commissary letter, etc.)
7. Any special notes or restrictions

IMPORTANT: Base your research on your knowledge of Connecticut and US municipal permit systems. Focus on accurate, verifiable information.

Return ONLY valid JSON in this exact structure:
{
  "health_department_url": "string URL or null if unknown",
  "permit_portal_url": "string URL or null if same as health dept or unknown",
  "is_portal_only": boolean (true if no downloadable PDF forms, must apply online),
  "has_downloadable_forms": boolean (true if PDF application forms are available),
  "form_urls": ["array of direct PDF download URLs if known, empty array otherwise"],
  "permit_types": ["yearly", "temporary", "seasonal"] (list available types),
  "fees": {
    "yearly": number or null,
    "temporary": number or null,
    "seasonal": number or null
  },
  "requirements": [
    "List of requirements like:",
    "Certificate of Insurance (COI)",
    "Food Handler Certification",
    "Fire Safety Inspection",
    "Commissary Agreement Letter",
    "Vehicle Registration",
    "Menu",
    etc.
  ],
  "notes": [
    "Any special notes, restrictions, or tips for applicants"
  ],
  "confidence_score": number 0-100 (how confident you are in this information)
}`;
  }

  private parseAndValidateResponse(responseText: string): { parsed: GeminiResearchResponse | null; error?: string } {
    try {
      let jsonText = responseText;
      if (jsonText.includes("```json")) {
        jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonText.includes("```")) {
        jsonText = jsonText.replace(/```\s*/g, "");
      }
      
      const rawParsed = JSON.parse(jsonText.trim());
      const validated = geminiResponseSchema.safeParse(rawParsed);
      
      if (!validated.success) {
        console.error("[TownResearch] Schema validation failed:", validated.error.errors);
        return { parsed: null, error: `Schema validation failed: ${validated.error.message}` };
      }
      
      return { parsed: validated.data };
    } catch (error: any) {
      console.error("[TownResearch] JSON parse error:", error.message);
      return { parsed: null, error: `JSON parse error: ${error.message}` };
    }
  }

  async researchTown(townRequest: TownRequest): Promise<ResearchResult> {
    if (!this.genAI) {
      return { success: false, error: "GOOGLE_API_KEY not configured" };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = this.buildResearchPrompt(
        townRequest.townName,
        townRequest.state,
        townRequest.county || undefined
      );

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const { parsed, error } = this.parseAndValidateResponse(responseText);
      
      if (!parsed) {
        return { success: false, error: error || "Failed to parse AI response" };
      }

      const confidenceScore = parsed.confidence_score ?? 50;
      const needsReview = confidenceScore < 70;

      return {
        success: true,
        healthDeptUrl: parsed.health_department_url || undefined,
        permitPortalUrl: parsed.permit_portal_url || undefined,
        confidenceScore,
        needsReview,
        requirements: {
          permitTypes: parsed.permit_types || ["temporary"],
          fees: {
            yearly: parsed.fees?.yearly ?? undefined,
            temporary: parsed.fees?.temporary ?? undefined,
            seasonal: parsed.fees?.seasonal ?? undefined,
          },
          requirements: parsed.requirements || [],
          notes: parsed.notes || [],
          hasDownloadableForms: parsed.has_downloadable_forms ?? false,
          formUrls: parsed.form_urls || [],
          isPortalOnly: parsed.is_portal_only ?? false,
        },
      };
    } catch (error: any) {
      console.error("[TownResearch] Error researching town:", error);
      return { success: false, error: error.message || "Research failed" };
    }
  }

  async processResearchJob(jobId: string): Promise<void> {
    const job = await storage.getResearchJob(jobId);
    if (!job || !job.townRequestId) {
      console.error("[TownResearch] Job not found or missing townRequestId:", jobId);
      return;
    }

    const townRequest = await storage.getTownRequest(job.townRequestId);
    if (!townRequest) {
      console.error("[TownResearch] Town request not found:", job.townRequestId);
      await storage.updateResearchJob(jobId, {
        status: "failed",
        errorMessage: "Town request not found",
      });
      return;
    }

    await storage.updateResearchJob(jobId, {
      status: "researching",
      stage: "discovery",
      progress: 10,
    });

    await storage.updateTownRequest(townRequest.id, {
      researchStatus: "researching",
    });

    console.log(`[TownResearch] Starting research for ${townRequest.townName}, ${townRequest.state}`);

    const result = await this.researchTown(townRequest);

    if (!result.success) {
      const retryCount = (job.retryCount || 0) + 1;
      const maxRetries = 3;
      
      if (retryCount < maxRetries) {
        console.log(`[TownResearch] Research failed, scheduling retry ${retryCount}/${maxRetries}`);
        await storage.updateResearchJob(jobId, {
          retryCount,
          errorMessage: result.error,
          progress: 0,
        });
        
        setTimeout(() => {
          this.processResearchJob(jobId).catch(err => {
            console.error("[TownResearch] Retry failed:", err);
          });
        }, 5000 * retryCount);
      } else {
        console.error(`[TownResearch] Research failed after ${maxRetries} retries`);
        await storage.updateResearchJob(jobId, {
          status: "failed",
          errorMessage: result.error,
          progress: 0,
        });
        await storage.updateTownRequest(townRequest.id, {
          researchStatus: "failed",
        });
      }
      return;
    }

    await storage.updateResearchJob(jobId, {
      status: "researching",
      stage: "analyzing",
      progress: 50,
      healthDeptUrl: result.healthDeptUrl,
      permitPortalUrl: result.permitPortalUrl,
      extractedRequirements: result.requirements,
    });

    if (!townRequest.county) {
      console.log(`[TownResearch] Missing county for ${townRequest.townName} - marking for review`);
      await storage.updateResearchJob(jobId, {
        status: "needs_review",
        stage: "complete",
        progress: 100,
        errorMessage: "Missing county - requires manual review before creating town entry",
      });
      await storage.updateTownRequest(townRequest.id, {
        researchStatus: "needs_review",
      });
      return;
    }

    if (result.needsReview || (result.confidenceScore && result.confidenceScore < 70)) {
      console.log(`[TownResearch] Low confidence (${result.confidenceScore}) - marking for review`);
      await storage.updateResearchJob(jobId, {
        status: "needs_review",
        stage: "complete",
        progress: 100,
        errorMessage: `Low confidence score (${result.confidenceScore}%) - requires manual verification`,
      });
      await storage.updateTownRequest(townRequest.id, {
        researchStatus: "needs_review",
      });
      return;
    }

    const newTown = await this.createTownFromResearch(townRequest, result);

    await storage.updateResearchJob(jobId, {
      status: "completed",
      stage: "complete",
      progress: 100,
    } as any);

    await storage.updateTownRequest(townRequest.id, {
      researchStatus: "completed",
      resultingTownId: newTown.id,
      status: "approved",
    });

    console.log(`[TownResearch] Completed research for ${townRequest.townName}. Created town ID: ${newTown.id}`);
  }

  private async createTownFromResearch(
    townRequest: TownRequest,
    result: ResearchResult
  ): Promise<{ id: string }> {
    const reqs = result.requirements;
    
    const requirementsList = reqs?.requirements || [];
    const hasReq = (keyword: string) => 
      requirementsList.some(r => r.toLowerCase().includes(keyword.toLowerCase()));

    const townData: InsertTown = {
      state: townRequest.state,
      county: townRequest.county!,
      townName: townRequest.townName,
      permitTypes: reqs?.permitTypes || ["temporary"],
      portalUrl: result.permitPortalUrl || result.healthDeptUrl || townRequest.portalUrl,
      formType: reqs?.isPortalOnly ? "online_portal" : "pdf_download",
      requirementsJson: {
        coi: hasReq("insurance") || hasReq("coi"),
        background: hasReq("background"),
        healthInspection: hasReq("health"),
        fireInspection: hasReq("fire"),
        vehicleInspection: hasReq("vehicle"),
        commissaryLetter: hasReq("commissary"),
        menuRequired: hasReq("menu"),
        fees: {
          yearly: reqs?.fees?.yearly,
          temporary: reqs?.fees?.temporary,
          seasonal: reqs?.fees?.seasonal,
        },
        notes: reqs?.notes || [],
      },
      confidenceScore: result.confidenceScore || 60,
    };

    const newTown = await storage.createTown(townData);
    return newTown;
  }

  async triggerResearchForRequest(townRequestId: string): Promise<ResearchJob> {
    const job = await storage.createResearchJob({
      townRequestId,
      status: "pending",
      stage: "queued",
      progress: 0,
    });

    await storage.updateTownRequest(townRequestId, {
      researchJobId: job.id,
      researchStatus: "pending",
    });

    this.processResearchJob(job.id).catch(err => {
      console.error("[TownResearch] Background job error:", err);
    });

    return job;
  }
}

export const townResearchService = new TownResearchService();
