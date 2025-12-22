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
} from "@shared/schema";

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
      
      const hasFirstPermitBadge = existingBadges.some(b => b.badgeType === "first_permit");
      if (!hasFirstPermitBadge) {
        await storage.createBadge({
          userId,
          badgeType: "first_permit",
          tier: "bronze",
        });
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

  return httpServer;
}
