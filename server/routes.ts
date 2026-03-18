import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticatedFlexible } from "./replit_integrations/auth";
const isAuthenticated = isAuthenticatedFlexible; // Use flexible auth for all routes to support both OIDC and email
import {
  insertProfileSchema,
  insertPermitSchema,
  insertBadgeSchema,
  insertTownSchema,
  insertPublicProfileSchema,
  insertReviewSchema,
  insertTownFormSchema,
  insertTownRequestSchema,
} from "@shared/schema";
import { db } from "./db";
import { foodTrucks, towns, townForms, publicProfiles, portalCredentials, configs } from "@shared/schema";
import { eq, desc, count as sqlCount, and, isNotNull, sql } from "drizzle-orm";
import { GoogleGenerativeAI, GenerateContentResult } from "@google/generative-ai";
import {
  fillPdfForm,
  appendDocumentsToPdf,
  getAvailableTemplates,
  getTemplateById,
  fillPdfFromDatabase,
  townFormToTemplate,
  buildDataMapFromParsedData,
  smartMatchFieldToData,
  generateFieldMappingsFromNonFillablePDF,
  parsePastPermit,
  type ParsedUserData
} from "./lib/pdf-service";
import { townResearchService } from "./lib/town-research-service";
import { formDiscoveryService } from "./lib/form-discovery-service";
import { generalApiLimiter, documentParseRateLimiter, researchRateLimiter } from "./lib/rate-limiter";
import { sanitizeHtml } from "./lib/sanitize";
import { syncParsedDataToVault, syncProfileToVault, getVaultCompleteness, getVaultDataForPdfFill } from "./lib/vault-service";
import { createPdfFillJob, pollDatalabJob, startAutoPdfFill, fillPdfWithDatalab, checkDatalabResult } from "./lib/datalab-service";
import { storePortalCredentials, createPortalAutomationJob, executePortalAutomation, approveAndSubmit, isEncryptionConfigured, executeFormPortalSubmission, isPortalForm, detectPortalProvider } from "./lib/portal-automation-service";
import { validatePermitApplication, getRequiredFieldsForPermitType } from "./lib/validation-service";
import { PermitType } from "../shared/validation-rules";
import { runOutreachAgent, sendTestOutreachEmail } from "./lib/outreach-service";
import { enrichAllTrucks, enrichTruckFromWebsite } from "./lib/truck-enrichment-service";
import { discoverNewTrucks, discoverFromSource, getLastRunTime } from "./lib/truck-discovery-service";
import { processInboundEmail, classifyEmailDryRun } from "./lib/orchestrator";
import { inboundEmails, agentLogs } from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const multerMemory = multer({ storage: multer.memoryStorage() });

// Disk storage for image uploads
const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const multerDisk = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) (cb as any)(null, true);
    else (cb as any)(new Error("Only image files allowed"), false);
  },
});

const pdfFillSchema = z.object({
  permitId: z.string().min(1, "Permit ID is required"),
  townId: z.string().min(1, "Town ID is required"),
  vaultId: z.string().min(1, "Vault ID is required"),
  pdfBase64: z.string().min(1, "PDF data is required"),
  pdfFilename: z.string().optional(),
});

const autoFillSchema = z.object({
  permitId: z.string().min(1, "Permit ID is required"),
  townId: z.string().min(1, "Town ID is required"),
  vaultId: z.string().min(1, "Vault ID is required"),
});

const portalCredentialsSchema = z.object({
  townId: z.string().min(1, "Town ID is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const portalAutomationSchema = z.object({
  permitId: z.string().nullable().optional(),
  townId: z.string().min(1, "Town ID is required"),
  vaultId: z.string().min(1, "Vault ID is required"),
  credentialId: z.string().min(1, "Credential ID is required"),
});

const generatePacketSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  includeDocuments: z.boolean().optional().default(true),
});

// Standard document categories to include in permit packets
// IMPORTANT: These are town-agnostic documents - do NOT include permit-application
// as those are specific to individual towns and would cause cross-town contamination
const PERMIT_PACKET_DOC_CATEGORIES = [
  // NOTE: "permit-application" intentionally excluded — we only bundle supporting evidence,
  // never blank permit forms (which would pollute TFE packets with Farmers' Market forms etc.)
  "menu",           // Menu with Prices
  "trailer_diagram", // Trailer/Truck Diagram
  "coi",            // Certificate of Insurance (Liability)
  "insurance",      // Legacy insurance folder
  "food_manager_cert", // Food Handler Certification
  "food_manager",   // Food Manager Certificate
  "cert",           // Legacy cert folder
  "health_permit",  // State Health Department License
  "health_dept",    // Legacy health dept folder
  "fire_safety",    // Fire Safety Inspection
  "vehicle_registration", // Vehicle Registration
  "commissary_letter", // Commissary Agreement Letter
  "commissary",     // Commissary documents
  "business_license", // Business License
];

// Helper function to filter supporting documents for permit packets
function filterSupportingDocs(documents: any[]): any[] {
  return documents.filter((doc: any) => {
    // Normalize folder name: lowercase and convert dashes to underscores
    const folder = (doc.folder || "").toLowerCase().replace(/-/g, "_");
    return PERMIT_PACKET_DOC_CATEGORIES.some(cat => folder.includes(cat));
  });
}

// Build the Golden Questions prompt with targeted extraction hints and 0-100 confidence scoring
function buildGoldenQuestionsPrompt(): string {
  return `You are analyzing food truck/vendor permit application documents. Extract information into these specific categories with NUMERIC confidence scores (0-100).

IMPORTANT EXTRACTION HINTS - Look for these specific keywords:
- SANITIZER TYPE: Look for "Chlorine", "Bleach", "Quaternary", "Quat", "Test Strips", "Sanitizing solution"
- TEMP MONITORING: Look for "Metal Stem Thermometer", "Digital Probe", "Temperature Logs", "Temp Log"
- WATER SUPPLY: Look for "Public Water", "Municipal Water", "Private Well", "Potable Water", "Fresh Water Tank"
- WASTE WATER: Look for "Holding Tank", "Gray Water Tank", "Commissary Disposal", "Grease Trap", "Waste Tank"
- MENU ITEMS: Look for food item lists, "Menu", "Food Items Prepared", "Products Sold"
- TOILET FACILITIES: Look for "Public Restroom", "Portable Toilet", "Restroom Agreement"

For each field, provide:
- "value": The extracted value (or null if not found)
- "confidence": A NUMBER 0-100 (100 = clearly visible/exact match, 80+ = found with minor inference, 50-79 = partial/inferred, <50 = guessed/unclear)
- "source_text": The exact text snippet from the document that contains this info (or null if not found)
- "status": "verified" if confidence >= 80, otherwise "needs_review"

Return ONLY valid JSON in this exact structure:
{
  "contact_info": {
    "business_name": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "applicant_name": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "phone": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "email": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "mailing_address": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" }
  },
  "operations": {
    "water_supply_type": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "toilet_facilities": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "sanitizer_type": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "sanitizing_method": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" }
  },
  "safety": {
    "temperature_monitoring_method": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "cold_storage_method": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "hot_holding_method": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "waste_water_disposal": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" }
  },
  "menu_and_prep": {
    "food_items_list": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "food_source_location": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "prep_location": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" }
  },
  "license_info": {
    "license_type": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "license_number": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "valid_from": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "valid_thru": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "issuing_authority": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" },
    "towns_covered": { "value": null, "confidence": 0, "source_text": null, "status": "needs_review" }
  },
  "raw_text_extract": "First 500 characters of readable text from document...",
  "_meta": {
    "document_type": "permit|license|application|checklist|food_supply|plan_review|other",
    "fields_found": 0,
    "high_confidence_count": 0,
    "medium_confidence_count": 0,
    "low_confidence_count": 0
  }
}

Fill in values where found. For confidence: 80-100 = high, 50-79 = medium, 0-49 = low. Return ONLY the JSON, no explanation.`;
}

// Parse and normalize Gemini response with confidence threshold logic
function parseAndNormalizeGeminiResponse(result: GenerateContentResult): Record<string, unknown> | null {
  let responseText: string;
  try {
    const candidate = result.response.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      responseText = result.response.text();
    } else {
      responseText = candidate.content.parts[0].text;
    }
  } catch (textError) {
    console.error("Failed to extract text from Gemini response:", textError);
    return null;
  }

  let parsedData: Record<string, unknown>;
  try {
    let jsonText = responseText;
    if (jsonText.includes("```json")) {
      jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    } else if (jsonText.includes("```")) {
      jsonText = jsonText.replace(/```\s*/g, "");
    }
    parsedData = JSON.parse(jsonText.trim());
  } catch (parseError) {
    console.error("Failed to parse Gemini response as JSON:", responseText);
    return null;
  }

  // Normalize confidence scores and calculate meta counts
  const categories = ["contact_info", "operations", "safety", "menu_and_prep", "license_info"];
  let fieldsFound = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const category of categories) {
    const categoryData = parsedData[category] as Record<string, { value: unknown; confidence: number | string; source_text: unknown; status?: string }> | undefined;
    if (categoryData && typeof categoryData === "object") {
      for (const [key, field] of Object.entries(categoryData)) {
        if (field && typeof field === "object" && "value" in field) {
          // Convert string confidence to number if needed
          let conf = typeof field.confidence === "string" 
            ? (field.confidence === "high" ? 90 : field.confidence === "medium" ? 65 : 30)
            : (typeof field.confidence === "number" ? field.confidence : 0);
          
          field.confidence = conf;
          
          // Auto-set status based on confidence threshold
          if (field.value !== null && field.value !== undefined && field.value !== "") {
            field.status = conf >= 80 ? "verified" : "needs_review";
            fieldsFound++;
            if (conf >= 80) highCount++;
            else if (conf >= 50) mediumCount++;
            else lowCount++;
          } else {
            field.status = "needs_review";
          }
        }
      }
    }
  }

  parsedData._meta = {
    document_type: (parsedData._meta as Record<string, unknown>)?.document_type || "unknown",
    fields_found: fieldsFound,
    high_confidence_count: highCount,
    medium_confidence_count: mediumCount,
    low_confidence_count: lowCount
  };

  return parsedData;
}

// Save parsed data to profile - PRESERVES user-edited fields (status: "verified")
async function saveParsedDataToProfile(profileId: string, parsedData: Record<string, unknown>): Promise<void> {
  const profile = await storage.getProfile(profileId);
  if (profile) {
    const existingData = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object') 
      ? profile.parsedDataLog as Record<string, unknown>
      : {};
    
    // Deep merge that preserves user-edited fields
    const mergedData: Record<string, unknown> = { ...existingData };
    
    for (const [category, newCategoryData] of Object.entries(parsedData)) {
      // Skip metadata fields
      if (category.startsWith('_')) {
        mergedData[category] = newCategoryData;
        continue;
      }
      
      if (typeof newCategoryData !== 'object' || newCategoryData === null) {
        mergedData[category] = newCategoryData;
        continue;
      }
      
      // Get existing category data
      const existingCategory = (mergedData[category] && typeof mergedData[category] === 'object')
        ? mergedData[category] as Record<string, { value: unknown; confidence: number; source_text: unknown; status?: string }>
        : {};
      
      const newCategory = newCategoryData as Record<string, { value: unknown; confidence: number; source_text: unknown; status?: string }>;
      const mergedCategory = { ...existingCategory };
      
      for (const [field, newFieldData] of Object.entries(newCategory)) {
        const existingField = existingCategory[field];
        
        // PRESERVE user-edited fields - don't overwrite if status is "verified" and source is "manually edited"
        if (existingField && 
            existingField.status === "verified" && 
            existingField.source_text === "manually edited") {
          console.log(`[SaveData] Preserving user-edited field: ${category}.${field}`);
          // Keep existing user-edited data
          continue;
        }
        
        // Skip null/empty values from AI - don't overwrite existing data with nothing
        const newValue = newFieldData?.value;
        if (newValue === null || newValue === undefined || newValue === "" || newValue === "N/A" || newValue === "not found") {
          if (existingField?.value) {
            console.log(`[SaveData] Preserving existing value for ${category}.${field} (new value is empty)`);
            continue; // Keep existing data
          }
        }
        
        // Only update if we have new meaningful data
        mergedCategory[field] = newFieldData;
      }
      
      mergedData[category] = mergedCategory;
    }
    
    mergedData._parsedAt = new Date().toISOString();
    
    await storage.updateProfile(profileId, { parsedDataLog: mergedData });
  }
}

// Admin middleware - requires owner or admin role
const isAdmin = async (req: any, res: Response, next: NextFunction) => {
  if (!req.user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const role = await storage.getUserRole(req.user.claims.sub);
  if (role !== "admin" && role !== "owner") {
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  }
  next();
};

// Owner-only middleware
const isOwner = async (req: any, res: Response, next: NextFunction) => {
  if (!req.user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const role = await storage.getUserRole(req.user.claims.sub);
  if (role !== "owner") {
    return res.status(403).json({ message: "Forbidden - Owner access required" });
  }
  next();
};

// Get client IP for rate limiting
const getClientIp = (req: Request): string => {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
         req.socket.remoteAddress || 
         "unknown";
};

// Helper to get user ID from both auth methods (OIDC and email)
const getUserId = (req: any): string | null => {
  // Check for email-based auth first (stored in session)
  if (req.session?.userId) {
    return req.session.userId;
  }
  // Fall back to OIDC auth
  if (req.user?.claims?.sub) {
    return req.user.claims.sub;
  }
  return null;
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(generalApiLimiter);
  await setupAuth(app);
  registerAuthRoutes(app);

  // Serve uploaded images
  app.get("/api/uploads/:filename", (req, res) => {
    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Not found" });
    res.sendFile(filePath);
  });

  // POST /api/upload — upload an image, returns { url }
  app.post("/api/upload", isAuthenticated, multerDisk.single("file"), (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    res.json({ url: `/api/uploads/${req.file.filename}` });
  });

  app.get("/api/profiles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profiles = await storage.getProfiles(userId);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching profiles:", error);
      res.status(500).json({ message: "Failed to fetch profiles" });
    }
  });

  app.get("/api/profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const profile = await storage.getProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post("/api/profiles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = { ...req.body, userId };
      const parsed = insertProfileSchema.safeParse(data);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const profile = await storage.createProfile(parsed.data);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating profile:", error);
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.patch("/api/profiles/:id", isAuthenticated, async (req, res) => {
    try {
      const profile = await storage.updateProfile(req.params.id, req.body);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      // Keep vault in sync whenever profile data changes (fire-and-forget)
      syncProfileToVault((req.user as any).id, req.params.id).catch(err =>
        console.error("syncProfileToVault after PATCH failed:", err)
      );
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/profiles/:id/sync-vault", isAuthenticated, async (req, res) => {
    try {
      const vault = await syncProfileToVault((req.user as any).id, req.params.id);
      if (!vault) {
        return res.status(404).json({ message: "Profile not found or vault sync failed" });
      }
      res.json(vault);
    } catch (error) {
      console.error("Error syncing vault:", error);
      res.status(500).json({ message: "Failed to sync vault" });
    }
  });

  // POST /api/profiles/:id/parse-past-permit — extract fields from a past permit PDF
  app.post("/api/profiles/:id/parse-past-permit", isAuthenticated, async (req, res) => {
    try {
      const { pdfBase64 } = req.body as { pdfBase64: string };
      if (!pdfBase64) {
        return res.status(400).json({ message: "pdfBase64 is required" });
      }
      const pdfBytes = Uint8Array.from(Buffer.from(pdfBase64, "base64"));
      const extracted = await parsePastPermit(pdfBytes);

      // Update profile with extracted operations data where applicable
      const profile = await storage.getProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const currentOps = ((profile as any).operationsData as Record<string, any>) || {};
      const updatedOps = {
        ...currentOps,
        ...(extracted.wasteWaterDisposal && { wasteWaterDisposal: extracted.wasteWaterDisposal }),
        ...(extracted.handWashingSetup && { handWashingSetup: extracted.handWashingSetup }),
        ...(extracted.truckInteriorDescription && { truckInteriorDescription: extracted.truckInteriorDescription }),
        ...(extracted.garbageSetup && { garbageSetup: extracted.garbageSetup }),
        ...(extracted.electricitySource && { electricitySource: extracted.electricitySource }),
      };

      await storage.updateProfile(req.params.id, { operationsData: updatedOps } as any);

      // Sync to vault
      await syncProfileToVault((req.user as any).id, req.params.id);

      res.json({ extracted, fieldCount: Object.keys(extracted).length });
    } catch (error) {
      console.error("Error parsing past permit:", error);
      const msg = error instanceof Error ? error.message : "Failed to parse past permit";
      res.status(500).json({ message: msg });
    }
  });

  // Food Supplier endpoints
  app.get("/api/suppliers", isAuthenticated, async (req, res) => {
    try {
      const suppliers = await storage.getFoodSuppliersByUserId((req.user as any).id);
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suppliers" });
    }
  });

  app.post("/api/suppliers", isAuthenticated, async (req, res) => {
    try {
      const { supplierName, suppliesWhat, profileId } = req.body as { supplierName: string; suppliesWhat?: string; profileId?: string };
      if (!supplierName?.trim()) {
        return res.status(400).json({ message: "supplierName is required" });
      }
      const supplier = await storage.createFoodSupplier({
        userId: (req.user as any).id,
        profileId: profileId || null,
        supplierName: supplierName.trim(),
        suppliesWhat: suppliesWhat?.trim() || null,
      } as any);
      res.status(201).json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Failed to create supplier" });
    }
  });

  app.delete("/api/suppliers/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteFoodSupplier(parseInt(req.params.id), (req.user as any).id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete supplier" });
    }
  });

  app.delete("/api/profiles/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteProfile(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting profile:", error);
      res.status(500).json({ message: "Failed to delete profile" });
    }
  });

  app.delete("/api/profiles/:id/documents/:docIndex", isAuthenticated, async (req, res) => {
    try {
      const { id, docIndex } = req.params;
      const index = parseInt(docIndex, 10);
      
      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const documents = profile.uploadsJson?.documents || [];
      if (index < 0 || index >= documents.length) {
        return res.status(400).json({ message: "Invalid document index" });
      }
      
      documents.splice(index, 1);
      const updatedProfile = await storage.updateProfile(id, {
        uploadsJson: { ...profile.uploadsJson, documents }
      });
      
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  app.patch("/api/profiles/:id/documents/:docIndex/category", isAuthenticated, async (req, res) => {
    try {
      const { id, docIndex } = req.params;
      const { category } = req.body;
      const index = parseInt(docIndex, 10);
      
      if (!category || typeof category !== 'string') {
        return res.status(400).json({ message: "Category is required" });
      }
      
      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const documents = profile.uploadsJson?.documents || [];
      if (index < 0 || index >= documents.length) {
        return res.status(400).json({ message: "Invalid document index" });
      }
      
      documents[index] = { ...documents[index], folder: category };
      const updatedProfile = await storage.updateProfile(id, {
        uploadsJson: { ...profile.uploadsJson, documents }
      });
      
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating document category:", error);
      res.status(500).json({ message: "Failed to update document category" });
    }
  });

  // Gemini Vision document parsing endpoint (single document)
  app.post("/api/documents/parse-gemini", isAuthenticated, documentParseRateLimiter, async (req: any, res) => {
    try {
      const { documentData, mimeType, profileId } = req.body;
      
      if (!documentData || !mimeType) {
        return res.status(400).json({ message: "documentData and mimeType are required" });
      }

      // Validate base64 format
      if (typeof documentData !== 'string' || documentData.length === 0) {
        return res.status(400).json({ message: "documentData must be a non-empty base64 string" });
      }

      // Validate mimeType
      const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!validMimeTypes.includes(mimeType)) {
        return res.status(400).json({ 
          message: `Invalid mimeType. Supported types: ${validMimeTypes.join(', ')}` 
        });
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "GOOGLE_API_KEY not configured" });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Golden Questions prompt with 0-100 confidence scoring and targeted hints
      const prompt = buildGoldenQuestionsPrompt();

      let result;
      try {
        result = await model.generateContent({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: documentData
                }
              }
            ]
          }]
        });
      } catch (apiError: any) {
        console.error("Gemini API error:", apiError);
        return res.status(502).json({ 
          message: "Failed to communicate with AI service",
          error: apiError.message || "Unknown API error"
        });
      }

      const parsedData = parseAndNormalizeGeminiResponse(result);
      if (!parsedData) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      // If profileId provided, save to profile's parsedDataLog with timestamp
      if (profileId) {
        await saveParsedDataToProfile(profileId, parsedData);
        
        // Auto-sync parsed data to vault (fire-and-forget)
        syncParsedDataToVault(profileId).then(vault => {
          if (vault) {
            console.log(`[Vault] Auto-synced profile ${profileId} to data vault after single-doc parsing`);
          }
        }).catch(vaultErr => {
          console.error(`[Vault] Auto-sync failed for profile ${profileId}:`, vaultErr);
        });
      }

      res.json({ 
        success: true, 
        parsedData,
        message: "Document parsed successfully"
      });
    } catch (error: any) {
      console.error("Error parsing document with Gemini:", error);
      res.status(500).json({ 
        message: "Failed to parse document",
        error: error.message || "Unknown error"
      });
    }
  });

  // Multi-document parsing - analyzes only NEW documents (skips already-analyzed ones)
  app.post("/api/profiles/:id/parse-all-documents", isAuthenticated, documentParseRateLimiter, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { forceReanalyze } = req.body; // Optional: force re-analyze all documents
      const profile = await storage.getProfile(id);
      
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const documents = profile.uploadsJson?.documents || [];
      if (documents.length === 0) {
        return res.status(400).json({ message: "No documents found for this profile" });
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "GOOGLE_API_KEY not configured" });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Build prompt with targeted hints
      const prompt = buildGoldenQuestionsPrompt();

      // Prepare document parts - SKIP already-analyzed documents unless forceReanalyze
      const documentParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
      const documentDescriptions: string[] = [];
      const analyzedDocIndices: number[] = [];
      let skippedCount = 0;

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc.type) continue;
        
        // Skip already-analyzed documents (they have analyzedAt timestamp)
        if (doc.analyzedAt && !forceReanalyze) {
          console.log(`[ParseAll] Skipping already-analyzed document: ${doc.name}`);
          skippedCount++;
          continue;
        }
        
        // Extract base64 data - either from base64 field or from url data URI
        let base64Data = doc.base64;
        let mimeType = doc.type;
        
        if (!base64Data && doc.url) {
          // Parse data URI format: data:application/pdf;base64,ABC123...
          const match = doc.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          }
        }
        
        if (!base64Data) continue;
        
        documentParts.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
        documentDescriptions.push(`Document ${documentParts.length}: ${doc.name || 'Unnamed'} (${doc.folder || 'Uncategorized'})`);
        analyzedDocIndices.push(i);
      }

      // If all documents were already analyzed, return early
      if (documentParts.length === 0) {
        if (skippedCount > 0) {
          return res.json({ 
            success: true, 
            message: `All ${skippedCount} documents have already been analyzed. Your saved answers are preserved.`,
            documentsAnalyzed: 0,
            documentsSkipped: skippedCount
          });
        }
        return res.status(400).json({ message: "No valid document data found" });
      }

      // Create multi-document context prompt
      const multiDocPrompt = `You are analyzing ${documentParts.length} documents for a food truck/vendor permit application. 
IMPORTANT: Search across ALL provided documents to find the answers. Information may be split across different documents (License, Plan Review, Food Supply list, etc.).

Documents provided:
${documentDescriptions.join('\n')}

${prompt}`;

      let result;
      try {
        result = await model.generateContent({
          contents: [{
            role: "user",
            parts: [
              { text: multiDocPrompt },
              ...documentParts
            ]
          }]
        });
      } catch (apiError: any) {
        console.error("Gemini API error:", apiError);
        return res.status(502).json({ 
          message: "Failed to communicate with AI service",
          error: apiError.message || "Unknown API error"
        });
      }

      const parsedData = parseAndNormalizeGeminiResponse(result);
      if (!parsedData) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      // Save to profile (preserves user-edited fields)
      await saveParsedDataToProfile(id, parsedData);
      
      // Auto-sync parsed data to vault (fire-and-forget)
      syncParsedDataToVault(id).then(vault => {
        if (vault) {
          console.log(`[Vault] Auto-synced profile ${id} to data vault after multi-doc parsing`);
        }
      }).catch(vaultErr => {
        console.error(`[Vault] Auto-sync failed for profile ${id}:`, vaultErr);
      });
      
      // Mark analyzed documents with timestamp
      const updatedDocuments = [...documents];
      const now = new Date().toISOString();
      for (const docIndex of analyzedDocIndices) {
        updatedDocuments[docIndex] = {
          ...updatedDocuments[docIndex],
          analyzedAt: now
        };
      }
      await storage.updateProfile(id, { 
        uploadsJson: { documents: updatedDocuments } 
      });

      res.json({ 
        success: true, 
        parsedData,
        documentsAnalyzed: documentParts.length,
        documentsSkipped: skippedCount,
        message: `Analyzed ${documentParts.length} new documents${skippedCount > 0 ? `, skipped ${skippedCount} already-analyzed` : ''}. Your saved answers are preserved.`
      });
    } catch (error: any) {
      console.error("Error parsing all documents:", error);
      res.status(500).json({ 
        message: "Failed to parse documents",
        error: error.message || "Unknown error"
      });
    }
  });

  // Single-document parse endpoint — parse one doc by index, mark analyzedAt, return diff
  app.post("/api/profiles/:id/parse-document/:docIndex", isAuthenticated, documentParseRateLimiter, async (req: any, res) => {
    try {
      const { id, docIndex } = req.params;
      const index = parseInt(docIndex, 10);

      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const documents = profile.uploadsJson?.documents || [];
      if (index < 0 || index >= documents.length) {
        return res.status(400).json({ message: "Invalid document index" });
      }

      const doc = documents[index];

      // Extract base64 data from data URI
      let base64Data = (doc as any).base64;
      let mimeType = doc.type || "application/octet-stream";

      if (!base64Data && doc.url) {
        const match = doc.url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }
      }

      if (!base64Data) {
        return res.status(400).json({ message: "Document has no extractable data" });
      }

      const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!validMimeTypes.includes(mimeType)) {
        return res.status(400).json({ message: `Unsupported document type: ${mimeType}` });
      }

      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "GOOGLE_API_KEY not configured" });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      let result;
      try {
        result = await model.generateContent({
          contents: [{
            role: "user",
            parts: [
              { text: buildGoldenQuestionsPrompt() },
              { inlineData: { mimeType, data: base64Data } }
            ]
          }]
        });
      } catch (apiError: any) {
        return res.status(502).json({ message: "Failed to communicate with AI service", error: apiError.message });
      }

      const parsedData = parseAndNormalizeGeminiResponse(result);
      if (!parsedData) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }

      // Compute diff vs existing saved data to return new/updated field lists
      const existingLog = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object')
        ? profile.parsedDataLog as Record<string, any>
        : {};
      const categories = ["contact_info", "operations", "safety", "menu_and_prep", "license_info"];
      const newFields: string[] = [];
      const updatedFields: string[] = [];
      let fieldsExtracted = 0;

      for (const cat of categories) {
        const newCat = (parsedData[cat] as Record<string, any>) || {};
        const oldCat = (existingLog[cat] as Record<string, any>) || {};
        for (const [field, data] of Object.entries(newCat)) {
          const val = data?.value;
          if (!val || val === "N/A" || val === "not found") continue;
          fieldsExtracted++;
          const label = `${cat}.${field}`;
          if (!oldCat[field]?.value) {
            newFields.push(label);
          } else if (oldCat[field].value !== val) {
            updatedFields.push(label);
          }
        }
      }

      // Save parsed data to profile (preserves user-edited fields)
      await saveParsedDataToProfile(id, parsedData);

      // Mark this doc with analyzedAt timestamp
      const updatedDocuments = [...documents];
      updatedDocuments[index] = { ...updatedDocuments[index], analyzedAt: new Date().toISOString() } as any;
      await storage.updateProfile(id, { uploadsJson: { documents: updatedDocuments } });

      // Sync vault and compute completeness
      const vault = await syncParsedDataToVault(id);
      const vaultCompleteness = vault?.id ? await getVaultCompleteness(vault.id) : null;

      // Badge awards post-parse
      const userId = getUserId(req);
      if (userId && vault?.id) {
        const badgesForUser = await storage.getBadges(userId);

        // Health Inspection badge: doc folder is "health-permit" or "health_permit"
        const docFolder = (doc as any).folder || "";
        const isHealthDoc = docFolder === "health-permit" || docFolder === "health_permit" || docFolder === "health_inspection";
        if (isHealthDoc && fieldsExtracted >= 3) {
          const hasHealthBadge = badgesForUser.some(b => b.badgeType === "health_inspection");
          if (!hasHealthBadge) {
            await storage.createBadge({ userId, badgeType: "health_inspection", tier: "gold" });
          }
        }

        // Verified Operator badge: vault completeness >= 85%
        if (vaultCompleteness && vaultCompleteness.percentage >= 85) {
          const hasVerified = badgesForUser.some(b => b.badgeType === "verified_operator");
          if (!hasVerified) {
            await storage.createBadge({ userId, badgeType: "verified_operator", tier: "gold" });
          }
        }
      }

      res.json({
        success: true,
        fieldsExtracted,
        newFields,
        updatedFields,
        vaultCompleteness,
        parsedData,
      });
    } catch (error: any) {
      console.error("Error parsing single document:", error);
      res.status(500).json({ message: "Failed to parse document", error: error.message });
    }
  });

  // Verify a specific field in parsed data
  app.patch("/api/profiles/:id/parsed-data/verify", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { category, field, verified } = req.body;

      if (!category || !field) {
        return res.status(400).json({ message: "category and field are required" });
      }

      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object')
        ? { ...profile.parsedDataLog as Record<string, unknown> }
        : {};

      // Update the field's verified status
      const categoryData = parsedData[category] as Record<string, { value: unknown; confidence: number; source_text: unknown; status?: string }> | undefined;
      if (categoryData && categoryData[field]) {
        categoryData[field].status = verified ? "verified" : "needs_review";
        parsedData[category] = categoryData;
        parsedData._verifiedAt = new Date().toISOString();

        await storage.updateProfile(id, { parsedDataLog: parsedData });
        
        res.json({ success: true, message: "Field verification updated" });
      } else {
        res.status(400).json({ message: "Field not found in parsed data" });
      }
    } catch (error: any) {
      console.error("Error verifying field:", error);
      res.status(500).json({ message: "Failed to verify field", error: error.message });
    }
  });

  // Edit a specific field in parsed data - saves to BOTH parsedDataLog and userOverrides
  // userOverrides has highest priority and survives AI re-analysis
  app.patch("/api/profiles/:id/parsed-data/edit", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { category, field, value } = req.body;

      if (!category || !field) {
        return res.status(400).json({ message: "category and field are required" });
      }

      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object')
        ? { ...profile.parsedDataLog as Record<string, unknown> }
        : {};

      // Ensure category exists
      if (!parsedData[category]) {
        parsedData[category] = {};
      }

      // Update the field's value and set confidence to 100 (manually edited)
      const categoryData = parsedData[category] as Record<string, { value: unknown; confidence: number; source_text: unknown; status?: string }>;
      categoryData[field] = {
        ...(categoryData[field] || {}),
        value: value,
        confidence: 100,
        source_text: "manually edited",
        status: "verified"
      };
      parsedData[category] = categoryData;
      parsedData._editedAt = new Date().toISOString();

      // Also save to userOverrides - this survives AI re-analysis
      const userOverrides = (profile.userOverrides && typeof profile.userOverrides === 'object')
        ? { ...profile.userOverrides as Record<string, { value: string; savedAt: string; fieldName?: string }> }
        : {};
      
      const overrideKey = `${category}.${field}`;
      userOverrides[overrideKey] = {
        value: String(value),
        savedAt: new Date().toISOString(),
        fieldName: field
      };

      await storage.updateProfile(id, { parsedDataLog: parsedData, userOverrides });
      
      res.json({ success: true, message: "Field updated and saved to user overrides" });
    } catch (error: any) {
      console.error("Error editing field:", error);
      res.status(500).json({ message: "Failed to edit field", error: error.message });
    }
  });

  app.get("/api/permits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const permits = await storage.getPermits(userId);
      res.json(permits);
    } catch (error) {
      console.error("Error fetching permits:", error);
      res.status(500).json({ message: "Failed to fetch permits" });
    }
  });

  app.get("/api/permits/:id", isAuthenticated, async (req, res) => {
    try {
      const permit = await storage.getPermit(req.params.id);
      if (!permit) {
        return res.status(404).json({ message: "Permit not found" });
      }
      res.json(permit);
    } catch (error) {
      console.error("Error fetching permit:", error);
      res.status(500).json({ message: "Failed to fetch permit" });
    }
  });

  app.get("/api/permits/:id/validate", isAuthenticated, async (req: any, res) => {
    try {
      const permit = await storage.getPermit(req.params.id);
      if (!permit) {
        return res.status(404).json({ message: "Permit not found" });
      }
      
      if (!permit.profileId) {
        return res.status(400).json({ message: "Permit has no associated profile" });
      }
      
      const profile = await storage.getProfile(permit.profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const town = permit.townId ? await storage.getTown(permit.townId) : null;
      
      const validation = validatePermitApplication(
        {
          parsedDataLog: profile.parsedDataLog,
          uploadsJson: profile.uploadsJson,
          hasPropane: profile.hasPropane || false,
          hasQfoCert: profile.hasQfoCert || false,
          commissaryName: profile.commissaryName,
          commissaryAddress: profile.commissaryAddress,
        },
        {
          permitType: permit.permitType as PermitType,
          eventName: permit.eventName,
          eventDate: permit.eventDate,
          eventEndDate: permit.eventEndDate,
          eventAddress: permit.eventAddress,
          eventCity: permit.eventCity,
          eventContactName: permit.eventContactName,
          eventContactPhone: permit.eventContactPhone,
        },
        town ? { requirementsJson: town.requirementsJson } : null
      );
      
      res.json({
        ...validation,
        townName: town?.townName || null,
        permitType: permit.permitType,
      });
    } catch (error: any) {
      console.error("Error validating permit:", error);
      res.status(500).json({ message: "Failed to validate permit", error: error.message });
    }
  });

  app.get("/api/validation/requirements", isAuthenticated, async (req: any, res) => {
    try {
      const { permitType, townId } = req.query;
      
      if (!permitType || !["yearly", "temporary", "seasonal"].includes(permitType)) {
        return res.status(400).json({ message: "Valid permitType is required (yearly, temporary, seasonal)" });
      }
      
      let townRequirements = null;
      if (townId) {
        const town = await storage.getTown(townId);
        if (town) {
          townRequirements = town.requirementsJson;
        }
      }
      
      const requiredFields = getRequiredFieldsForPermitType(
        permitType as PermitType,
        townRequirements
      );
      
      res.json({
        permitType,
        requiredFields,
        townId: townId || null,
      });
    } catch (error: any) {
      console.error("Error fetching requirements:", error);
      res.status(500).json({ message: "Failed to fetch requirements", error: error.message });
    }
  });

  app.post("/api/permits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      
      // Convert date strings to Date objects
      const eventDate = req.body.eventDate ? new Date(req.body.eventDate) : null;
      const eventEndDate = req.body.eventEndDate ? new Date(req.body.eventEndDate) : null;
      
      const data = { 
        ...req.body, 
        userId, 
        appliedDate: new Date(),
        eventDate: eventDate && !isNaN(eventDate.getTime()) ? eventDate : null,
        eventEndDate: eventEndDate && !isNaN(eventEndDate.getTime()) ? eventEndDate : null,
      };
      const parsed = insertPermitSchema.safeParse(data);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const permit = await storage.createPermit(parsed.data);
      
      const existingBadges = await storage.getBadges(userId);
      
      if (permit.isPioneer && permit.townId) {
        const hasPioneerForTown = existingBadges.some(
          b => b.badgeType === "pioneer" && b.townId === permit.townId
        );
        if (!hasPioneerForTown) {
          await storage.createBadge({
            userId,
            badgeType: "pioneer",
            tier: "gold",
            townId: permit.townId,
          });
        }
      }
      
      // Award Explorer badge if town has uploaded PDFs (meaning someone was a Pioneer before)
      if (permit.townId) {
        const townForms = await storage.getTownForms(permit.townId);
        const hasUploadedPdfs = townForms.some(f => f.fileData);
        if (hasUploadedPdfs) {
          const hasExplorerForTown = existingBadges.some(
            b => b.badgeType === "explorer" && b.townId === permit.townId
          );
          if (!hasExplorerForTown) {
            await storage.createBadge({
              userId,
              badgeType: "explorer",
              townId: permit.townId,
              tier: "silver",
            });
          }
        }
      }
      
      const hasFirstPermitBadge = existingBadges.some(b => b.badgeType === "first_permit");
      if (!hasFirstPermitBadge) {
        await storage.createBadge({
          userId,
          badgeType: "first_permit",
          tier: "bronze",
        });
      }
      
      // Award food-type badge if profile has a menuType
      if (permit.profileId && permit.townId) {
        const profile = await storage.getProfile(permit.profileId);
        if (profile?.menuType) {
          const foodType = profile.menuType.toLowerCase();
          const hasFoodTypeBadgeForTown = existingBadges.some(
            b => b.badgeType === "food_type" && b.townId === permit.townId && b.foodType === foodType
          );
          if (!hasFoodTypeBadgeForTown) {
            await storage.createBadge({
              userId,
              badgeType: "food_type",
              townId: permit.townId,
              tier: "bronze",
              foodType: foodType,
            });
          }
        }
      }

      // Multi-Town badge: 3+ distinct towns across all user permits
      const allPermits = await storage.getPermits(userId);
      const distinctTowns = new Set(allPermits.map((p: any) => p.townId).filter(Boolean));
      if (distinctTowns.size >= 3) {
        const hasMultiTown = existingBadges.some(b => b.badgeType === "multi_town");
        if (!hasMultiTown) {
          await storage.createBadge({ userId, badgeType: "multi_town", tier: "silver" });
        }
      }

      // Speed Demon badge: permit filed within 10 min of profile creation
      if (permit.profileId) {
        const profileForSpeed = await storage.getProfile(permit.profileId);
        if (profileForSpeed?.createdAt) {
          const minutesDiff = (Date.now() - new Date(profileForSpeed.createdAt).getTime()) / 60000;
          if (minutesDiff <= 10) {
            const hasSpeedDemon = existingBadges.some(b => b.badgeType === "speed_demon");
            if (!hasSpeedDemon) {
              await storage.createBadge({ userId, badgeType: "speed_demon", tier: "bronze" });
            }
          }
        }
      }

      res.status(201).json(permit);
    } catch (error) {
      console.error("Error creating permit:", error);
      res.status(500).json({ message: "Failed to create permit" });
    }
  });

  app.patch("/api/permits/:id", isAuthenticated, async (req, res) => {
    try {
      const updateData = { ...req.body };
      
      // Convert date strings to Date objects for timestamp columns
      if (updateData.eventDate && typeof updateData.eventDate === 'string') {
        updateData.eventDate = new Date(updateData.eventDate);
      }
      if (updateData.eventEndDate && typeof updateData.eventEndDate === 'string') {
        updateData.eventEndDate = new Date(updateData.eventEndDate);
      }
      if (updateData.appliedDate && typeof updateData.appliedDate === 'string') {
        updateData.appliedDate = new Date(updateData.appliedDate);
      }
      if (updateData.expiryDate && typeof updateData.expiryDate === 'string') {
        updateData.expiryDate = new Date(updateData.expiryDate);
      }
      
      const permit = await storage.updatePermit(req.params.id, updateData);
      if (!permit) {
        return res.status(404).json({ message: "Permit not found" });
      }
      res.json(permit);
    } catch (error) {
      console.error("Error updating permit:", error);
      res.status(500).json({ message: "Failed to update permit" });
    }
  });

  app.delete("/api/permits/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePermit(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting permit:", error);
      res.status(500).json({ message: "Failed to delete permit" });
    }
  });

  // ============ PDF GENERATION ============

  // Legacy endpoint - returns hardcoded templates (deprecated)
  app.get("/api/pdf-templates", isAuthenticated, async (req, res) => {
    try {
      const templates = getAvailableTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching PDF templates:", error);
      res.status(500).json({ message: "Failed to fetch PDF templates" });
    }
  });

  // New endpoint - returns forms from database for a specific town
  // Auto-discovers forms if none exist
  app.get("/api/towns/:townId/forms", isAuthenticated, async (req, res) => {
    try {
      const { townId } = req.params;
      const { autoDiscover } = req.query;
      const town = await storage.getTown(townId);
      if (!town) {
        return res.status(404).json({ message: "Town not found" });
      }

      let forms = await storage.getTownForms(townId);
      
      // Auto-discover forms if none exist and not explicitly disabled
      if (forms.length === 0 && autoDiscover !== 'false') {
        // Check if discovery service is configured
        if (!formDiscoveryService.isConfigured()) {
          console.log(`[Forms] No forms for ${town.townName}, but discovery service not configured (missing GOOGLE_API_KEY)`);
          return res.json({
            townId,
            townName: town.townName,
            forms: [],
            fillableForms: [],
            discoveryStarted: false,
            message: `No forms found for ${town.townName}. Form discovery is not available.`,
          });
        }

        // Check if discovery is already in progress
        if (formDiscoveryService.isDiscoveryActive(townId)) {
          console.log(`[Forms] Discovery already in progress for ${town.townName}`);
          return res.json({
            townId,
            townName: town.townName,
            forms: [],
            fillableForms: [],
            discoveryInProgress: true,
            message: `Searching for forms for ${town.townName}... Please refresh in a few seconds.`,
          });
        }

        console.log(`[Forms] No forms for ${town.townName}, triggering auto-discovery...`);
        
        // Run discovery in background and return immediately with discovery status
        formDiscoveryService.discoverFormsForTown(townId).then(result => {
          console.log(`[Forms] Auto-discovery completed for ${town.townName}: ${result.formsDownloaded} forms found`);
        }).catch(err => {
          console.error(`[Forms] Auto-discovery failed for ${town.townName}:`, err);
        });
        
        return res.json({
          townId,
          townName: town.townName,
          forms: [],
          fillableForms: [],
          discoveryStarted: true,
          message: `No forms found for ${town.townName}. Searching town website for permit forms...`,
        });
      }
      
      // Return full TownForm objects so frontend can access all properties
      res.json({
        townId,
        townName: town.townName,
        forms: forms,
        fillableForms: forms.filter(f => f.fileData),
      });
    } catch (error) {
      console.error("Error fetching town forms:", error);
      res.status(500).json({ message: "Failed to fetch town forms" });
    }
  });

  // Fetch PDF from sourceUrl for a form that was discovered but not downloaded
  app.post("/api/towns/:townId/forms/:formId/fetch-pdf", isAuthenticated, async (req, res) => {
    try {
      const { townId, formId } = req.params;
      const form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found" });
      }

      if (form.fileData) {
        return res.json({ success: true, message: "PDF already available", alreadyAvailable: true });
      }

      const sourceUrl = form.sourceUrl || form.externalUrl;
      if (!sourceUrl) {
        return res.status(400).json({ message: "No source URL available for this form" });
      }

      console.log(`[Forms] Fetching PDF from source: ${sourceUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/pdf,application/octet-stream,*/*',
          },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.warn(`[Forms] Source URL returned HTTP ${response.status}: ${sourceUrl}`);
          return res.status(502).json({ 
            message: `The source website returned an error (HTTP ${response.status}). The form may have been moved or removed.`,
            sourceUrl,
          });
        }

        const contentType = response.headers.get('content-type') || '';
        const isPdf = contentType.includes('pdf') || contentType.includes('octet-stream') || sourceUrl.toLowerCase().endsWith('.pdf');
        if (!isPdf) {
          return res.status(400).json({ 
            message: `The source URL did not return a PDF file. You may need to download it manually from the town website.`,
            sourceUrl,
          });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');

        let isFillable = false;
        try {
          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
          const pdfForm = pdfDoc.getForm();
          isFillable = pdfForm.getFields().length > 0;
        } catch {}

        await storage.updateTownForm(formId, {
          fileData: base64,
          fileName: sourceUrl.split('/').pop() || 'form.pdf',
          fileType: 'application/pdf',
          isFillable,
        });

        console.log(`[Forms] Successfully fetched and stored PDF for form ${form.name} (fillable: ${isFillable})`);

        res.json({
          success: true,
          message: `PDF downloaded successfully`,
          isFillable,
          fileName: sourceUrl.split('/').pop() || 'form.pdf',
        });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        if (fetchErr.name === 'AbortError') {
          return res.status(504).json({ message: "PDF download timed out (30s)" });
        }
        throw fetchErr;
      }
    } catch (error: any) {
      console.error("Error fetching form PDF:", error);
      res.status(500).json({ message: "Failed to fetch PDF", error: error.message });
    }
  });

  // Manual form discovery endpoint
  app.post("/api/towns/:townId/discover-forms", isAuthenticated, async (req, res) => {
    try {
      const { townId } = req.params;
      const { force } = req.body;
      
      const town = await storage.getTown(townId);
      if (!town) {
        return res.status(404).json({ message: "Town not found" });
      }

      // Check if discovery service is configured
      if (!formDiscoveryService.isConfigured()) {
        return res.status(503).json({ 
          success: false,
          message: "Form discovery service is not available (GOOGLE_API_KEY not configured)",
        });
      }

      // Check if discovery is already in progress
      if (formDiscoveryService.isDiscoveryActive(townId)) {
        return res.status(409).json({
          success: false,
          message: `Discovery already in progress for ${town.townName}. Please wait.`,
        });
      }

      // Check if forms already exist (unless force is true)
      const existingForms = await storage.getTownForms(townId);
      if (existingForms.length > 0 && !force) {
        return res.json({
          success: true,
          message: `${town.townName} already has ${existingForms.length} forms. Use force=true to re-discover.`,
          formsDiscovered: 0,
          formsDownloaded: 0,
          forms: existingForms.map(f => ({ name: f.name, url: f.externalUrl, downloaded: !!f.fileData })),
        });
      }

      console.log(`[Forms] Manual discovery requested for ${town.townName} (force: ${force || false})`);
      const result = await formDiscoveryService.discoverFormsForTown(townId, { force: !!force });
      
      res.json({
        success: result.success,
        message: result.success 
          ? `Discovered ${result.formsDiscovered} forms for ${town.townName}, downloaded ${result.formsDownloaded}`
          : result.error,
        formsDiscovered: result.formsDiscovered,
        formsDownloaded: result.formsDownloaded,
        forms: result.forms,
        townWebsite: result.townWebsite,
        healthDeptWebsite: result.healthDeptWebsite,
      });
    } catch (error: any) {
      console.error("Error discovering forms:", error);
      res.status(500).json({ message: "Failed to discover forms", error: error.message });
    }
  });

  // Generate PDF from database form - uses Datalab AI when fieldMappings is empty
  app.post("/api/towns/:townId/forms/:formId/generate", isAuthenticated, async (req: any, res) => {
    try {
      console.log("=== PDF GENERATION REQUEST ===");
      const { townId, formId } = req.params;
      const { profileId, includeDocuments = true, eventData, userAnswers = {} } = req.body;
      console.log(`townId=${townId}, formId=${formId}, profileId=${profileId}`);
      console.log("User-provided answers:", Object.keys(userAnswers).length);
      console.log("eventData received:", JSON.stringify(eventData, null, 2));

      // Get the form from database
      let form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found for this town" });
      }

      // If no fileData but sourceUrl exists, try downloading on-the-fly
      if (!form.fileData && (form.sourceUrl || form.externalUrl)) {
        const downloadUrl = form.sourceUrl || form.externalUrl;
        console.log(`[Generate] Form ${formId} has no fileData, attempting download from ${downloadUrl}`);
        try {
          const pdfResponse = await fetch(downloadUrl!, { 
            signal: AbortSignal.timeout(30000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PermitPilot/1.0)' }
          });
          if (pdfResponse.ok && (pdfResponse.headers.get('content-type')?.includes('pdf') || downloadUrl!.toLowerCase().endsWith('.pdf'))) {
            const buffer = Buffer.from(await pdfResponse.arrayBuffer());
            const base64 = buffer.toString('base64');
            await storage.updateTownForm(formId, { fileData: base64 });
            form = { ...form, fileData: base64 };
            console.log(`[Generate] On-the-fly download success for form ${formId}`);
          }
        } catch (err: any) {
          console.error(`[Generate] On-the-fly download failed:`, err.message);
        }
      }

      if (!form.fileData) {
        return res.status(400).json({ message: "Could not load the PDF for this form. The source URL may be unavailable." });
      }

      // Get the profile for user data
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = profile.parsedDataLog as ParsedUserData | null;

      // FIX 3: Auto-sync vault before generating to ensure latest profile data is used
      try {
        await syncProfileToVault((req.user as any).id, profileId);
        console.log("[Generate] Vault synced for profile", profileId);
      } catch (syncErr: any) {
        console.warn("[Generate] Vault sync failed (non-fatal):", syncErr.message);
      }

      // Fetch Data Vault for structured data overlay
      const vaultData = await storage.getDataVaultByProfileId(profileId);
      
      let pdfBytes: Uint8Array;
      const fieldMappings = form.fieldMappings as Record<string, string> | null;
      const hasFieldMappings = fieldMappings && Object.keys(fieldMappings).length > 0;
      
      // Check if form has cached AI mappings from previous Datalab analysis
      const aiMappings = form.aiFieldMappings as {
        fields: Array<{
          pdfFieldName: string;
          fieldType: "text" | "checkbox";
          label: string;
          dataKey: string | null;
          confidence: number;
        }>;
        lastAnalyzedAt: string;
        analysisSource: string;
      } | null;
      const hasCachedMappings = form.datalabAnalyzed && aiMappings && aiMappings.fields?.length > 0;
      
      console.log(`hasFieldMappings=${hasFieldMappings}, hasCachedMappings=${hasCachedMappings}, DATALAB_API_KEY exists=${!!process.env.DATALAB_API_KEY}`);
      
      // EFFICIENCY: Use cached mappings if available (no API call needed!)
      if (hasCachedMappings) {
        console.log(`Using CACHED AI mappings for form ${formId} - NO Datalab API call needed (saving credits!)`);
        console.log(`Cached ${aiMappings.fields.length} field mappings from ${aiMappings.lastAnalyzedAt}`);
        
        if (!parsedData) {
          return res.status(400).json({ message: "Profile has no parsed data. Please analyze documents first." });
        }
        // Pass the cached AI mappings for efficient form filling
        pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, aiMappings.fields, userAnswers, vaultData);
      }
      // If no cached mappings and no manual fieldMappings, use Datalab AI
      else if (!hasFieldMappings && process.env.DATALAB_API_KEY) {
        console.log(`Using Datalab AI for form ${formId} - FIRST TIME (will cache for future use)`);
        
        // Build field data from profile for Datalab
        const fieldData: Record<string, { value: string; description: string }> = {};
        
        // Contact info
        if (parsedData?.contact_info?.business_name?.value) {
          fieldData.business_name = { value: parsedData.contact_info.business_name.value, description: "Name of the business or food truck" };
        }
        if (parsedData?.contact_info?.applicant_name?.value) {
          fieldData.applicant_name = { value: parsedData.contact_info.applicant_name.value, description: "Full name of the applicant or owner" };
        }
        if (parsedData?.contact_info?.phone?.value) {
          fieldData.phone = { value: parsedData.contact_info.phone.value, description: "Contact phone number" };
        }
        if (parsedData?.contact_info?.email?.value) {
          fieldData.email = { value: parsedData.contact_info.email.value, description: "Email address" };
        }
        if (parsedData?.contact_info?.mailing_address?.value) {
          fieldData.address = { value: parsedData.contact_info.mailing_address.value, description: "Mailing address" };
        }
        
        // Operations
        if (parsedData?.operations?.water_supply_type?.value) {
          fieldData.water_supply = { value: parsedData.operations.water_supply_type.value, description: "Type of water supply (public, private, bottled)" };
        }
        if (parsedData?.operations?.toilet_facilities?.value) {
          fieldData.toilet_facilities = { value: parsedData.operations.toilet_facilities.value, description: "Type of toilet facilities" };
        }
        
        // Safety
        if (parsedData?.safety?.hot_holding_method?.value) {
          fieldData.hot_holding = { value: parsedData.safety.hot_holding_method.value, description: "Method for hot holding foods" };
        }
        if (parsedData?.safety?.cold_storage_method?.value) {
          fieldData.cold_storage = { value: parsedData.safety.cold_storage_method.value, description: "Method for cold storage" };
        }
        
        // Menu
        if (parsedData?.menu_and_prep?.food_items_list?.value) {
          fieldData.menu_items = { value: parsedData.menu_and_prep.food_items_list.value, description: "List of food items to be served" };
        }
        if (parsedData?.menu_and_prep?.prep_location?.value) {
          fieldData.prep_location = { value: parsedData.menu_and_prep.prep_location.value, description: "Food preparation location" };
        }
        
        // Profile data
        if (profile.commissaryName) {
          fieldData.commissary_name = { value: profile.commissaryName, description: "Name of commissary facility" };
        }
        if (profile.commissaryAddress) {
          fieldData.commissary_address = { value: profile.commissaryAddress, description: "Address of commissary facility" };
        }
        if (profile.vinPlate) {
          fieldData.vin = { value: profile.vinPlate, description: "Vehicle Identification Number or License Plate" };
        }
        // Check uploadsJson for additional vehicle info
        const uploadsJson = profile.uploadsJson as { licensePlate?: string; vehicleInfo?: { vin?: string; licensePlate?: string } } | null;
        if (uploadsJson?.licensePlate) {
          fieldData.license_plate = { value: uploadsJson.licensePlate, description: "Vehicle license plate number" };
        }
        if (uploadsJson?.vehicleInfo?.vin && !profile.vinPlate) {
          fieldData.vin = { value: uploadsJson.vehicleInfo.vin, description: "Vehicle Identification Number" };
        }

        // Data Vault overlay (structured data takes priority)
        if (vaultData) {
          if (vaultData.businessName) fieldData.business_name = { value: vaultData.businessName, description: "Name of the business or food truck" };
          if (vaultData.ownerName) fieldData.applicant_name = { value: vaultData.ownerName, description: "Full name of the applicant or owner" };
          if (vaultData.phone) fieldData.phone = { value: vaultData.phone, description: "Contact phone number" };
          if (vaultData.email) fieldData.email = { value: vaultData.email, description: "Email address" };
          if (vaultData.mailingStreet) fieldData.address = { value: vaultData.mailingStreet, description: "Mailing address" };
          if (vaultData.vehicleVin) fieldData.vin = { value: vaultData.vehicleVin, description: "Vehicle Identification Number" };
          if (vaultData.vehicleLicensePlate) fieldData.license_plate = { value: vaultData.vehicleLicensePlate, description: "Vehicle license plate number" };
          if (vaultData.waterSupplyType) fieldData.water_supply = { value: vaultData.waterSupplyType, description: "Type of water supply" };
          if (vaultData.commissaryName) fieldData.commissary_name = { value: vaultData.commissaryName, description: "Name of commissary facility" };
          if (vaultData.commissaryAddress) fieldData.commissary_address = { value: vaultData.commissaryAddress, description: "Address of commissary facility" };
          if (vaultData.foodItemsList?.length) fieldData.menu_items = { value: vaultData.foodItemsList.join(', '), description: "List of food items to be served" };
          if (vaultData.prepLocationAddress) fieldData.prep_location = { value: vaultData.prepLocationAddress, description: "Food preparation location" };
        }
        
        // Event data
        if (eventData?.eventName) {
          fieldData.event_name = { value: eventData.eventName, description: "Name of the event" };
        }
        if (eventData?.eventAddress) {
          fieldData.event_location = { value: eventData.eventAddress, description: "Location or address of the event" };
        }
        if (eventData?.eventDates) {
          fieldData.event_dates = { value: eventData.eventDates, description: "Date(s) of the event" };
        }
        if (eventData?.licenseType) {
          fieldData.license_type = { value: eventData.licenseType, description: "License type (temporary or seasonal)" };
        } else {
          // Default to temporary for food trucks - they file event permits
          fieldData.license_type = { value: "temporary", description: "License type (temporary or seasonal)" };
        }
        
        // FOOD TRUCK INDUSTRY DEFAULTS - these are universal truths about mobile food operations
        // Food trucks/trailers NEVER have internal bathrooms - they always use event-site facilities
        if (!fieldData.toilet_facilities) {
          fieldData.toilet_facilities = { value: "portable", description: "Type of toilet facilities (always event-site for food trucks)" };
        }
        // Hand washing in food trucks is always temporary setup
        fieldData.handwash_type = { value: "temporary", description: "Hand washing station type (temporary for mobile operations)" };
        // Food at events is prepared on-site
        fieldData.foods_prepared_onsite = { value: "yes", description: "Whether all foods are prepared at the event site" };
        // Hand washing station shown on sketch (typically yes for permit applications)
        fieldData.handwash_sketch_yes = { value: "yes", description: "Hand washing station is shown on layout sketch" };
        
        // Call Datalab API
        console.log(`Calling Datalab with ${Object.keys(fieldData).length} fields:`, Object.keys(fieldData));
        const datalabResult = await fillPdfWithDatalab({
          pdfBase64: form.fileData,
          pdfFilename: form.fileName || `${form.name}.pdf`,
          fieldData,
          confidenceThreshold: 0.3,
        });
        console.log("Datalab result:", JSON.stringify(datalabResult, null, 2));

        if (!datalabResult.success) {
          console.error("Datalab API failed:", datalabResult.error);
          // Fall back to local filling if Datalab fails
          if (!parsedData) {
            return res.status(400).json({ message: "Profile has no parsed data and Datalab failed. Please analyze documents first." });
          }
          pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, undefined, undefined, vaultData);
        } else if (datalabResult.request_check_url) {
          // Poll for result (Datalab is async)
          console.log("Polling Datalab for result at:", datalabResult.request_check_url);
          let attempts = 0;
          const maxAttempts = 60; // Increased from 30 - give Datalab 2 minutes for complex forms
          let filledPdfBase64: string | null = null;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            const pollResult = await checkDatalabResult(datalabResult.request_check_url);
            console.log(`Poll attempt ${attempts + 1}: status=${pollResult.status}`);
            
            if (pollResult.status === "complete" && pollResult.output_base64) {
              console.log(`Datalab complete - filled ${pollResult.fields_filled?.length || 0} fields, not found: ${pollResult.fields_not_found?.length || 0}`);
              filledPdfBase64 = pollResult.output_base64;
              break;
            } else if (pollResult.status === "failed") {
              console.error("Datalab processing failed:", pollResult.error);
              break;
            }
            attempts++;
          }
          
          if (filledPdfBase64) {
            pdfBytes = new Uint8Array(Buffer.from(filledPdfBase64, "base64"));
            
            // SAVE field mappings using Gemini with PDF image for visual analysis
            console.log("Using Gemini AI with PDF for visual field mapping discovery");
            try {
              const { PDFDocument } = await import("pdf-lib");
              const { GoogleGenerativeAI } = await import("@google/generative-ai");
              
              // Parse the original PDF to get actual field names
              const originalPdfBuffer = Buffer.from(form.fileData!, "base64");
              const originalPdf = await PDFDocument.load(originalPdfBuffer);
              const pdfForm = originalPdf.getForm();
              const pdfFields = pdfForm.getFields();
              
              // Extract field info with more context
              const fieldInfo = pdfFields.map(f => ({
                name: f.getName(),
                type: f.constructor.name === "PDFCheckBox" ? "checkbox" : "text"
              }));
              
              // Available data keys with descriptions
              const availableDataKeys = Object.entries(fieldData).map(([key, { description }]) => ({
                key,
                description
              }));
              
              const apiKey = process.env.GOOGLE_API_KEY;
              let fields: Array<{
                pdfFieldName: string;
                fieldType: "text" | "checkbox";
                label: string;
                dataKey: string | null;
                matchValue?: string | null; // For semantic checkbox rules
                confidence: number;
              }> = [];
              
              if (apiKey) {
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                
                // Send PDF as inline data for Gemini to analyze visually
                const prompt = `You are an expert in food truck and mobile food vendor operations. Analyze this PDF permit application form.

CRITICAL FOOD TRUCK INDUSTRY KNOWLEDGE:
- Food trucks and trailers NEVER have internal bathrooms/toilets - they ALWAYS use event-site facilities (portable toilets, rest rooms at venue)
- When filing for event permits, it's almost always a "Temporary" license (1-14 days), NOT seasonal
- Food trucks typically use "Public Water" from the event site, or "Self-contained" water tanks
- Hand washing stations in food trucks are "Temporary" setups, not permanent fixtures
- All food at events is typically prepared at the event site (answer "Yes" to "Will all foods be prepared at this food service event site?")

The PDF has these AcroForm field IDs:
${JSON.stringify(fieldInfo, null, 2)}

Available data keys from user profile:
${JSON.stringify(availableDataKeys, null, 2)}

Look at the PDF and determine which field ID corresponds to which data key.
For example, if you see "Business Name: _______" and the field ID at that position is "Text1",
then map Text1 -> business_name.

For CHECKBOXES: Look at the label NEXT TO each checkbox to determine its meaning.
Return a "matchValue" that the data key should contain for this checkbox to be checked.

CHECKBOX MAPPING RULES:
- "Temporary" or "Temporary: 1 to 14 days" -> dataKey: "license_type", matchValue: "temporary" (DEFAULT for food truck event permits)
- "Seasonal" or "15 days or longer" -> dataKey: "license_type", matchValue: "seasonal"
- "Public Water" -> dataKey: "water_supply", matchValue: "public"
- "Self-contained" -> dataKey: "water_supply", matchValue: "self-contained"
- "Portable toilets" -> dataKey: "toilet_facilities", matchValue: "portable" (MOST COMMON for food trucks)
- "Rest Rooms" -> dataKey: "toilet_facilities", matchValue: "restroom"
- "At Event Site" (for toilets) -> dataKey: "toilet_facilities", matchValue: "event" (ALWAYS true for food trucks)
- "Yes" next to "Will all foods be prepared..." -> dataKey: "foods_prepared_onsite", matchValue: "yes"
- "Temporary" (hand washing) -> dataKey: "handwash_type", matchValue: "temporary" (DEFAULT for food trucks)
- "Permanent" (hand washing) -> dataKey: "handwash_type", matchValue: "permanent"

Return ONLY valid JSON array with EXACT field names from the list above:
[
  {"pdfFieldName": "exact_field_id", "fieldType": "text", "dataKey": "matching_key_or_null", "label": "what the field asks for", "confidence": 0.0-1.0},
  {"pdfFieldName": "Check Box1", "fieldType": "checkbox", "dataKey": "water_supply", "matchValue": "public", "label": "Public Water", "confidence": 0.9}
]`;

                try {
                  const result = await model.generateContent([
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: "application/pdf",
                        data: form.fileData!
                      }
                    }
                  ]);
                  const responseText = result.response.text();
                  
                  // Parse Gemini response
                  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                  if (jsonMatch) {
                    const mappings = JSON.parse(jsonMatch[0]);
                    fields = fieldInfo.map(f => {
                      const mapping = mappings.find((m: any) => m.pdfFieldName === f.name);
                      return {
                        pdfFieldName: f.name,
                        fieldType: f.type as "text" | "checkbox",
                        label: mapping?.label || f.name,
                        dataKey: mapping?.dataKey || null,
                        matchValue: mapping?.matchValue || null, // For semantic checkbox rules
                        confidence: mapping?.confidence || 0,
                      };
                    });
                    console.log(`Gemini (with PDF vision) discovered ${fields.filter(f => f.dataKey).length}/${fields.length} field mappings`);
                  }
                } catch (geminiError) {
                  console.error("Gemini PDF analysis failed:", geminiError);
                }
              }
              
              // Only cache if we have meaningful mappings (at least 30% of text fields mapped)
              const textFields = fields.filter(f => f.fieldType === "text");
              const mappedTextFields = textFields.filter(f => f.dataKey !== null);
              const mappingCoverage = textFields.length > 0 ? mappedTextFields.length / textFields.length : 0;
              
              // Require at least 30% coverage to consider mappings valid
              const hasValidMappings = mappingCoverage >= 0.3 || mappedTextFields.length >= 5;
              
              if (hasValidMappings && fields.length > 0) {
                const aiFieldMappings = {
                  fields,
                  lastAnalyzedAt: new Date().toISOString(),
                  analysisSource: apiKey ? "gemini" as const : "datalab" as const,
                  coverage: mappingCoverage,
                };
                
                await storage.updateTownForm(formId, {
                  datalabAnalyzed: true,
                  aiFieldMappings: aiFieldMappings as any,
                });
                console.log(`Cached ${fields.length} PDF field mappings (${mappedTextFields.length} text fields matched, ${Math.round(mappingCoverage * 100)}% coverage)`);
              } else {
                console.log(`Gemini mapping coverage too low (${Math.round(mappingCoverage * 100)}%), NOT caching - will use Datalab again next time`);
                // Don't mark as analyzed - will use Datalab again next time
              }
            } catch (cacheError) {
              console.error("Failed to cache field mappings (non-fatal):", cacheError);
            }
          } else {
            // Datalab timed out - try Gemini for intelligent field analysis before falling back
            console.log("Datalab timed out - trying Gemini for intelligent field analysis");
            
            if (!parsedData) {
              return res.status(400).json({ message: "Profile has no parsed data and Datalab timed out." });
            }
            
            // Try Gemini analysis for checkbox and field discovery
            try {
              const { PDFDocument } = await import("pdf-lib");
              const { GoogleGenerativeAI } = await import("@google/generative-ai");
              
              const apiKey = process.env.GOOGLE_API_KEY;
              if (apiKey && form.fileData) {
                const originalPdfBuffer = Buffer.from(form.fileData, "base64");
                const originalPdf = await PDFDocument.load(originalPdfBuffer);
                const pdfForm = originalPdf.getForm();
                const pdfFields = pdfForm.getFields();
                
                const fieldInfo = pdfFields.map(f => ({
                  name: f.getName(),
                  type: f.constructor.name === "PDFCheckBox" ? "checkbox" : "text"
                }));
                
                // Build available data keys with values for Gemini
                const availableData: Record<string, { value: string; description: string }> = {};
                if (parsedData.contact_info?.business_name) availableData.business_name = { value: String(parsedData.contact_info.business_name), description: "Business name" };
                if (parsedData.contact_info?.owner_name) availableData.applicant_name = { value: String(parsedData.contact_info.owner_name), description: "Applicant/owner name" };
                if (parsedData.operations?.water_supply_type) availableData.water_supply = { value: String(parsedData.operations.water_supply_type), description: "Water supply type" };
                if (parsedData.operations?.toilet_facilities) availableData.toilet_facilities = { value: String(parsedData.operations.toilet_facilities), description: "Toilet facilities type" };
                if (eventData?.licenseType) availableData.license_type = { value: eventData.licenseType, description: "License type (temporary or seasonal)" };
                
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                
                const prompt = `You are an expert in food truck and mobile food vendor operations. Analyze this PDF permit form.

CRITICAL FOOD TRUCK INDUSTRY KNOWLEDGE:
- Food trucks and trailers NEVER have internal bathrooms/toilets - they ALWAYS use event-site facilities (portable toilets, rest rooms at venue)
- When filing for event permits, it's almost always a "Temporary" license (1-14 days), NOT seasonal
- Food trucks typically use "Public Water" from the event site, or "Self-contained" water tanks
- Hand washing stations in food trucks are "Temporary" setups, not permanent fixtures
- All food at events is typically prepared at the event site (answer "Yes" to "Will all foods be prepared at this food service event site?")

PDF form fields:
${JSON.stringify(fieldInfo, null, 2)}

Available data keys that can be matched:
- license_type: License type - "temporary" for 1-14 days (DEFAULT for food trucks), "seasonal" for 15+ days
- water_supply: Type of water supply (e.g., "public", "self-contained", "private_well")
- toilet_facilities: Type of toilet facilities - "portable" or "event" (ALWAYS for food trucks), "restroom"
- handwash_type: Handwashing setup type - "temporary" (DEFAULT for food trucks) or "permanent"
- foods_prepared_onsite: Whether all food is prepared at event - "yes" (DEFAULT for food trucks)
- handwash_sketch_yes: Whether hand washing is shown on sketch - "yes" or "no"

CHECKBOX MAPPING RULES:
- "Temporary" or "1 to 14 days" -> dataKey: "license_type", matchValue: "temporary" (DEFAULT)
- "Seasonal" or "15 days or longer" -> dataKey: "license_type", matchValue: "seasonal"
- "Public Water" -> dataKey: "water_supply", matchValue: "public"
- "Self-contained" or "Self-contained / Home" -> dataKey: "water_supply", matchValue: "self-contained"
- "At Event Site" (water) -> dataKey: "water_supply", matchValue: "event"
- "Portable toilets" -> dataKey: "toilet_facilities", matchValue: "portable"
- "Rest Rooms" -> dataKey: "toilet_facilities", matchValue: "restroom"
- "At Event Site" (toilets) -> dataKey: "toilet_facilities", matchValue: "event" (ALWAYS for food trucks)
- "Will all foods be prepared..." + "Yes" -> dataKey: "foods_prepared_onsite", matchValue: "yes"
- "Temporary" (hand washing) -> dataKey: "handwash_type", matchValue: "temporary" (DEFAULT)
- "Permanent" (hand washing) -> dataKey: "handwash_type", matchValue: "permanent"
- "Hand Washing Station is shown on Sketch: Yes" -> dataKey: "handwash_sketch_yes", matchValue: "yes"

Return JSON array with checkbox RULES:
[
  {"fieldName": "Check Box1", "label": "Self-contained / Home", "dataKey": "water_supply", "matchValue": "self-contained"},
  {"fieldName": "Check Box2", "label": "Public Water", "dataKey": "water_supply", "matchValue": "public"},
  {"fieldName": "Check Box3", "label": "Portable toilets", "dataKey": "toilet_facilities", "matchValue": "portable"}
]

IMPORTANT: Return the SEMANTIC MEANING of each checkbox, not whether to check it. We will evaluate against real data later.`;

                const result = await model.generateContent([
                  { text: prompt },
                  { inlineData: { mimeType: "application/pdf", data: form.fileData } }
                ]);
                const responseText = result.response.text();
                
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                  const checkboxRules = JSON.parse(jsonMatch[0]) as Array<{ 
                    fieldName: string; 
                    label: string; 
                    dataKey: string; 
                    matchValue: string;
                  }>;
                  console.log(`Gemini discovered ${checkboxRules.length} checkbox semantic rules`);
                  
                  // Create AI mappings with semantic rules for checkboxes
                  const geminiMappings = fieldInfo.map(f => {
                    const rule = checkboxRules.find(r => r.fieldName === f.name);
                    return {
                      pdfFieldName: f.name,
                      fieldType: f.type as "text" | "checkbox",
                      label: rule?.label || f.name,
                      dataKey: rule?.dataKey || null,
                      matchValue: rule?.matchValue || null, // Store the condition value
                      confidence: rule ? 0.9 : 0.5,
                    };
                  });
                  
                  // Cache these semantic mappings for future use
                  await storage.updateTownForm(formId, {
                    datalabAnalyzed: true,
                    aiFieldMappings: { fields: geminiMappings, lastAnalyzedAt: new Date().toISOString(), analysisSource: "gemini", coverage: 0 } as any,
                  });
                  console.log("Cached Gemini checkbox semantic rules for future use");
                  
                  // Fill PDF using semantic rules evaluated against real data
                  pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, geminiMappings, undefined, vaultData);
                } else {
                  console.log("Gemini analysis returned no parseable JSON, falling back to heuristic");
                  pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, undefined, undefined, vaultData);
                }
              } else {
                console.log("No Gemini API key, falling back to heuristic matching");
                pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, undefined, undefined, vaultData);
              }
            } catch (geminiError) {
              console.error("Gemini fallback failed:", geminiError);
              pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, undefined, undefined, vaultData);
            }
          }
        } else {
          // Datalab returned success but no check URL - fall back
          if (!parsedData) {
            return res.status(400).json({ message: "Profile has no parsed data." });
          }
          pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, undefined, undefined, vaultData);
        }
      } else {
        // Use local field mapping
        if (!parsedData) {
          return res.status(400).json({ message: "Profile has no parsed data. Please analyze documents first." });
        }
        pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, undefined, undefined, vaultData);
      }

      // Optionally append supporting documents
      if (includeDocuments) {
        const documents = profile.uploadsJson?.documents || [];
        const supportingDocs = filterSupportingDocs(documents);
        if (supportingDocs.length > 0) {
          pdfBytes = await appendDocumentsToPdf(pdfBytes, supportingDocs);
        }
      }

      const town = await storage.getTown(townId);
      const filename = `PermitPilot-${(town?.townName || 'permit').replace(/\s+/g, '-')}-${form.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

      // Store generated PDF in submission_jobs for re-download later
      const permitIdForStorage = req.body.permitId;
      if (permitIdForStorage) {
        try {
          const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
          await storage.createSubmissionJob({
            userId: (req.user as any).id,
            permitId: permitIdForStorage,
            townId,
            submissionType: 'pdf_fill',
            status: 'completed',
            filledPdfData: pdfBase64,
            filledPdfFilename: filename,
          } as any);
          console.log(`[Generate] Stored filled PDF in submission_jobs for permit ${permitIdForStorage}`);
        } catch (storeErr: any) {
          console.warn('[Generate] Failed to store PDF (non-fatal):', storeErr.message);
        }
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length,
      });
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("Error generating PDF from database form:", error);
      res.status(500).json({ message: error.message || "Failed to generate PDF" });
    }
  });

  // Re-download a previously generated permit packet
  app.get("/api/permits/:permitId/download", isAuthenticated, async (req: any, res) => {
    try {
      const { permitId } = req.params;
      const jobs = await storage.getSubmissionJobsByPermitId(permitId);
      const job = (jobs as any[]).find((j: any) => j.filledPdfData && j.status === 'completed');
      if (!job?.filledPdfData) {
        return res.status(404).json({ message: "Packet not yet generated — please generate first" });
      }
      const pdfBytes = Buffer.from(job.filledPdfData, 'base64');
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${job.filledPdfFilename || 'permit_package.pdf'}"`,
        'Content-Length': pdfBytes.length,
      });
      res.send(pdfBytes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // inferDataKeyFromLabel removed — replaced by smartMatchFieldToData from pdf-service

  // Analyze form and return unanswered questions for the user to fill in
  app.post("/api/towns/:townId/forms/:formId/analyze-questions", isAuthenticated, async (req: any, res) => {
    try {
      const { townId, formId } = req.params;
      const { profileId, eventData } = req.body;

      const form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found" });
      }

      if (!form.fileData) {
        return res.status(400).json({ message: "Form has no PDF data" });
      }

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = profile.parsedDataLog as ParsedUserData | null;
      
      // Get cached AI mappings if available
      const aiMappings = form.aiFieldMappings as {
        fields: Array<{
          pdfFieldName: string;
          fieldType: "text" | "checkbox";
          label: string;
          dataKey: string | null;
          matchValue?: string | null;
          confidence: number;
        }>;
      } | null;

      // If no cached mappings, analyze with Gemini
      let fields = aiMappings?.fields || [];
      
      if (fields.length === 0 && process.env.GOOGLE_API_KEY && form.fileData) {
        const { PDFDocument } = await import("pdf-lib");
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        
        const pdfBuffer = Buffer.from(form.fileData, "base64");
        const pdf = await PDFDocument.load(pdfBuffer);
        const pdfForm = pdf.getForm();
        const pdfFields = pdfForm.getFields();
        
        const fieldInfo = pdfFields.map(f => ({
          name: f.getName(),
          type: f.constructor.name === "PDFCheckBox" ? "checkbox" : "text"
        }));

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `You are a food truck permit expert. Analyze this PDF form and identify ALL questions that need to be answered.

For EACH text field and checkbox in the form, tell me:
1. What question is being asked (the label/prompt near the field)
2. Whether this is likely answerable from a business profile (name, address, phone, etc.) or needs specific user input

CRITICAL FOOD TRUCK KNOWLEDGE:
- Toilet facilities: Food trucks always use event-site facilities (portable toilets)
- License type: Usually "Temporary" (1-14 days) for event permits
- Hand washing: Always "Temporary" setup for mobile operations
- Food prep: All food prepared on-site at events

PDF form fields:
${JSON.stringify(fieldInfo, null, 2)}

Return JSON array with ALL form fields:
[
  {"pdfFieldName": "Text1", "fieldType": "text", "label": "Business Name", "dataKey": "business_name", "needsUserInput": false, "confidence": 0.95},
  {"pdfFieldName": "Text25", "fieldType": "text", "label": "Describe how food will be protected from contamination", "dataKey": null, "needsUserInput": true, "confidence": 0.9},
  {"pdfFieldName": "Check Box1", "fieldType": "checkbox", "label": "Temporary (1-14 days)", "dataKey": "license_type", "matchValue": "temporary", "needsUserInput": false, "confidence": 0.95}
]

For text fields that require descriptive answers about food safety practices, set needsUserInput: true.`;

        try {
          const result = await model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: "application/pdf", data: form.fileData } }
          ]);
          const responseText = result.response.text();
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            fields = JSON.parse(jsonMatch[0]);
          }
        } catch (geminiError) {
          console.error("Gemini analysis failed:", geminiError);
        }
      }

      // Build complete data map using the SAME logic as PDF filling
      const userOverrides = profile.userOverrides as Record<string, { value: string; savedAt: string; fieldName?: string }> | null;
      
      // Get vault data for additional overrides
      let vaultData = null;
      try {
        vaultData = await storage.getDataVaultByProfileId(profileId);
      } catch { /* vault may not exist */ }

      const dataMap = buildDataMapFromParsedData(
        parsedData,
        vaultData,
        eventData ? {
          eventName: eventData.eventName,
          eventAddress: eventData.eventAddress,
          eventDates: eventData.eventDates,
          hoursOfOperation: eventData.hoursOfOperation,
          personInCharge: eventData.personInCharge,
          licenseType: eventData.licenseType,
        } : undefined,
        userOverrides,
      );

      const filledDataKeys = Object.keys(dataMap).filter(k => dataMap[k]);
      console.log(`[Analyze] Complete data map has ${filledDataKeys.length} filled keys: ${filledDataKeys.join(", ")}`);

      // Use smartMatchFieldToData to determine which fields can be auto-filled
      const unansweredQuestions: Array<{
        fieldName: string;
        fieldType: "text" | "checkbox";
        label: string;
        dataKey: string | null;
        currentValue?: string;
      }> = [];

      let autoFilledCount = 0;

      for (const field of fields) {
        if (field.fieldType !== "text") continue;

        // Try the field's AI-assigned dataKey first
        const hasDirectMatch = field.dataKey && dataMap[field.dataKey];
        
        // Then use smartMatchFieldToData on both the PDF field name AND the label
        const matchByFieldName = smartMatchFieldToData(field.pdfFieldName, dataMap, eventData);
        const matchByLabel = field.label ? smartMatchFieldToData(field.label, dataMap, eventData) : null;

        // Also check if the user has already provided an override for this field
        const hasUserOverride = userOverrides && Object.keys(userOverrides).some(k => {
          const overrideFieldName = (userOverrides as Record<string, { value: string; savedAt: string; fieldName?: string }>)[k].fieldName || k;
          return overrideFieldName === field.pdfFieldName;
        });

        if (hasDirectMatch || matchByFieldName || matchByLabel || hasUserOverride) {
          autoFilledCount++;
          console.log(`[Analyze] Auto-fill: "${field.pdfFieldName}" label="${field.label}" matched=${hasDirectMatch ? 'dataKey' : matchByFieldName ? 'fieldName' : matchByLabel ? 'label' : 'userOverride'}`);
          continue;
        }

        // Don't ask about continuation lines — only ask about Line 1 / the first instance
        const isContinuationLine = /(?:line|row)\s*[2-9]|\([2-9]\)/i.test(field.label || field.pdfFieldName);
        if (isContinuationLine) {
          console.log(`[Analyze] Skipping continuation line: "${field.pdfFieldName}" label="${field.label}"`);
          continue;
        }

        unansweredQuestions.push({
          fieldName: field.pdfFieldName,
          fieldType: field.fieldType,
          label: field.label,
          dataKey: field.dataKey,
        });
      }

      console.log(`[Analyze] Result: ${autoFilledCount} auto-filled, ${unansweredQuestions.length} unanswered out of ${fields.length} total`);

      res.json({
        formId,
        formName: form.name,
        totalFields: fields.length,
        answeredFields: autoFilledCount,
        unansweredQuestions,
        hasAllAnswers: unansweredQuestions.length === 0,
      });
    } catch (error: any) {
      console.error("Error analyzing form questions:", error);
      res.status(500).json({ message: error.message || "Failed to analyze form" });
    }
  });

  app.post("/api/permits/generate/:permitId", isAuthenticated, async (req: any, res) => {
    try {
      const { permitId } = req.params;
      
      const parseResult = generatePacketSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.flatten().fieldErrors 
        });
      }
      const { templateId, includeDocuments } = parseResult.data;

      const permit = await storage.getPermit(permitId);
      if (!permit) {
        return res.status(404).json({ message: "Permit not found" });
      }

      if (!permit.profileId) {
        return res.status(400).json({ message: "Permit has no associated profile" });
      }

      const profile = await storage.getProfile(permit.profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = profile.parsedDataLog as ParsedUserData | null;
      if (!parsedData) {
        return res.status(400).json({ message: "Profile has no parsed data. Please analyze documents first." });
      }

      const template = getTemplateById(templateId);
      if (!template) {
        return res.status(400).json({ message: `Template not found: ${templateId}` });
      }

      const eventData = {
        eventName: permit.eventName || undefined,
        eventAddress: permit.eventAddress || undefined,
        eventDates: permit.eventDate 
          ? `${new Date(permit.eventDate).toLocaleDateString()}${permit.eventEndDate ? ` - ${new Date(permit.eventEndDate).toLocaleDateString()}` : ''}`
          : undefined,
      };

      let pdfBytes = await fillPdfForm(templateId, parsedData, eventData);

      if (includeDocuments) {
        const documents = profile.uploadsJson?.documents || [];
        const supportingDocs = filterSupportingDocs(documents);

        if (supportingDocs.length > 0) {
          pdfBytes = await appendDocumentsToPdf(pdfBytes, supportingDocs);
        }
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${template.townName}_permit_package.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("Error generating permit package:", error);
      res.status(500).json({ message: "Failed to generate permit package", error: error.message });
    }
  });

  app.post("/api/profiles/:profileId/generate-packet", isAuthenticated, async (req: any, res) => {
    try {
      const { profileId } = req.params;
      const { templateId, includeDocuments = true, eventData } = req.body;

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = profile.parsedDataLog as ParsedUserData | null;
      if (!parsedData) {
        return res.status(400).json({ message: "Profile has no parsed data. Please analyze documents first." });
      }

      const template = getTemplateById(templateId);
      if (!template) {
        return res.status(400).json({ message: `Template not found: ${templateId}` });
      }

      let pdfBytes = await fillPdfForm(templateId, parsedData, eventData);

      if (includeDocuments) {
        const documents = profile.uploadsJson?.documents || [];
        const supportingDocs = filterSupportingDocs(documents);

        if (supportingDocs.length > 0) {
          pdfBytes = await appendDocumentsToPdf(pdfBytes, supportingDocs);
        }
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${template.townName}_permit_package.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (error: any) {
      console.error("Error generating permit packet:", error);
      res.status(500).json({ message: "Failed to generate permit packet", error: error.message });
    }
  });

  app.get("/api/towns", async (req, res) => {
    try {
      const state = req.query.state as string | undefined;
      const towns = await storage.getTowns(state);
      res.json(towns);
    } catch (error) {
      console.error("Error fetching towns:", error);
      res.status(500).json({ message: "Failed to fetch towns" });
    }
  });

  app.get("/api/towns/:id", async (req, res) => {
    try {
      const town = await storage.getTown(req.params.id);
      if (!town) {
        return res.status(404).json({ message: "Town not found" });
      }
      res.json(town);
    } catch (error) {
      console.error("Error fetching town:", error);
      res.status(500).json({ message: "Failed to fetch town" });
    }
  });

  app.get("/api/health-districts", async (req, res) => {
    try {
      const districts = await storage.getHealthDistricts();
      res.json(districts);
    } catch (error) {
      console.error("Error fetching health districts:", error);
      res.status(500).json({ message: "Failed to fetch health districts" });
    }
  });

  app.get("/api/health-districts/:id/towns", async (req, res) => {
    try {
      const towns = await storage.getTownsByDistrict(req.params.id);
      res.json(towns);
    } catch (error) {
      console.error("Error fetching towns by district:", error);
      res.status(500).json({ message: "Failed to fetch towns" });
    }
  });

  app.get("/api/badges", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const badges = await storage.getBadges(userId);
      res.json(badges);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const leaderboard = await storage.getLeaderboard();
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/portal-mappings/:townId", isAuthenticated, async (req, res) => {
    try {
      const mapping = await storage.getPortalMapping(req.params.townId);
      res.json(mapping || null);
    } catch (error) {
      console.error("Error fetching portal mapping:", error);
      res.status(500).json({ message: "Failed to fetch portal mapping" });
    }
  });

  // ============ PUBLIC PROFILES (Consumer Discovery) ============
  
  // Get all public trucks for the map (no auth required)
  app.get("/api/public-profiles", async (req, res) => {
    try {
      const profiles = await storage.getPublicProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching public profiles:", error);
      res.status(500).json({ message: "Failed to fetch public profiles" });
    }
  });

  // Get user's own public profile settings
  app.get("/api/my-public-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getPublicProfileByUser(userId);
      res.json(profile || null);
    } catch (error) {
      console.error("Error fetching public profile:", error);
      res.status(500).json({ message: "Failed to fetch public profile" });
    }
  });

  // Create or update public profile
  app.post("/api/public-profiles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const existing = await storage.getPublicProfileByUser(userId);
      
      if (existing) {
        const updated = await storage.updatePublicProfile(existing.profileId, req.body);
        return res.json(updated);
      }
      
      const data = { ...req.body, userId };
      const parsed = insertPublicProfileSchema.safeParse(data);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const profile = await storage.createPublicProfile(parsed.data);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating/updating public profile:", error);
      res.status(500).json({ message: "Failed to save public profile" });
    }
  });

  // Update public profile by profileId
  app.patch("/api/public-profiles/:profileId", isAuthenticated, async (req: any, res) => {
    try {
      const profile = await storage.updatePublicProfile(req.params.profileId, req.body);
      if (!profile) {
        return res.status(404).json({ message: "Public profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error updating public profile:", error);
      res.status(500).json({ message: "Failed to update public profile" });
    }
  });

  // Claim a public profile listing
  app.post("/api/public-profiles/:id/claim", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const profile = await storage.getPublicProfileById(id);
      if (!profile) {
        return res.status(404).json({ message: "Listing not found" });
      }

      if (profile.isVerified) {
        return res.status(400).json({ message: "This listing is already verified" });
      }

      // Log claim request — admin will review manually
      await storage.updatePublicProfileById(id, {
        claimedByUserId: userId,
        claimedAt: new Date(),
      });

      console.log(`[Claim] User ${userId} claimed listing ${id} (${profile.businessName})`);
      res.json({ message: "Claim request submitted. We'll verify your listing within 48 hours." });
    } catch (error: any) {
      console.error("Error processing claim:", error);
      res.status(500).json({ message: error.message || "Failed to process claim" });
    }
  });

  // ============ REVIEWS ============
  
  // Get reviews for a public profile (no auth required)
  app.get("/api/reviews/:publicProfileId", async (req, res) => {
    try {
      const reviews = await storage.getReviews(req.params.publicProfileId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Submit a review (no auth required, but rate-limited by IP)
  app.post("/api/reviews", async (req, res) => {
    try {
      const clientIp = getClientIp(req);
      
      // Rate limit: max 5 reviews per IP per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await storage.getReviewCountByIp(clientIp, oneHourAgo);
      
      if (recentCount >= 5) {
        return res.status(429).json({ message: "Too many reviews. Please try again later." });
      }
      
      // Sanitize user input to prevent XSS
      const sanitizedBody = {
        ...req.body,
        text: sanitizeHtml(req.body.text),
        reviewerName: sanitizeHtml(req.body.reviewerName),
        reviewerIp: clientIp,
      };
      
      const parsed = insertReviewSchema.safeParse(sanitizedBody);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      // Validate rating is 1-5
      if (parsed.data.rating < 1 || parsed.data.rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      
      const review = await storage.createReview(parsed.data);
      res.status(201).json(review);
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ message: "Failed to submit review" });
    }
  });

  // ============ ADMIN ROUTES ============
  
  // Get current user's role
  app.get("/api/me/role", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const role = await storage.getUserRole(userId);
      res.json({ role: role || "user" });
    } catch (error) {
      console.error("Error fetching user role:", error);
      res.status(500).json({ message: "Failed to fetch user role" });
    }
  });

  // ── Outreach Agent (admin only) ─────────────────────────────────────────

  // POST /api/admin/outreach — run full outreach for all unclaimed trucks
  app.post("/api/admin/outreach", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Rate-limit: only allow one run per 24 hours using configs table
      const lastRunConfig = await storage.getConfig("outreach_last_run");
      if (lastRunConfig) {
        const lastRun = new Date(lastRunConfig.value);
        const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return res.status(429).json({
            message: `Outreach was last run ${Math.round(hoursSince)}h ago. Wait ${Math.round(24 - hoursSince)}h before running again.`,
          });
        }
      }

      // Record run time
      await storage.setConfig("outreach_last_run", new Date().toISOString(), "Timestamp of last outreach agent run");

      const summary = await runOutreachAgent();
      res.json(summary);
    } catch (error) {
      console.error("Error running outreach agent:", error);
      const message = error instanceof Error ? error.message : "Outreach agent failed";
      res.status(500).json({ message });
    }
  });

  // POST /api/admin/outreach/test — send a single test email (no DB changes)
  app.post("/api/admin/outreach/test", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { email, slug } = req.body as { email: string; slug: string };
      if (!email || !slug) {
        return res.status(400).json({ message: "email and slug are required" });
      }
      await sendTestOutreachEmail(email, slug);
      res.json({ success: true, message: `Test email sent to ${email}` });
    } catch (error) {
      console.error("Error sending test email:", error);
      const message = error instanceof Error ? error.message : "Failed to send test email";
      res.status(500).json({ message });
    }
  });

  // GET /api/admin/vault-debug/:userId — inspect raw data_vaults row for a user
  app.get("/api/admin/vault-debug/:userId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const profiles = await storage.getProfilesByUserId(req.params.userId);
      const vaults = await Promise.all(
        profiles.map(p => storage.getDataVaultByProfileId(p.id))
      );
      res.json({
        userId: req.params.userId,
        profiles: profiles.map(p => ({ id: p.id, name: (p as any).name })),
        vaults: vaults.filter(Boolean),
      });
    } catch (error) {
      console.error("Error fetching vault debug info:", error);
      res.status(500).json({ message: "Failed to fetch vault debug info" });
    }
  });

  // Get all configs (admin only)
  app.get("/api/admin/configs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const configs = await storage.getAllConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Error fetching configs:", error);
      res.status(500).json({ message: "Failed to fetch configs" });
    }
  });

  // Update a config (admin only)
  app.post("/api/admin/configs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { key, value, description } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const config = await storage.setConfig(key, String(value), description, userId);
      res.json(config);
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ message: "Failed to update config" });
    }
  });

  // Get all users (admin only)
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user role (owner only)
  app.patch("/api/admin/users/:userId/role", isAuthenticated, isOwner, async (req, res) => {
    try {
      const { role } = req.body;
      if (!["user", "admin", "owner"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      await storage.setUserRole(req.params.userId, role);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Admin: Create town
  app.post("/api/admin/towns", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = insertTownSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const town = await storage.createTown(parsed.data);
      res.status(201).json(town);
    } catch (error) {
      console.error("Error creating town:", error);
      res.status(500).json({ message: "Failed to create town" });
    }
  });

  // Admin: Update town
  app.patch("/api/admin/towns/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const town = await storage.updateTown(req.params.id, req.body);
      if (!town) {
        return res.status(404).json({ message: "Town not found" });
      }
      res.json(town);
    } catch (error) {
      console.error("Error updating town:", error);
      res.status(500).json({ message: "Failed to update town" });
    }
  });

  // Admin: Delete town
  app.delete("/api/admin/towns/:id", isAuthenticated, isOwner, async (req, res) => {
    try {
      await storage.deleteTown(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting town:", error);
      res.status(500).json({ message: "Failed to delete town" });
    }
  });

  // Admin: Get all reviews for moderation
  app.get("/api/admin/reviews", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allReviews = await storage.getAllReviews();
      res.json(allReviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Admin: Update review status (approve/deny)
  app.patch("/api/admin/reviews/:id/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["pending", "approved", "denied"] as const;
      if (!status || typeof status !== "string" || !validStatuses.includes(status as typeof validStatuses[number])) {
        return res.status(400).json({ message: "Invalid status. Must be: pending, approved, or denied" });
      }
      const updated = await storage.updateReviewStatus(req.params.id, status as "pending" | "approved" | "denied");
      if (!updated) {
        return res.status(404).json({ message: "Review not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating review status:", error);
      res.status(500).json({ message: "Failed to update review status" });
    }
  });

  // Admin: Delete review
  app.delete("/api/admin/reviews/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteReview(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ message: "Failed to delete review" });
    }
  });

  // ========== Town Forms (official municipality PDF forms) ==========

  // Admin: Get all forms with town info
  app.get("/api/admin/forms", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const forms = await storage.getAllTownForms();
      res.json(forms);
    } catch (error) {
      console.error("Error fetching all forms:", error);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  // Admin: Upload PDF to form and award Pioneer badge
  app.patch("/api/admin/forms/:id/upload", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { fileData, fileName, fileType } = req.body;
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      if (!fileData || !fileName) {
        return res.status(400).json({ message: "File data and file name are required" });
      }

      // Get the form to find the townId
      const form = await storage.getTownFormById(req.params.id);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      // Check if this is the first PDF upload for this town (Pioneer badge)
      // If ANY form for this town already has fileData, it's not the first upload
      const townForms = await storage.getTownForms(form.townId);
      const hasExistingPdfs = townForms.some(f => f.fileData);
      let badge = null;

      // Update the form with the uploaded PDF
      const updatedForm = await storage.updateTownForm(req.params.id, {
        fileData,
        fileName,
        fileType,
        uploadedBy: userId,
      });

      // Award Pioneer badge if this is the first PDF for this town
      if (!hasExistingPdfs) {
        const town = await storage.getTownById(form.townId);
        if (town) {
          // Check if user already has a pioneer badge for this town
          const existingBadge = await storage.getUserBadgeByType(userId, 'pioneer', form.townId);
          if (!existingBadge) {
            await storage.createBadge({
              userId,
              badgeType: 'pioneer',
              townId: form.townId,
              tier: 'gold',
            });
            badge = { townName: town.townName, state: town.state };
          }
        }
      }

      res.json({ form: updatedForm, badge });
    } catch (error) {
      console.error("Error uploading PDF:", error);
      res.status(500).json({ message: "Failed to upload PDF" });
    }
  });

  // Admin: Create town form
  app.post("/api/admin/towns/:townId/forms", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parsed = insertTownFormSchema.safeParse({
        ...req.body,
        townId: req.params.townId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const form = await storage.createTownForm(parsed.data);
      res.status(201).json(form);
    } catch (error) {
      console.error("Error creating town form:", error);
      res.status(500).json({ message: "Failed to create town form" });
    }
  });

  // Admin: Update town form
  app.patch("/api/admin/town-forms/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const form = await storage.updateTownForm(req.params.id, req.body);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }
      res.json(form);
    } catch (error) {
      console.error("Error updating town form:", error);
      res.status(500).json({ message: "Failed to update town form" });
    }
  });

  // Admin: Delete town form
  app.delete("/api/admin/town-forms/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteTownForm(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting town form:", error);
      res.status(500).json({ message: "Failed to delete town form" });
    }
  });

  // ========== Town Requests (Pioneer submissions for new towns) ==========

  // Submit a request for a new town (any authenticated user)
  app.post("/api/town-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = insertTownRequestSchema.safeParse({
        ...req.body,
        userId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const request = await storage.createTownRequest(parsed.data);
      
      // Auto-trigger AI research for the new town request
      try {
        const researchJob = await townResearchService.triggerResearchForRequest(request.id);
        console.log(`[TownRequest] Auto-triggered research job ${researchJob.id} for town request ${request.id}`);
      } catch (researchError) {
        console.error("[TownRequest] Failed to trigger auto-research:", researchError);
      }
      
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating town request:", error);
      res.status(500).json({ message: "Failed to submit town request" });
    }
  });

  // Admin: Get all town requests
  app.get("/api/admin/town-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getTownRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching town requests:", error);
      res.status(500).json({ message: "Failed to fetch town requests" });
    }
  });

  // Admin: Update town request status (approve/deny)
  app.patch("/api/admin/town-requests/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status } = req.body;
      const reviewedBy = req.user.claims.sub;
      const updated = await storage.updateTownRequestStatus(req.params.id, status, reviewedBy);
      if (!updated) {
        return res.status(404).json({ message: "Request not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating town request:", error);
      res.status(500).json({ message: "Failed to update town request" });
    }
  });

  // ========== Research Jobs (AI-powered town research) ==========

  // Admin: Manually trigger research for a town request
  app.post("/api/admin/town-requests/:id/research", isAuthenticated, isAdmin, researchRateLimiter, async (req, res) => {
    try {
      const townRequestId = req.params.id;
      const townRequest = await storage.getTownRequest(townRequestId);
      
      if (!townRequest) {
        return res.status(404).json({ message: "Town request not found" });
      }

      // Check if there's already an active research job
      const existingJob = await storage.getResearchJobByTownRequest(townRequestId);
      if (existingJob && existingJob.status !== "failed") {
        return res.status(400).json({ 
          message: "Research already in progress or completed", 
          job: existingJob 
        });
      }

      const researchJob = await townResearchService.triggerResearchForRequest(townRequestId);
      res.status(201).json({ 
        message: "Research job started", 
        job: researchJob 
      });
    } catch (error) {
      console.error("Error triggering research:", error);
      res.status(500).json({ message: "Failed to trigger research" });
    }
  });

  // Admin: Get research job status for a town request
  app.get("/api/admin/town-requests/:id/research", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const researchJob = await storage.getResearchJobByTownRequest(req.params.id);
      if (!researchJob) {
        return res.status(404).json({ message: "No research job found" });
      }
      res.json(researchJob);
    } catch (error) {
      console.error("Error fetching research job:", error);
      res.status(500).json({ message: "Failed to fetch research job" });
    }
  });

  // Admin: Get all pending research jobs
  app.get("/api/admin/research-jobs/pending", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const jobs = await storage.getPendingResearchJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching pending research jobs:", error);
      res.status(500).json({ message: "Failed to fetch pending research jobs" });
    }
  });

  // Admin: Download PDF for an existing form (if it has an external URL but no file data)
  app.post("/api/admin/town-forms/:id/download-pdf", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const form = await storage.getTownFormById(req.params.id);
      if (!form) {
        return res.status(404).json({ message: "Form not found" });
      }

      if (!form.externalUrl) {
        return res.status(400).json({ message: "Form has no external URL to download from" });
      }

      console.log(`[Admin] Downloading PDF for form ${form.id} from ${form.externalUrl}`);
      
      const response = await fetch(form.externalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PermitPilot/1.0)',
          'Accept': 'application/pdf,*/*',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        return res.status(502).json({ message: `Failed to download: ${response.status} ${response.statusText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const fileName = form.externalUrl.split('/').pop() || 'form.pdf';

      await storage.updateTownForm(form.id, {
        fileData: base64,
        fileName,
        fileType: 'application/pdf',
      });

      res.json({ 
        message: "PDF downloaded successfully", 
        fileName,
        sizeKB: Math.round(arrayBuffer.byteLength / 1024)
      });
    } catch (error) {
      console.error("Error downloading PDF:", error);
      res.status(500).json({ message: "Failed to download PDF" });
    }
  });

  // ============================================
  // Data Vault & Submission Job Endpoints
  // ============================================

  // Sync parsed data to vault
  app.post("/api/vault/sync/:profileId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getProfile(req.params.profileId);
      
      if (!profile || profile.userId !== userId) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const vault = await syncParsedDataToVault(req.params.profileId);
      if (!vault) {
        return res.status(400).json({ message: "No parsed data to sync" });
      }

      res.json(vault);
    } catch (error) {
      console.error("Error syncing to vault:", error);
      res.status(500).json({ message: "Failed to sync data to vault" });
    }
  });

  // Get user's vault
  app.get("/api/vault", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const profileId = req.query.profileId as string | undefined;
      let vault;
      if (profileId) {
        vault = await storage.getDataVaultByProfileId(profileId);
        if (vault && vault.userId !== userId) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else {
        vault = await storage.getDataVaultByUserId(userId);
      }
      
      if (!vault) {
        return res.status(404).json({ message: "No vault found" });
      }

      const completeness = await getVaultCompleteness(vault.id);
      res.json({ ...vault, completeness });
    } catch (error) {
      console.error("Error fetching vault:", error);
      res.status(500).json({ message: "Failed to fetch vault" });
    }
  });

  // Patch a single vault field by key (for manual entry on profile page)
  app.patch("/api/vault/field", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { field, value } = req.body as { field: string; value: string };
      if (!field || typeof value !== "string") {
        return res.status(400).json({ message: "field and value are required" });
      }
      const vault = await storage.getDataVaultByUserId(userId);
      if (!vault) {
        return res.status(404).json({ message: "No vault found" });
      }
      const updated = await storage.updateDataVault(vault.id, { [field]: value } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error updating vault field:", error);
      res.status(500).json({ message: "Failed to update vault field" });
    }
  });

  // Get vault completeness score
  app.get("/api/vault/:id/completeness", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const vault = await storage.getDataVault(req.params.id);
      
      if (!vault) {
        return res.status(404).json({ message: "Vault not found" });
      }
      
      if (vault.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const completeness = await getVaultCompleteness(req.params.id);
      res.json(completeness);
    } catch (error) {
      console.error("Error calculating completeness:", error);
      res.status(500).json({ message: "Failed to calculate completeness" });
    }
  });

  // Get vault data formatted for PDF filling
  app.get("/api/vault/:id/pdf-fields", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const vault = await storage.getDataVault(req.params.id);
      
      if (!vault) {
        return res.status(404).json({ message: "Vault not found" });
      }

      if (vault.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const fieldData = getVaultDataForPdfFill(vault);
      res.json(fieldData);
    } catch (error) {
      console.error("Error getting PDF fields:", error);
      res.status(500).json({ message: "Failed to get PDF field data" });
    }
  });

  // Create a PDF fill submission job
  app.post("/api/submissions/pdf-fill", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const validation = pdfFillSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { permitId, townId, vaultId, pdfBase64, pdfFilename } = validation.data;

      const vault = await storage.getDataVault(vaultId);
      if (!vault || vault.userId !== userId) {
        return res.status(403).json({ message: "Vault not found or access denied" });
      }

      const job = await createPdfFillJob(
        userId,
        permitId,
        townId,
        vaultId,
        pdfBase64,
        pdfFilename || "permit_application.pdf"
      );

      if (!job) {
        return res.status(400).json({ message: "Failed to create fill job" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error creating PDF fill job:", error);
      res.status(500).json({ message: "Failed to create PDF fill job" });
    }
  });

  // Start auto PDF fill using town's configured form
  app.post("/api/submissions/auto-fill", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const validation = autoFillSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { permitId, townId, vaultId } = validation.data;

      const vault = await storage.getDataVault(vaultId);
      if (!vault || vault.userId !== userId) {
        return res.status(403).json({ message: "Vault not found or access denied" });
      }

      const result = await startAutoPdfFill(userId, permitId, townId, vaultId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ jobId: result.jobId });
    } catch (error) {
      console.error("Error starting auto PDF fill:", error);
      res.status(500).json({ message: "Failed to start auto PDF fill" });
    }
  });

  // Poll Datalab job status
  app.get("/api/submissions/:jobId/poll", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const existingJob = await storage.getSubmissionJob(req.params.jobId);
      
      if (!existingJob) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (existingJob.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const job = await pollDatalabJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error polling job:", error);
      res.status(500).json({ message: "Failed to poll job status" });
    }
  });

  // Get user's submission jobs
  app.get("/api/submissions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const jobs = await storage.getSubmissionJobsByUser(userId);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // Get submission job by ID
  app.get("/api/submissions/:jobId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error fetching submission:", error);
      res.status(500).json({ message: "Failed to fetch submission" });
    }
  });

  // Get filled PDF data for download/preview
  app.get("/api/submissions/:jobId/pdf", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!job.filledPdfData) {
        return res.status(400).json({ message: "No filled PDF available" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="filled_permit.pdf"');
      res.send(Buffer.from(job.filledPdfData, "base64"));
    } catch (error) {
      console.error("Error fetching PDF:", error);
      res.status(500).json({ message: "Failed to fetch PDF" });
    }
  });

  // Approve and submit a job
  app.post("/api/submissions/:jobId/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await approveAndSubmit(req.params.jobId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Submission approved successfully" });
    } catch (error) {
      console.error("Error approving submission:", error);
      res.status(500).json({ message: "Failed to approve submission" });
    }
  });

  // GET /api/portal-credentials?townId= — check if credentials exist for this user+town
  app.get("/api/portal-credentials", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { townId } = req.query as { townId?: string };
      if (!townId) return res.status(400).json({ message: "townId is required" });
      const [cred] = await db
        .select({ id: portalCredentials.id })
        .from(portalCredentials)
        .where(and(eq(portalCredentials.userId, userId), eq(portalCredentials.townId, townId)))
        .limit(1);
      res.json({ exists: !!cred, credentialId: cred?.id || null });
    } catch (error) {
      console.error("Error checking portal credentials:", error);
      res.status(500).json({ message: "Failed to check credentials" });
    }
  });

  // Store portal credentials (encrypted)
  app.post("/api/portal-credentials", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      
      if (!isEncryptionConfigured()) {
        return res.status(503).json({ message: "Credential storage is not configured on this server" });
      }
      
      const validation = portalCredentialsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { townId, username, password } = validation.data;

      const credential = await storePortalCredentials(userId, townId, username, password);
      res.json({ id: credential.id, townId: credential.townId });
    } catch (error) {
      console.error("Error storing credentials:", error);
      res.status(500).json({ message: "Failed to store credentials" });
    }
  });

  // Create portal automation job
  app.post("/api/submissions/portal-automation", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const validation = portalAutomationSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { permitId, townId, vaultId, credentialId } = validation.data;

      const vault = await storage.getDataVault(vaultId);
      if (!vault || vault.userId !== userId) {
        return res.status(403).json({ message: "Vault not found or access denied" });
      }

      const credential = await storage.getPortalCredential(credentialId);
      if (!credential || credential.userId !== userId) {
        return res.status(403).json({ message: "Credential not found or access denied" });
      }

      const job = await createPortalAutomationJob(
        userId,
        permitId || "",
        townId,
        vaultId,
        credentialId
      );

      if (!job) {
        return res.status(400).json({ message: "Failed to create automation job" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error creating automation job:", error);
      res.status(500).json({ message: "Failed to create automation job" });
    }
  });

  // Execute portal automation
  app.post("/api/submissions/:jobId/execute", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await executePortalAutomation(req.params.jobId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Automation executed successfully" });
    } catch (error) {
      console.error("Error executing automation:", error);
      res.status(500).json({ message: "Failed to execute automation" });
    }
  });

  // Form-level portal submission (V1 - SeamlessDocs, OpenGov, ViewPoint)
  app.post("/api/towns/:townId/forms/:formId/portal-submit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { townId, formId } = req.params;
      const { profileId, permitId, eventData, userAnswers, submitForm } = req.body;

      if (!profileId) {
        return res.status(400).json({ message: "Profile ID is required" });
      }

      // Verify profile belongs to user
      const profile = await storage.getProfile(profileId);
      if (!profile || profile.userId !== userId) {
        return res.status(403).json({ message: "Profile not found or access denied" });
      }

      // Verify form exists and has portal URL
      const form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found" });
      }

      if (!isPortalForm(form)) {
        return res.status(400).json({ message: "This form does not support portal automation" });
      }

      console.log(`[Portal Submit] Starting portal automation for form ${formId}, profile ${profileId}`);

      // Execute portal automation
      const result = await executeFormPortalSubmission({
        profileId,
        formId,
        permitId: permitId || "",
        eventData,
        userAnswers,
        submitForm: submitForm === true,
      });

      if (!result.success) {
        console.error(`[Portal Submit] Automation failed: ${result.error}`);
        return res.status(400).json({ 
          message: result.error || "Portal automation failed",
          navigationLog: result.navigationLog,
        });
      }

      console.log(`[Portal Submit] Automation completed. Filled ${result.filledFields.length} fields.`);

      res.json({
        success: true,
        portalUrl: result.portalUrl,
        filledFields: result.filledFields,
        formStatus: result.formStatus,
        screenshotBase64: result.screenshotBase64,
        navigationLog: result.navigationLog,
        provider: detectPortalProvider(result.portalUrl),
      });
    } catch (error) {
      console.error("Error in portal submission:", error);
      res.status(500).json({ message: "Failed to execute portal submission" });
    }
  });

  // Check if a form supports portal automation
  app.get("/api/towns/:townId/forms/:formId/portal-info", isAuthenticated, async (req, res) => {
    try {
      const { townId, formId } = req.params;

      const form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found" });
      }

      const isPortal = isPortalForm(form);
      const portalUrl = form.externalUrl || form.sourceUrl || "";

      res.json({
        isPortalForm: isPortal,
        portalUrl: isPortal ? portalUrl : null,
        provider: isPortal ? detectPortalProvider(portalUrl) : null,
      });
    } catch (error) {
      console.error("Error checking portal info:", error);
      res.status(500).json({ message: "Failed to check portal info" });
    }
  });

  app.post("/api/towns/:townId/forms/:formId/generate-mappings", isAuthenticated, async (req: any, res) => {
    try {
      const { townId, formId } = req.params;

      const form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found" });
      }

      if (!form.fileData) {
        return res.status(400).json({ message: "Form has no PDF data stored. Upload or fetch the PDF first." });
      }

      const mappings = await generateFieldMappingsFromNonFillablePDF(form.fileData, formId);
      res.json({
        success: true,
        mappings,
        fieldCount: Object.keys(mappings).length,
      });
    } catch (error) {
      console.error("Error generating field mappings:", error);
      const message = error instanceof Error ? error.message : "Failed to generate field mappings";
      res.status(500).json({ message });
    }
  });

  // ── CT Food Truck Directory ──────────────────────────────────────────────

  // GET /api/directory — list all trucks, optional ?cuisine= and ?town= filters
  app.get("/api/directory", async (req, res) => {
    try {
      const { cuisine, town } = req.query as { cuisine?: string; town?: string };
      let query = db.select().from(foodTrucks);
      const rows = await query;
      const filtered = rows.filter((t) => {
        if (cuisine && t.cuisine?.toLowerCase() !== cuisine.toLowerCase()) return false;
        if (town && !t.towns?.some((tw) => tw.toLowerCase().includes(town.toLowerCase()))) return false;
        return true;
      });
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching directory:", error);
      res.status(500).json({ message: "Failed to fetch directory" });
    }
  });

  // GET /api/directory/:slug — single truck
  app.get("/api/directory/:slug", async (req, res) => {
    try {
      const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, req.params.slug));
      if (!truck) return res.status(404).json({ message: "Truck not found" });
      res.json(truck);
    } catch (error) {
      console.error("Error fetching truck:", error);
      res.status(500).json({ message: "Failed to fetch truck" });
    }
  });

  // POST /api/directory/claim — claim a listing (requires auth)
  app.post("/api/directory/claim", isAuthenticated, async (req: any, res) => {
    try {
      const { slug } = req.body as { slug: string };
      if (!slug) return res.status(400).json({ message: "slug is required" });
      const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, slug));
      if (!truck) return res.status(404).json({ message: "Truck not found" });
      if (truck.status === "claimed") return res.status(409).json({ message: "Listing already claimed" });
      await db.update(foodTrucks).set({ status: "claimed" }).where(eq(foodTrucks.slug, slug));
      res.json({ success: true, message: "Listing claimed successfully" });
    } catch (error) {
      console.error("Error claiming truck:", error);
      res.status(500).json({ message: "Failed to claim listing" });
    }
  });

  // GET /api/directory/:slug/badges — public: return earned badge types for a claimed truck
  app.get("/api/directory/:slug/badges", async (req, res) => {
    try {
      const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, req.params.slug));
      if (!truck || !truck.claimedByUserId) return res.json([]);
      const badges = await storage.getBadges(truck.claimedByUserId);
      const publicTypes = ["pioneer", "health_inspection", "verified_operator", "multi_town", "first_permit", "explorer"];
      res.json(badges.filter(b => publicTypes.includes(b.badgeType)).map(b => b.badgeType));
    } catch (err) {
      console.error("Error fetching public badges:", err);
      res.json([]);
    }
  });

  // POST /api/directory/:slug/claim-authenticated — claim listing, create profile, sync vault
  app.post("/api/directory/:slug/claim-authenticated", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { slug } = req.params;
      const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, slug));
      if (!truck) return res.status(404).json({ message: "Truck not found" });
      if (truck.status === "claimed") return res.status(409).json({ message: "Listing already claimed" });

      // Mark truck as claimed
      await db.update(foodTrucks).set({
        status: "claimed",
        claimedByUserId: userId,
        claimedAt: new Date(),
      }).where(eq(foodTrucks.slug, slug));

      // Create vehicle profile from truck data
      const profile = await storage.createProfile({
        userId,
        vehicleType: "truck",
        vehicleName: truck.name,
        menuType: truck.cuisine ?? undefined,
      } as any);

      // Sync profile to vault (gets vehicleName/cuisine at minimum)
      const vault = await syncProfileToVault(userId, profile.id);

      // Seed extra fields directly into vault
      if (vault && (truck.email || truck.description)) {
        await storage.updateDataVault(vault.id, {
          ...(truck.email && { email: truck.email }),
          ...(truck.name && { businessName: truck.name }),
        } as any);
      }

      res.json({ success: true, profileId: profile.id, truckData: truck });
    } catch (error) {
      console.error("Error claiming truck (authenticated):", error);
      res.status(500).json({ message: "Failed to claim listing" });
    }
  });

  // PATCH /api/directory/:slug — owner or admin: update food_truck fields
  app.patch("/api/directory/:slug", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { slug } = req.params;
      const [existing] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, slug)).limit(1);
      if (!existing) return res.status(404).json({ message: "Truck not found" });

      // Check access: must be the truck's owner or a site admin
      const userRole = await storage.getUserRole(userId);
      const isAdminUser = userRole === "admin" || userRole === "owner";
      const isTruckOwner = existing.claimedByUserId === userId;
      if (!isAdminUser && !isTruckOwner) return res.status(403).json({ message: "Forbidden" });

      // Strip immutable fields; admins can also set status
      const { id: _id, slug: _slug, createdAt: _ca, claimedByUserId: _cu, claimedAt: _cat, ...safeBody } = req.body as any;
      if (!isAdminUser) delete safeBody.status;

      const [updated] = await db.update(foodTrucks).set(safeBody).where(eq(foodTrucks.slug, slug)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/map-pins — public: merged live + home-base pins
  app.get("/api/map-pins", async (_req, res) => {
    try {
      const livePins = await db
        .select()
        .from(publicProfiles)
        .where(and(eq(publicProfiles.isPublic, true), isNotNull(publicProfiles.locationLat), isNotNull(publicProfiles.locationLng)));

      const homeTrucks = await db
        .select()
        .from(foodTrucks)
        .where(and(isNotNull(foodTrucks.homeLat), isNotNull(foodTrucks.homeLng)));

      const liveUserIds = new Set(livePins.map((p) => p.userId).filter(Boolean));
      const liveNames = new Set(livePins.map((p) => (p.businessName || "").toLowerCase()).filter(Boolean));

      const pins: any[] = livePins.map((p) => ({
        id: p.id,
        name: p.businessName || "Food Truck",
        lat: p.locationLat,
        lng: p.locationLng,
        locationType: "live",
        cuisine: (p as any).cuisineType ?? null,
        website: p.website ?? null,
        phone: p.phoneNumber ?? null,
        instagramHandle: (p as any).instagramHandle ?? null,
        tiktokHandle: null,
        slug: null,
        description: p.description ?? null,
        isVerified: (p as any).isVerified ?? false,
      }));

      for (const truck of homeTrucks) {
        const alreadyLive =
          (truck.claimedByUserId && liveUserIds.has(truck.claimedByUserId)) ||
          liveNames.has(truck.name.toLowerCase());
        if (!alreadyLive) {
          pins.push({
            id: `truck-${truck.id}`,
            name: truck.name,
            lat: truck.homeLat,
            lng: truck.homeLng,
            locationType: "home_base",
            cuisine: truck.cuisine ?? null,
            website: truck.website ?? null,
            phone: truck.phone ?? null,
            instagramHandle: truck.instagramHandle ?? null,
            tiktokHandle: (truck as any).tiktokHandle ?? null,
            slug: truck.slug,
            description: truck.description ?? null,
            isVerified: false,
          });
        }
      }

      res.json(pins);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/admin/crawler/stats — admin: crawler coverage stats
  app.get("/api/admin/crawler/stats", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [{ count: totalTownsRaw }] = await db.select({ count: sqlCount() }).from(towns);
      const totalTowns = Number(totalTownsRaw);

      const allForms = await db
        .select({ townId: townForms.townId, createdAt: townForms.createdAt })
        .from(townForms);

      const townIdsWithForms = new Set(allForms.map((f) => f.townId));
      const townsWithForms = townIdsWithForms.size;

      const [{ count: totalFormsRaw }] = await db.select({ count: sqlCount() }).from(townForms);
      const totalFormsDiscovered = Number(totalFormsRaw);

      // Recent crawls with town names — fetch last 200, then group by town
      const recentRows = await db
        .select({ townId: townForms.townId, townName: towns.townName, createdAt: townForms.createdAt })
        .from(townForms)
        .leftJoin(towns, eq(townForms.townId, towns.id))
        .orderBy(desc(townForms.createdAt))
        .limit(200);

      const grouped: Record<string, { townId: string; townName: string | null; formsFound: number; crawledAt: Date | null }> = {};
      for (const row of recentRows) {
        if (!grouped[row.townId]) {
          grouped[row.townId] = { townId: row.townId, townName: row.townName, formsFound: 0, crawledAt: row.createdAt };
        }
        grouped[row.townId].formsFound++;
      }

      const recentCrawls = Object.values(grouped)
        .sort((a, b) => (b.crawledAt?.getTime() ?? 0) - (a.crawledAt?.getTime() ?? 0))
        .slice(0, 20);

      res.json({ totalTowns, townsWithForms, townsWithoutForms: totalTowns - townsWithForms, totalFormsDiscovered, recentCrawls });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/discover-trucks — async background run
  app.post("/api/admin/discover-trucks", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { maxNew = 50, source = "all", targetTown } = req.body ?? {};

      if (source === "all" && !targetTown) {
        const lastRun = await getLastRunTime();
        if (lastRun) {
          const elapsedMs = Date.now() - lastRun.getTime();
          if (elapsedMs < 60 * 60 * 1000) {
            const waitMinutes = Math.ceil((60 * 60 * 1000 - elapsedMs) / 60000);
            return res.status(429).json({
              message: `Discovery cooldown active. Next run available in ${waitMinutes} minute(s).`,
            });
          }
        }
      }

      res.json({ message: "Discovery started", status: "running" });

      const capMax = Math.min(Number(maxNew) || 50, 200);
      const town = targetTown || undefined;
      if (source === "all") {
        discoverNewTrucks(capMax, town).catch((err) =>
          console.error("[Discovery] Background run error:", err),
        );
      } else {
        discoverFromSource(source as "duckduckgo" | "yelp" | "directories", capMax, town).catch(
          (err) => console.error("[Discovery] Background run error:", err),
        );
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/discover-trucks/run-sync — waits for result (used by admin UI)
  app.post("/api/admin/discover-trucks/run-sync", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { maxNew = 50, source = "all", targetTown } = req.body ?? {};
      const capMax = Math.min(Number(maxNew) || 50, 200);
      const town = targetTown || undefined;

      const summary =
        source === "all"
          ? await discoverNewTrucks(capMax, town)
          : await discoverFromSource(source as "duckduckgo" | "yelp" | "directories", capMax, town);

      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/admin/discover-trucks/preview — stats for the discovery panel
  app.get("/api/admin/discover-trucks/preview", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [{ count: totalRaw }] = await db
        .select({ count: sqlCount() })
        .from(foodTrucks);
      const total = Number(totalRaw);

      const [{ count: unclaimedRaw }] = await db
        .select({ count: sqlCount() })
        .from(foodTrucks)
        .where(eq(foodTrucks.status, "unclaimed"));

      const [{ count: autoRaw }] = await db
        .select({ count: sqlCount() })
        .from(foodTrucks)
        .where(eq(foodTrucks.source, "auto_discovered"));

      const lastRun = await getLastRunTime();

      res.json({
        totalTrucks: total,
        unclaimed: Number(unclaimedRaw),
        autoDiscovered: Number(autoRaw),
        manual: total - Number(autoRaw),
        lastDiscoveryRun: lastRun ? lastRun.toISOString() : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/enrich-trucks — run enrichment on all trucks with websites
  app.post("/api/admin/enrich-trucks", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const results = await enrichAllTrucks();
      const fieldCounts: Record<string, number> = {};
      for (const r of results) {
        for (const f of r.fields) {
          fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;
        }
      }
      res.json({ trucksUpdated: results.length, fieldCounts, results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/enrich-trucks/:slug — enrich a single truck
  app.post("/api/admin/enrich-trucks/:slug", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const result = await enrichTruckFromWebsite(req.params.slug);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/import-trucks
  // Accepts either:
  //   { text: string }  — one entry per line: "Name | https://url.com | Town"
  //   { rows: Array<{ name, website?, town? }> }  — pre-parsed rows (from CSV upload)
  app.post("/api/admin/import-trucks", isAuthenticated, isAdmin, async (req, res) => {
    const { text, rows: rawRows } = req.body ?? {};

    // Normalise input into a unified row shape
    type InputRow = { name: string; website: string | null; town: string | null; cuisine: string | null };
    let inputRows: InputRow[] = [];

    if (Array.isArray(rawRows)) {
      // Structured rows from CSV parse on the client
      inputRows = rawRows.map((r: any) => ({
        name: String(r.name ?? "").replace(/['"]/g, "").trim(),
        website: r.website ? String(r.website).trim() : null,
        town: r.town ? String(r.town).trim() : null,
        cuisine: r.cuisine ? String(r.cuisine).trim() : null,
      }));
    } else if (text && typeof text === "string") {
      // Plain text — each line: "Name | https://url | Town"
      for (const line of text.split("\n").map((l: string) => l.trim()).filter(Boolean)) {
        const parts = line.split("|").map((s: string) => s.trim());
        let name = "", website: string | null = null, town: string | null = null;

        if (parts.length >= 3) {
          // Name | URL | Town  OR  URL | Name | Town
          if (parts[0].startsWith("http")) { website = parts[0]; name = parts[1]; town = parts[2]; }
          else { name = parts[0]; website = parts[1] || null; town = parts[2]; }
        } else if (parts.length === 2) {
          if (parts[0].startsWith("http")) { website = parts[0]; name = parts[1]; }
          else { name = parts[0]; website = parts[1] || null; }
        } else if (line.startsWith("http")) {
          website = line;
          try {
            const hostname = new URL(line).hostname.replace(/^www\./, "");
            name = hostname.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          } catch { name = line; }
        } else {
          name = line;
        }

        inputRows.push({ name: name.replace(/['"]/g, "").trim(), website, town });
      }
    } else {
      return res.status(400).json({ message: "Provide either text or rows" });
    }

    const results: Array<{ name: string; slug: string; status: "added" | "duplicate" | "error"; enriched: string[]; error?: string }> = [];
    let added = 0, duplicates = 0, errors = 0;

    for (const row of inputRows) {
      let { name, website, town, cuisine } = row;
      if (!name || name.length < 2) continue;

      // If URL-only entry, fetch page <title> as name
      if (website && name.length < 3) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch(website, { signal: ctrl.signal, headers: { "User-Agent": "PermitPilot/1.0" } });
          clearTimeout(t);
          const html = await r.text();
          const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (m) name = m[1].replace(/\s*[-|–].*$/, "").trim().slice(0, 80);
        } catch { /* keep domain name */ }
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);

      // Dedup by slug
      const bySlug = await db.select({ id: foodTrucks.id }).from(foodTrucks).where(eq(foodTrucks.slug, slug)).limit(1);
      if (bySlug.length > 0) { results.push({ name, slug, status: "duplicate", enriched: [] }); duplicates++; continue; }

      // Dedup by name fuzzy
      const byName = await db.select({ id: foodTrucks.id }).from(foodTrucks)
        .where(sql`LOWER(name) LIKE LOWER(${"%" + name + "%"})`).limit(1);
      if (byName.length > 0) { results.push({ name, slug, status: "duplicate", enriched: [] }); duplicates++; continue; }

      // Unique slug
      let finalSlug = slug, attempt = 1;
      while (true) {
        const check = await db.select({ id: foodTrucks.id }).from(foodTrucks).where(eq(foodTrucks.slug, finalSlug)).limit(1);
        if (check.length === 0) break;
        finalSlug = `${slug}-${++attempt}`;
      }

      try {
        await db.insert(foodTrucks).values({
          slug: finalSlug,
          name,
          website: website || null,
          towns: town ? [town] : null,
          cuisine: cuisine || null,
          status: "unclaimed",
          outreachSent: false,
          source: "manual_import",
        }).onConflictDoNothing();

        // Fire enrichment in background — don't block the response
        if (website) {
          enrichTruckFromWebsite(finalSlug).catch(() => { /* best-effort */ });
        }

        results.push({ name, slug: finalSlug, status: "added", enriched: [] });
        added++;
      } catch (err: any) {
        console.error('[Import] Failed to insert truck:', row.name, err.message);
        errors++;
        results.push({ name, slug: finalSlug, status: "error", enriched: [], error: err.message });
      }
    }

    res.json({ added, duplicates, errors, trucks: results });
  });

  /*
    SENDGRID INBOUND PARSE SETUP:
    1. Go to SendGrid → Settings → Inbound Parse
    2. Add Host: mail.permitpilot.cloud
    3. Add Destination URL: https://permitpilot.cloud/api/email/inbound
    4. Check "POST the raw, full MIME message"
    5. In GoDaddy DNS for permitpilot.cloud, add MX record:
       Type: MX, Name: mail, Value: mx.sendgrid.net, Priority: 10
    6. Replies to outreach emails sent from hello@permitpilot.cloud
       will now route through this webhook automatically
  */
  // PUBLIC — no auth (SendGrid requires a fast 200 response)
  app.post("/api/email/inbound", multerMemory.any(), async (req, res) => {
    try {
      // SendGrid posts as multipart/form-data — multer parses it into req.body
      const body = req.body as Record<string, any>;

      const from: string = body.from || body.sender || "";
      const to: string = body.to || body.recipient || "";
      const subject: string = body.subject || "";
      const bodyText: string = body.text || body.body || "";
      const bodyHtml: string = body.html || "";
      const headers: string = body.headers || "";
      const rawPayload = JSON.stringify(body).slice(0, 10000);

      // Extract Message-ID from headers to prevent duplicate processing
      let messageId: string | null = null;
      const messageIdMatch = headers.match(/Message-ID:\s*<([^>]+)>/i);
      if (messageIdMatch) messageId = messageIdMatch[1];
      // Fallback: use SendGrid's envelope or a hash of from+subject+body
      if (!messageId) messageId = body.envelope ? `sg-${Buffer.from(body.envelope).toString('base64').slice(0, 32)}` : null;
      if (!messageId) messageId = `sg-${Buffer.from(`${from}|${subject}|${bodyText.slice(0,100)}`).toString('base64').slice(0, 32)}`;

      // Deduplicate — if we've seen this messageId, return 200 immediately
      const existing = await db.select({ id: inboundEmails.id })
        .from(inboundEmails)
        .where(eq(inboundEmails.messageId, messageId))
        .limit(1);

      if (existing.length > 0) {
        return res.status(200).send("duplicate");
      }

      // Save raw email
      const [saved] = await db.insert(inboundEmails).values({
        messageId,
        from,
        to,
        subject,
        bodyText: bodyText.slice(0, 50000),
        bodyHtml: bodyHtml.slice(0, 50000),
        rawPayload,
      }).returning();

      // Fire-and-forget — process async so SendGrid gets 200 immediately
      if (saved?.id) {
        processInboundEmail(saved.id).catch(err =>
          console.error('[Orchestrator] async processInboundEmail failed:', err)
        );
      }

      res.status(200).send("ok");
    } catch (error) {
      console.error("[Inbound] webhook error:", error);
      res.status(200).send("error"); // Always 200 to prevent SendGrid retry storms
    }
  });

  // Admin: orchestrator stats
  app.get("/api/admin/orchestrator/stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [totalEmails] = await db.select({ count: sqlCount() }).from(inboundEmails);
      const [claimed] = await db.select({ count: sqlCount() }).from(inboundEmails)
        .where(eq(inboundEmails.intent, 'claim_listing'));
      const [permitInquiries] = await db.select({ count: sqlCount() }).from(inboundEmails)
        .where(eq(inboundEmails.intent, 'permit_inquiry'));
      const [optOuts] = await db.select({ count: sqlCount() }).from(inboundEmails)
        .where(eq(inboundEmails.intent, 'opt_out'));

      res.json({
        totalEmails: Number(totalEmails.count),
        claimed: Number(claimed.count),
        permitInquiries: Number(permitInquiries.count),
        optOuts: Number(optOuts.count),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin: recent inbound emails (paginated)
  app.get("/api/admin/orchestrator/emails", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query.page as string || '0'));
      const limit = 20;
      const emails = await db.select().from(inboundEmails)
        .orderBy(desc(inboundEmails.createdAt))
        .limit(limit)
        .offset(page * limit);
      res.json(emails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emails" });
    }
  });

  // Admin: agent logs (paginated)
  app.get("/api/admin/orchestrator/logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query.page as string || '0'));
      const limit = 20;
      const logs = await db.select().from(agentLogs)
        .orderBy(desc(agentLogs.createdAt))
        .limit(limit)
        .offset(page * limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  });

  // Admin: dry-run intent classifier (no emails sent)
  app.post("/api/admin/orchestrator/classify", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { subject, bodyText, from } = req.body as { subject?: string; bodyText?: string; from?: string };
      if (!bodyText && !subject) {
        return res.status(400).json({ message: "bodyText or subject required" });
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ message: "ANTHROPIC_API_KEY not configured" });
      }
      const result = await classifyEmailDryRun(subject || '', bodyText || '', from);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Classification failed" });
    }
  });

  return httpServer;
}
