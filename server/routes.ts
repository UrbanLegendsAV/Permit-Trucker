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
import { GoogleGenerativeAI } from "@google/generative-ai";

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

  // Gemini Vision document parsing endpoint
  app.post("/api/documents/parse-gemini", isAuthenticated, async (req: any, res) => {
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
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = `Analyze this document and extract all form fields, questions, and their corresponding answers or values. Return the data as a clean JSON object with descriptive keys. Only return valid JSON, no markdown formatting or explanation.`;

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

      // Safely extract text from response
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
        return res.status(502).json({ message: "Invalid response from AI service" });
      }
      
      // Parse the JSON response (handle potential markdown code blocks)
      let parsedData: Record<string, unknown>;
      try {
        let jsonText = responseText;
        // Remove markdown code blocks if present
        if (jsonText.includes("```json")) {
          jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        } else if (jsonText.includes("```")) {
          jsonText = jsonText.replace(/```\s*/g, "");
        }
        parsedData = JSON.parse(jsonText.trim());
      } catch (parseError) {
        console.error("Failed to parse Gemini response as JSON:", responseText);
        return res.status(500).json({ 
          message: "Failed to parse AI response as structured data", 
          rawResponse: responseText.substring(0, 500) // Truncate for safety
        });
      }

      // If profileId provided, save to profile's parsedDataLog with timestamp
      if (profileId) {
        const profile = await storage.getProfile(profileId);
        if (profile) {
          // Safely handle null/undefined parsedDataLog
          const existingData = (profile.parsedDataLog && typeof profile.parsedDataLog === 'object') 
            ? profile.parsedDataLog as Record<string, unknown>
            : {};
          
          // Add timestamp to track when data was parsed
          const timestampedData = {
            ...parsedData,
            _parsedAt: new Date().toISOString()
          };
          
          // Merge with existing data (new values overwrite old)
          const mergedData = { ...existingData, ...timestampedData };
          await storage.updateProfile(profileId, { 
            parsedDataLog: mergedData 
          });
        }
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

  app.post("/api/permits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const data = { ...req.body, userId, appliedDate: new Date() };
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
      const permit = await storage.updatePermit(req.params.id, req.body);
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
      
      const data = { ...req.body, reviewerIp: clientIp };
      const parsed = insertReviewSchema.safeParse(data);
      
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

  return httpServer;
}
