import { 
  profiles, permits, towns, badges, portalMappings,
  type Profile, type InsertProfile,
  type Permit, type InsertPermit,
  type Town, type InsertTown,
  type Badge, type InsertBadge,
  type PortalMapping, type InsertPortalMapping,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getProfiles(userId: string): Promise<Profile[]>;
  getProfile(id: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(id: string, profile: Partial<InsertProfile>): Promise<Profile | undefined>;
  deleteProfile(id: string): Promise<void>;

  getPermits(userId: string): Promise<Permit[]>;
  getPermit(id: string): Promise<Permit | undefined>;
  createPermit(permit: InsertPermit): Promise<Permit>;
  updatePermit(id: string, permit: Partial<InsertPermit>): Promise<Permit | undefined>;
  deletePermit(id: string): Promise<void>;

  getTowns(state?: string): Promise<Town[]>;
  getTown(id: string): Promise<Town | undefined>;
  createTown(town: InsertTown): Promise<Town>;
  updateTown(id: string, town: Partial<InsertTown>): Promise<Town | undefined>;

  getBadges(userId: string): Promise<Badge[]>;
  createBadge(badge: InsertBadge): Promise<Badge>;
  
  getLeaderboard(): Promise<Array<{ userId: string; name: string; badgeCount: number; pioneerCount: number }>>;

  getPortalMapping(townId: string): Promise<PortalMapping | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getProfiles(userId: string): Promise<Profile[]> {
    return db.select().from(profiles).where(eq(profiles.userId, userId)).orderBy(desc(profiles.createdAt));
  }

  async getProfile(id: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    return profile;
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [newProfile] = await db.insert(profiles).values(profile).returning();
    return newProfile;
  }

  async updateProfile(id: string, profile: Partial<InsertProfile>): Promise<Profile | undefined> {
    const [updated] = await db
      .update(profiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return updated;
  }

  async deleteProfile(id: string): Promise<void> {
    await db.delete(profiles).where(eq(profiles.id, id));
  }

  async getPermits(userId: string): Promise<Permit[]> {
    return db.select().from(permits).where(eq(permits.userId, userId)).orderBy(desc(permits.createdAt));
  }

  async getPermit(id: string): Promise<Permit | undefined> {
    const [permit] = await db.select().from(permits).where(eq(permits.id, id));
    return permit;
  }

  async createPermit(permit: InsertPermit): Promise<Permit> {
    const [newPermit] = await db.insert(permits).values(permit).returning();
    return newPermit;
  }

  async updatePermit(id: string, permit: Partial<InsertPermit>): Promise<Permit | undefined> {
    const [updated] = await db
      .update(permits)
      .set({ ...permit, updatedAt: new Date() })
      .where(eq(permits.id, id))
      .returning();
    return updated;
  }

  async deletePermit(id: string): Promise<void> {
    await db.delete(permits).where(eq(permits.id, id));
  }

  async getTowns(state?: string): Promise<Town[]> {
    if (state) {
      return db.select().from(towns).where(eq(towns.state, state)).orderBy(towns.townName);
    }
    return db.select().from(towns).orderBy(towns.townName);
  }

  async getTown(id: string): Promise<Town | undefined> {
    const [town] = await db.select().from(towns).where(eq(towns.id, id));
    return town;
  }

  async createTown(town: InsertTown): Promise<Town> {
    const [newTown] = await db.insert(towns).values(town).returning();
    return newTown;
  }

  async updateTown(id: string, town: Partial<InsertTown>): Promise<Town | undefined> {
    const [updated] = await db
      .update(towns)
      .set({ ...town, lastVerified: new Date() })
      .where(eq(towns.id, id))
      .returning();
    return updated;
  }

  async getBadges(userId: string): Promise<Badge[]> {
    return db.select().from(badges).where(eq(badges.userId, userId)).orderBy(desc(badges.earnedDate));
  }

  async createBadge(badge: InsertBadge): Promise<Badge> {
    const [newBadge] = await db.insert(badges).values(badge).returning();
    return newBadge;
  }

  async getLeaderboard(): Promise<Array<{ userId: string; name: string; badgeCount: number; pioneerCount: number }>> {
    const allBadges = await db.select().from(badges);
    
    const userBadges = allBadges.reduce((acc, badge) => {
      if (!acc[badge.userId]) {
        acc[badge.userId] = { total: 0, pioneers: 0 };
      }
      acc[badge.userId].total++;
      if (badge.badgeType === "pioneer") {
        acc[badge.userId].pioneers++;
      }
      return acc;
    }, {} as Record<string, { total: number; pioneers: number }>);

    return Object.entries(userBadges)
      .map(([userId, counts]) => ({
        userId,
        name: `User ${userId.slice(0, 6)}`,
        badgeCount: counts.total,
        pioneerCount: counts.pioneers,
      }))
      .sort((a, b) => b.badgeCount - a.badgeCount)
      .slice(0, 10);
  }

  async getPortalMapping(townId: string): Promise<PortalMapping | undefined> {
    const [mapping] = await db.select().from(portalMappings).where(eq(portalMappings.townId, townId));
    return mapping;
  }
}

export const storage = new DatabaseStorage();
