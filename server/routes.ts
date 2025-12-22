import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { 
  insertProfileSchema, 
  insertPermitSchema, 
  insertBadgeSchema,
  insertTownSchema 
} from "@shared/schema";

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

  return httpServer;
}
