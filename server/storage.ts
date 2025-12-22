import { 
  profiles, permits, towns, badges, portalMappings, publicProfiles, reviews, configs,
  type Profile, type InsertProfile,
  type Permit, type InsertPermit,
  type Town, type InsertTown,
  type Badge, type InsertBadge,
  type PortalMapping, type InsertPortalMapping,
  type PublicProfile, type InsertPublicProfile,
  type Review, type InsertReview,
  type Config, type InsertConfig,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { db } from "./db";
import { eq, and, desc, gte, sql } from "drizzle-orm";

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
  deleteTown(id: string): Promise<void>;

  getBadges(userId: string): Promise<Badge[]>;
  createBadge(badge: InsertBadge): Promise<Badge>;
  
  getLeaderboard(): Promise<Array<{ userId: string; name: string; badgeCount: number; pioneerCount: number }>>;

  getPortalMapping(townId: string): Promise<PortalMapping | undefined>;

  // Public profiles
  getPublicProfiles(): Promise<PublicProfile[]>;
  getPublicProfile(profileId: string): Promise<PublicProfile | undefined>;
  getPublicProfileByUser(userId: string): Promise<PublicProfile | undefined>;
  createPublicProfile(profile: InsertPublicProfile): Promise<PublicProfile>;
  updatePublicProfile(profileId: string, data: Partial<InsertPublicProfile>): Promise<PublicProfile | undefined>;

  // Reviews
  getReviews(publicProfileId: string): Promise<Review[]>;
  createReview(review: InsertReview): Promise<Review>;
  getReviewCountByIp(ip: string, since: Date): Promise<number>;

  // Configs
  getConfig(key: string): Promise<Config | undefined>;
  getAllConfigs(): Promise<Config[]>;
  setConfig(key: string, value: string, description?: string, updatedBy?: string): Promise<Config>;

  // Users/Admin
  getUserRole(userId: string): Promise<string | null>;
  setUserRole(userId: string, role: "user" | "admin" | "owner"): Promise<void>;
  getAllUsers(): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; role: string | null }>>;
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

  async deleteTown(id: string): Promise<void> {
    await db.delete(towns).where(eq(towns.id, id));
  }

  // Public profiles
  async getPublicProfiles(): Promise<PublicProfile[]> {
    return db.select().from(publicProfiles).where(eq(publicProfiles.isPublic, true));
  }

  async getPublicProfile(profileId: string): Promise<PublicProfile | undefined> {
    const [profile] = await db.select().from(publicProfiles).where(eq(publicProfiles.profileId, profileId));
    return profile;
  }

  async getPublicProfileByUser(userId: string): Promise<PublicProfile | undefined> {
    const [profile] = await db.select().from(publicProfiles).where(eq(publicProfiles.userId, userId));
    return profile;
  }

  async createPublicProfile(profile: InsertPublicProfile): Promise<PublicProfile> {
    const [newProfile] = await db.insert(publicProfiles).values(profile).returning();
    return newProfile;
  }

  async updatePublicProfile(profileId: string, data: Partial<InsertPublicProfile>): Promise<PublicProfile | undefined> {
    const [updated] = await db
      .update(publicProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(publicProfiles.profileId, profileId))
      .returning();
    return updated;
  }

  // Reviews
  async getReviews(publicProfileId: string): Promise<Review[]> {
    return db.select().from(reviews).where(eq(reviews.publicProfileId, publicProfileId)).orderBy(desc(reviews.createdAt));
  }

  async createReview(review: InsertReview): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    return newReview;
  }

  async getReviewCountByIp(ip: string, since: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(reviews)
      .where(and(eq(reviews.reviewerIp, ip), gte(reviews.createdAt, since)));
    return result[0]?.count || 0;
  }

  // Configs
  async getConfig(key: string): Promise<Config | undefined> {
    const [config] = await db.select().from(configs).where(eq(configs.key, key));
    return config;
  }

  async getAllConfigs(): Promise<Config[]> {
    return db.select().from(configs);
  }

  async setConfig(key: string, value: string, description?: string, updatedBy?: string): Promise<Config> {
    const existing = await this.getConfig(key);
    if (existing) {
      const [updated] = await db
        .update(configs)
        .set({ value, description, updatedBy, updatedAt: new Date() })
        .where(eq(configs.key, key))
        .returning();
      return updated;
    }
    const [newConfig] = await db.insert(configs).values({ key, value, description, updatedBy }).returning();
    return newConfig;
  }

  // Users/Admin
  async getUserRole(userId: string): Promise<string | null> {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    return user?.role || null;
  }

  async setUserRole(userId: string, role: "user" | "admin" | "owner"): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  }

  async getAllUsers(): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; role: string | null }>> {
    return db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    }).from(users);
  }
}

export const storage = new DatabaseStorage();
