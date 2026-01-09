import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
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
import { GoogleGenerativeAI, GenerateContentResult } from "@google/generative-ai";
import { 
  fillPdfForm, 
  appendDocumentsToPdf, 
  getAvailableTemplates, 
  getTemplateById,
  fillPdfFromDatabase,
  townFormToTemplate,
  type ParsedUserData 
} from "./lib/pdf-service";
import { townResearchService } from "./lib/town-research-service";
import { documentParseRateLimiter, researchRateLimiter } from "./lib/rate-limiter";
import { sanitizeHtml } from "./lib/sanitize";
import { syncParsedDataToVault, getVaultCompleteness, getVaultDataForPdfFill } from "./lib/vault-service";
import { createPdfFillJob, pollDatalabJob, startAutoPdfFill, fillPdfWithDatalab, checkDatalabResult } from "./lib/datalab-service";
import { storePortalCredentials, createPortalAutomationJob, executePortalAutomation, approveAndSubmit, isEncryptionConfigured, executeFormPortalSubmission, isPortalForm, detectPortalProvider } from "./lib/portal-automation-service";
import { validatePermitApplication, getRequiredFieldsForPermitType } from "./lib/validation-service";
import { PermitType } from "../shared/validation-rules";
import { z } from "zod";

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
  permitId: z.string().min(1, "Permit ID is required"),
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

// Save parsed data to profile
async function saveParsedDataToProfile(profileId: string, parsedData: Record<string, unknown>): Promise<void> {
  const profile = await storage.getProfile(profileId);
  if (profile) {
    const existingData = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object') 
      ? profile.parsedDataLog as Record<string, unknown>
      : {};
    
    const timestampedData = {
      ...parsedData,
      _parsedAt: new Date().toISOString()
    };
    
    const mergedData = { ...existingData, ...timestampedData };
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get("/api/profiles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
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

  // Multi-document parsing - analyzes ALL documents for a profile together
  app.post("/api/profiles/:id/parse-all-documents", isAuthenticated, documentParseRateLimiter, async (req: any, res) => {
    try {
      const { id } = req.params;
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

      // Prepare all document parts for multi-document analysis
      const documentParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
      const documentDescriptions: string[] = [];

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        if (!doc.type) continue;
        
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
        documentDescriptions.push(`Document ${i + 1}: ${doc.name || 'Unnamed'} (${doc.folder || 'Uncategorized'})`);
      }

      if (documentParts.length === 0) {
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

      // Save to profile
      await saveParsedDataToProfile(id, parsedData);

      res.json({ 
        success: true, 
        parsedData,
        documentsAnalyzed: documentParts.length,
        message: `Successfully analyzed ${documentParts.length} documents`
      });
    } catch (error: any) {
      console.error("Error parsing all documents:", error);
      res.status(500).json({ 
        message: "Failed to parse documents",
        error: error.message || "Unknown error"
      });
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

  // Edit a specific field in parsed data
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

      await storage.updateProfile(id, { parsedDataLog: parsedData });
      
      res.json({ success: true, message: "Field updated successfully" });
    } catch (error: any) {
      console.error("Error editing field:", error);
      res.status(500).json({ message: "Failed to edit field", error: error.message });
    }
  });

  app.get("/api/permits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      
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
  app.get("/api/towns/:townId/forms", isAuthenticated, async (req, res) => {
    try {
      const { townId } = req.params;
      const town = await storage.getTown(townId);
      if (!town) {
        return res.status(404).json({ message: "Town not found" });
      }

      const forms = await storage.getTownForms(townId);
      
      // Return full TownForm objects so frontend can access all properties
      res.json({
        townId,
        townName: town.townName,
        forms: forms,
        fillableForms: forms.filter(f => f.isFillable && f.fileData),
      });
    } catch (error) {
      console.error("Error fetching town forms:", error);
      res.status(500).json({ message: "Failed to fetch town forms" });
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
      const form = await storage.getTownFormById(formId);
      if (!form || form.townId !== townId) {
        return res.status(404).json({ message: "Form not found for this town" });
      }

      if (!form.fileData) {
        return res.status(400).json({ message: "Form has no PDF data stored. Please upload the PDF in admin." });
      }

      // Get the profile for user data
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const parsedData = profile.parsedDataLog as ParsedUserData | null;
      
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
        pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, aiMappings.fields, userAnswers);
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
          pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData);
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
                  pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData, geminiMappings);
                } else {
                  console.log("Gemini analysis returned no parseable JSON, falling back to heuristic");
                  pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData);
                }
              } else {
                console.log("No Gemini API key, falling back to heuristic matching");
                pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData);
              }
            } catch (geminiError) {
              console.error("Gemini fallback failed:", geminiError);
              pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData);
            }
          }
        } else {
          // Datalab returned success but no check URL - fall back
          if (!parsedData) {
            return res.status(400).json({ message: "Profile has no parsed data." });
          }
          pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData);
        }
      } else {
        // Use local field mapping
        if (!parsedData) {
          return res.status(400).json({ message: "Profile has no parsed data. Please analyze documents first." });
        }
        pdfBytes = await fillPdfFromDatabase(form, parsedData, eventData);
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
      const filename = `${town?.townName || 'permit'}_${form.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

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

      // Build available data from profile - include ALL extracted fields
      const availableData: Record<string, string> = {};
      
      // Contact info
      if (parsedData?.contact_info?.business_name?.value) availableData.business_name = parsedData.contact_info.business_name.value;
      if (parsedData?.contact_info?.applicant_name?.value) availableData.applicant_name = parsedData.contact_info.applicant_name.value;
      if (parsedData?.contact_info?.owner_name?.value) availableData.owner_name = parsedData.contact_info.owner_name.value;
      if (parsedData?.contact_info?.phone?.value) availableData.phone = parsedData.contact_info.phone.value;
      if (parsedData?.contact_info?.email?.value) availableData.email = parsedData.contact_info.email.value;
      if (parsedData?.contact_info?.mailing_address?.value) availableData.address = parsedData.contact_info.mailing_address.value;
      if (parsedData?.contact_info?.mailing_address?.value) availableData.mailing_address = parsedData.contact_info.mailing_address.value;
      
      // License info
      if (parsedData?.license_info?.license_number?.value) availableData.license_number = parsedData.license_info.license_number.value;
      if (parsedData?.license_info?.license_type?.value) availableData.license_type_profile = parsedData.license_info.license_type.value;
      if (parsedData?.license_info?.issuing_authority?.value) availableData.issuing_authority = parsedData.license_info.issuing_authority.value;
      if (parsedData?.license_info?.valid_from?.value) availableData.valid_from = parsedData.license_info.valid_from.value;
      if (parsedData?.license_info?.valid_through?.value) availableData.valid_through = parsedData.license_info.valid_through.value;
      if (parsedData?.license_info?.towns_covered?.value) availableData.towns_covered = parsedData.license_info.towns_covered.value;
      
      // Operations
      if (parsedData?.operations?.water_supply_type?.value) availableData.water_supply = parsedData.operations.water_supply_type.value;
      if (parsedData?.operations?.sanitizer_type?.value) availableData.sanitizer_type = parsedData.operations.sanitizer_type.value;
      if (parsedData?.operations?.sanitizing_method?.value) availableData.sanitizing_method = parsedData.operations.sanitizing_method.value;
      if (parsedData?.operations?.toilet_facilities?.value) availableData.toilet_facilities_profile = parsedData.operations.toilet_facilities.value;
      
      // Safety
      if (parsedData?.safety?.hot_holding_method?.value) availableData.hot_holding = parsedData.safety.hot_holding_method.value;
      if (parsedData?.safety?.cold_storage_method?.value) availableData.cold_storage = parsedData.safety.cold_storage_method.value;
      if (parsedData?.safety?.waste_water_disposal?.value) availableData.waste_water = parsedData.safety.waste_water_disposal.value;
      if (parsedData?.safety?.temperature_monitoring_method?.value) availableData.temp_monitoring = parsedData.safety.temperature_monitoring_method.value;
      
      // Menu & Prep
      if (parsedData?.menu_and_prep?.food_items_list?.value) availableData.menu_items = parsedData.menu_and_prep.food_items_list.value;
      if (parsedData?.menu_and_prep?.food_items_list?.value) availableData.food_items = parsedData.menu_and_prep.food_items_list.value;
      if (parsedData?.menu_and_prep?.prep_location?.value) availableData.prep_location = parsedData.menu_and_prep.prep_location.value;
      if (parsedData?.menu_and_prep?.prep_location?.value) availableData.commissary_address = parsedData.menu_and_prep.prep_location.value;
      if (parsedData?.menu_and_prep?.food_source_location?.value) availableData.food_sources = parsedData.menu_and_prep.food_source_location.value;
      
      // Commissary info
      if (parsedData?.commissary_info?.commissary_name?.value) availableData.commissary_name = parsedData.commissary_info.commissary_name.value;
      if (parsedData?.commissary_info?.commissary_address?.value) availableData.commissary_address = parsedData.commissary_info.commissary_address.value;
      
      // Vehicle info
      if (parsedData?.vehicle_info?.vin?.value) availableData.vin = parsedData.vehicle_info.vin.value;
      if (parsedData?.vehicle_info?.license_plate?.value) availableData.license_plate = parsedData.vehicle_info.license_plate.value;
      if (parsedData?.vehicle_info?.trailer_make?.value) availableData.vehicle_make = parsedData.vehicle_info.trailer_make.value;
      if (parsedData?.vehicle_info?.trailer_model?.value) availableData.vehicle_model = parsedData.vehicle_info.trailer_model.value;
      if (parsedData?.vehicle_info?.trailer_year?.value) availableData.vehicle_year = parsedData.vehicle_info.trailer_year.value;
      
      // Equipment info
      if (parsedData?.equipment_info?.handwash_setup?.value) availableData.handwash_setup = parsedData.equipment_info.handwash_setup.value;
      if (parsedData?.equipment_info?.refrigeration?.value) availableData.refrigeration = parsedData.equipment_info.refrigeration.value;
      if (parsedData?.equipment_info?.cooking_equipment?.value) availableData.cooking_equipment = parsedData.equipment_info.cooking_equipment.value;
      
      // Certifications
      if (parsedData?.certifications?.food_manager_cert?.value) availableData.food_manager_cert = parsedData.certifications.food_manager_cert.value;
      if (parsedData?.certifications?.cert_expiration?.value) availableData.cert_expiration = parsedData.certifications.cert_expiration.value;
      
      // Event data from permit
      if (eventData?.eventName) availableData.event_name = eventData.eventName;
      if (eventData?.eventAddress) availableData.event_location = eventData.eventAddress;
      if (eventData?.eventDates) availableData.event_dates = eventData.eventDates;
      if (eventData?.hoursOfOperation) availableData.hours_of_operation = eventData.hoursOfOperation;
      if (eventData?.personInCharge) availableData.person_in_charge = eventData.personInCharge;
      
      // Food truck defaults (industry knowledge)
      availableData.license_type = eventData?.licenseType || "temporary";
      availableData.toilet_facilities = parsedData?.operations?.toilet_facilities?.value || "portable";
      availableData.handwash_type = "temporary";
      availableData.foods_prepared_onsite = "yes";
      availableData.handwash_sketch_yes = "yes";
      
      console.log(`[Analyze] Available data keys: ${Object.keys(availableData).join(", ")}`);

      // Find unanswered questions
      const unansweredQuestions: Array<{
        fieldName: string;
        fieldType: "text" | "checkbox";
        label: string;
        dataKey: string | null;
        currentValue?: string;
      }> = [];

      for (const field of fields) {
        const needsInput = (field as any).needsUserInput;
        const hasData = field.dataKey && availableData[field.dataKey];
        
        // Include if: needs user input OR has no dataKey OR dataKey has no data
        if (field.fieldType === "text" && (needsInput || !field.dataKey || !hasData)) {
          // Skip if it's a common auto-filled field type - comprehensive list matching all profile data
          const autoFilledKeys = [
            // Contact info
            "business_name", "applicant_name", "owner_name", "phone", "email", "address", "mailing_address",
            // License info
            "license_number", "license_type", "license_type_profile", "issuing_authority", "valid_from", "valid_through", "towns_covered",
            // Operations
            "water_supply", "sanitizer_type", "sanitizing_method", "toilet_facilities", "toilet_facilities_profile",
            // Safety
            "hot_holding", "cold_storage", "waste_water", "temp_monitoring",
            // Menu & Prep
            "menu_items", "food_items", "prep_location", "food_sources", "commissary_address", "commissary_name",
            // Vehicle
            "vin", "license_plate", "vehicle_make", "vehicle_model", "vehicle_year",
            // Equipment
            "handwash_setup", "refrigeration", "cooking_equipment",
            // Certifications
            "food_manager_cert", "cert_expiration",
            // Event data
            "event_name", "event_location", "event_dates", "hours_of_operation", "person_in_charge",
            // Defaults
            "handwash_type", "foods_prepared_onsite", "handwash_sketch_yes"
          ];
          
          if (field.dataKey && autoFilledKeys.includes(field.dataKey) && hasData) {
            console.log(`[Analyze] Auto-filling field "${field.pdfFieldName}" with "${field.dataKey}"`);
            continue; // Skip - this will be auto-filled
          }
          
          unansweredQuestions.push({
            fieldName: field.pdfFieldName,
            fieldType: field.fieldType,
            label: field.label,
            dataKey: field.dataKey,
            currentValue: field.dataKey ? availableData[field.dataKey] : undefined,
          });
        }
      }

      res.json({
        formId,
        formName: form.name,
        totalFields: fields.length,
        answeredFields: fields.length - unansweredQuestions.length,
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      res.json({ role: role || "user" });
    } catch (error) {
      console.error("Error fetching user role:", error);
      res.status(500).json({ message: "Failed to fetch user role" });
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;

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

  // Get forms for a specific town
  app.get("/api/towns/:townId/forms", async (req, res) => {
    try {
      const forms = await storage.getTownForms(req.params.townId);
      res.json(forms);
    } catch (error) {
      console.error("Error fetching town forms:", error);
      res.status(500).json({ message: "Failed to fetch town forms" });
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
      const userId = req.user.claims.sub;
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
          'User-Agent': 'Mozilla/5.0 (compatible; PermitTruck/1.0)',
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
      const user = req.user as Express.User;
      const profile = await storage.getProfile(req.params.profileId);
      
      if (!profile || profile.userId !== user.id) {
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
      const user = req.user as Express.User;
      const vault = await storage.getDataVaultByUserId(user.id);
      
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

  // Get vault completeness score
  app.get("/api/vault/:id/completeness", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const vault = await storage.getDataVault(req.params.id);
      
      if (!vault) {
        return res.status(404).json({ message: "Vault not found" });
      }
      
      if (vault.userId !== user.id) {
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
      const user = req.user as Express.User;
      const vault = await storage.getDataVault(req.params.id);
      
      if (!vault) {
        return res.status(404).json({ message: "Vault not found" });
      }

      if (vault.userId !== user.id) {
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
      const user = req.user as Express.User;
      const validation = pdfFillSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { permitId, townId, vaultId, pdfBase64, pdfFilename } = validation.data;

      const vault = await storage.getDataVault(vaultId);
      if (!vault || vault.userId !== user.id) {
        return res.status(403).json({ message: "Vault not found or access denied" });
      }

      const job = await createPdfFillJob(
        user.id,
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
      const user = req.user as Express.User;
      const validation = autoFillSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { permitId, townId, vaultId } = validation.data;

      const vault = await storage.getDataVault(vaultId);
      if (!vault || vault.userId !== user.id) {
        return res.status(403).json({ message: "Vault not found or access denied" });
      }

      const result = await startAutoPdfFill(user.id, permitId, townId, vaultId);
      
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
      const user = req.user as Express.User;
      const existingJob = await storage.getSubmissionJob(req.params.jobId);
      
      if (!existingJob) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (existingJob.userId !== user.id) {
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
      const user = req.user as Express.User;
      const jobs = await storage.getSubmissionJobsByUser(user.id);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // Get submission job by ID
  app.get("/api/submissions/:jobId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== user.id) {
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
      const user = req.user as Express.User;
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== user.id) {
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
      const user = req.user as Express.User;
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== user.id) {
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

  // Store portal credentials (encrypted)
  app.post("/api/portal-credentials", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      
      if (!isEncryptionConfigured()) {
        return res.status(503).json({ message: "Credential storage is not configured on this server" });
      }
      
      const validation = portalCredentialsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { townId, username, password } = validation.data;

      const credential = await storePortalCredentials(user.id, townId, username, password);
      res.json({ id: credential.id, townId: credential.townId });
    } catch (error) {
      console.error("Error storing credentials:", error);
      res.status(500).json({ message: "Failed to store credentials" });
    }
  });

  // Create portal automation job
  app.post("/api/submissions/portal-automation", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const validation = portalAutomationSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      
      const { permitId, townId, vaultId, credentialId } = validation.data;

      const vault = await storage.getDataVault(vaultId);
      if (!vault || vault.userId !== user.id) {
        return res.status(403).json({ message: "Vault not found or access denied" });
      }

      const credential = await storage.getPortalCredential(credentialId);
      if (!credential || credential.userId !== user.id) {
        return res.status(403).json({ message: "Credential not found or access denied" });
      }

      const job = await createPortalAutomationJob(
        user.id,
        permitId,
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
      const user = req.user as Express.User;
      const job = await storage.getSubmissionJob(req.params.jobId);
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (job.userId !== user.id) {
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
      const user = req.user as Express.User;
      const { townId, formId } = req.params;
      const { profileId, permitId, eventData, userAnswers, submitForm } = req.body;

      if (!profileId) {
        return res.status(400).json({ message: "Profile ID is required" });
      }

      // Verify profile belongs to user
      const profile = await storage.getProfile(profileId);
      if (!profile || profile.userId !== user.id) {
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

  return httpServer;
}
