import { 
  profiles, permits, towns, badges, portalMappings, publicProfiles, reviews, configs, townForms, townRequests, researchJobs, dataVaults, submissionJobs, portalCredentials, healthDistricts,
  type Profile, type InsertProfile,
  type Permit, type InsertPermit,
  type Town, type InsertTown,
  type Badge, type InsertBadge,
  type PortalMapping, type InsertPortalMapping,
  type PublicProfile, type InsertPublicProfile,
  type Review, type InsertReview,
  type Config, type InsertConfig,
  type TownForm, type InsertTownForm,
  type TownRequest, type InsertTownRequest,
  type ResearchJob, type InsertResearchJob,
  type DataVault, type InsertDataVault,
  type SubmissionJob, type InsertSubmissionJob,
  type PortalCredential, type InsertPortalCredential,
  type HealthDistrict,
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
  getUserBadgeByType(userId: string, badgeType: string, townId?: string): Promise<Badge | undefined>;
  
  getLeaderboard(): Promise<Array<{ userId: string; name: string; badgeCount: number; pioneerCount: number }>>;

  getPortalMapping(townId: string): Promise<PortalMapping | undefined>;
  createPortalMapping(mapping: InsertPortalMapping): Promise<PortalMapping>;
  updatePortalMapping(townId: string, fieldSelectors: Record<string, string>): Promise<PortalMapping | undefined>;
  getDefaultPortalMapping(): Promise<PortalMapping | undefined>;

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

  // Town Forms
  getAllTownForms(): Promise<TownForm[]>;
  getTownForms(townId: string): Promise<TownForm[]>;
  getTownFormById(id: string): Promise<TownForm | undefined>;
  createTownForm(form: InsertTownForm): Promise<TownForm>;
  updateTownForm(id: string, form: Partial<InsertTownForm>): Promise<TownForm | undefined>;
  deleteTownForm(id: string): Promise<void>;
  
  // Get town by ID
  getTownById(id: string): Promise<Town | undefined>;

  // Town Requests (Pioneer submissions)
  getTownRequests(): Promise<TownRequest[]>;
  getTownRequest(id: string): Promise<TownRequest | undefined>;
  createTownRequest(request: InsertTownRequest): Promise<TownRequest>;
  updateTownRequestStatus(id: string, status: string, reviewedBy?: string): Promise<TownRequest | undefined>;
  updateTownRequest(id: string, data: Partial<InsertTownRequest>): Promise<TownRequest | undefined>;

  // Research Jobs
  getResearchJob(id: string): Promise<ResearchJob | undefined>;
  getResearchJobByTownRequest(townRequestId: string): Promise<ResearchJob | undefined>;
  createResearchJob(job: InsertResearchJob): Promise<ResearchJob>;
  updateResearchJob(id: string, data: Partial<InsertResearchJob>): Promise<ResearchJob | undefined>;
  getPendingResearchJobs(): Promise<ResearchJob[]>;

  // Health Districts
  getHealthDistricts(): Promise<HealthDistrict[]>;
  getHealthDistrict(id: string): Promise<HealthDistrict | undefined>;
  getTownsByDistrict(districtId: string): Promise<Town[]>;
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
    const [newProfile] = await db.insert(profiles).values(profile as any).returning();
    return newProfile;
  }

  async updateProfile(id: string, profile: Partial<InsertProfile>): Promise<Profile | undefined> {
    const [updated] = await db
      .update(profiles)
      .set({ ...profile, updatedAt: new Date() } as any)
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
    const [newPermit] = await db.insert(permits).values(permit as any).returning();
    return newPermit;
  }

  async updatePermit(id: string, permit: Partial<InsertPermit>): Promise<Permit | undefined> {
    const [updated] = await db
      .update(permits)
      .set({ ...permit, updatedAt: new Date() } as any)
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
    const [newTown] = await db.insert(towns).values(town as any).returning();
    return newTown;
  }

  async updateTown(id: string, town: Partial<InsertTown>): Promise<Town | undefined> {
    const [updated] = await db
      .update(towns)
      .set({ ...town, lastVerified: new Date() } as any)
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

  async getUserBadgeByType(userId: string, badgeType: string, townId?: string): Promise<Badge | undefined> {
    if (townId) {
      const [badge] = await db
        .select()
        .from(badges)
        .where(and(eq(badges.userId, userId), eq(badges.badgeType, badgeType as any), eq(badges.townId, townId)));
      return badge;
    }
    const [badge] = await db
      .select()
      .from(badges)
      .where(and(eq(badges.userId, userId), eq(badges.badgeType, badgeType as any)));
    return badge;
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

  async createPortalMapping(mapping: InsertPortalMapping): Promise<PortalMapping> {
    const [newMapping] = await db.insert(portalMappings).values(mapping).returning();
    return newMapping;
  }

  async updatePortalMapping(townId: string, fieldSelectors: Record<string, string>): Promise<PortalMapping | undefined> {
    const [updated] = await db
      .update(portalMappings)
      .set({ fieldSelectors })
      .where(eq(portalMappings.townId, townId))
      .returning();
    return updated;
  }

  async getDefaultPortalMapping(): Promise<PortalMapping | undefined> {
    const [mapping] = await db.select().from(portalMappings).where(eq(portalMappings.townId, "default_opengov"));
    return mapping;
  }

  async deleteTown(id: string): Promise<void> {
    await db.delete(towns).where(eq(towns.id, id));
  }

  // Public profiles - excludes demo data (userId starting with "demo-")
  async getPublicProfiles(): Promise<PublicProfile[]> {
    return db.select().from(publicProfiles).where(
      and(
        eq(publicProfiles.isPublic, true),
        sql`${publicProfiles.userId} NOT LIKE 'demo-%'`
      )
    );
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
    const [newProfile] = await db.insert(publicProfiles).values(profile as any).returning();
    return newProfile;
  }

  async updatePublicProfile(profileId: string, data: Partial<InsertPublicProfile>): Promise<PublicProfile | undefined> {
    const [updated] = await db
      .update(publicProfiles)
      .set({ ...data, updatedAt: new Date() } as any)
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

  async getAllReviews(): Promise<(Review & { businessName: string | null })[]> {
    const result = await db
      .select({
        id: reviews.id,
        publicProfileId: reviews.publicProfileId,
        rating: reviews.rating,
        text: reviews.text,
        reviewerName: reviews.reviewerName,
        reviewerIp: reviews.reviewerIp,
        status: reviews.status,
        sentimentScore: reviews.sentimentScore,
        createdAt: reviews.createdAt,
        businessName: publicProfiles.businessName,
      })
      .from(reviews)
      .leftJoin(publicProfiles, eq(reviews.publicProfileId, publicProfiles.id))
      .orderBy(desc(reviews.createdAt));
    return result;
  }

  async updateReviewStatus(reviewId: string, status: "pending" | "approved" | "denied"): Promise<Review | undefined> {
    const [updated] = await db
      .update(reviews)
      .set({ status })
      .where(eq(reviews.id, reviewId))
      .returning();
    return updated;
  }

  async deleteReview(reviewId: string): Promise<void> {
    await db.delete(reviews).where(eq(reviews.id, reviewId));
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

  // Town Forms
  async getAllTownForms(): Promise<TownForm[]> {
    return db.select().from(townForms).orderBy(townForms.sortOrder);
  }

  async getTownForms(townId: string): Promise<TownForm[]> {
    return db.select().from(townForms).where(eq(townForms.townId, townId)).orderBy(townForms.sortOrder);
  }

  async getTownFormById(id: string): Promise<TownForm | undefined> {
    const [form] = await db.select().from(townForms).where(eq(townForms.id, id));
    return form;
  }

  async getTownById(id: string): Promise<Town | undefined> {
    const [town] = await db.select().from(towns).where(eq(towns.id, id));
    return town;
  }

  async createTownForm(form: InsertTownForm): Promise<TownForm> {
    const [newForm] = await db.insert(townForms).values(form).returning();
    return newForm;
  }

  async updateTownForm(id: string, form: Partial<InsertTownForm>): Promise<TownForm | undefined> {
    const [updated] = await db
      .update(townForms)
      .set({ ...form, updatedAt: new Date() })
      .where(eq(townForms.id, id))
      .returning();
    return updated;
  }

  async deleteTownForm(id: string): Promise<void> {
    await db.delete(townForms).where(eq(townForms.id, id));
  }

  // Town Requests (Pioneer submissions)
  async getTownRequests(): Promise<TownRequest[]> {
    return db.select().from(townRequests).orderBy(desc(townRequests.createdAt));
  }

  async createTownRequest(request: InsertTownRequest): Promise<TownRequest> {
    const [newRequest] = await db.insert(townRequests).values(request).returning();
    return newRequest;
  }

  async updateTownRequestStatus(id: string, status: string, reviewedBy?: string): Promise<TownRequest | undefined> {
    const [updated] = await db
      .update(townRequests)
      .set({ status, reviewedBy })
      .where(eq(townRequests.id, id))
      .returning();
    return updated;
  }

  async getTownRequest(id: string): Promise<TownRequest | undefined> {
    const [request] = await db.select().from(townRequests).where(eq(townRequests.id, id));
    return request;
  }

  async updateTownRequest(id: string, data: Partial<InsertTownRequest>): Promise<TownRequest | undefined> {
    const [updated] = await db
      .update(townRequests)
      .set(data)
      .where(eq(townRequests.id, id))
      .returning();
    return updated;
  }

  async getResearchJob(id: string): Promise<ResearchJob | undefined> {
    const [job] = await db.select().from(researchJobs).where(eq(researchJobs.id, id));
    return job;
  }

  async getResearchJobByTownRequest(townRequestId: string): Promise<ResearchJob | undefined> {
    const [job] = await db.select().from(researchJobs).where(eq(researchJobs.townRequestId, townRequestId));
    return job;
  }

  async createResearchJob(job: InsertResearchJob): Promise<ResearchJob> {
    const [newJob] = await db.insert(researchJobs).values(job as any).returning();
    return newJob;
  }

  async updateResearchJob(id: string, data: Partial<InsertResearchJob>): Promise<ResearchJob | undefined> {
    const [updated] = await db
      .update(researchJobs)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(researchJobs.id, id))
      .returning();
    return updated;
  }

  async getPendingResearchJobs(): Promise<ResearchJob[]> {
    return db.select().from(researchJobs).where(eq(researchJobs.status, "pending")).orderBy(researchJobs.createdAt);
  }

  // Data Vault methods
  async getDataVault(id: string): Promise<DataVault | undefined> {
    const [vault] = await db.select().from(dataVaults).where(eq(dataVaults.id, id));
    return vault;
  }

  async getDataVaultByProfileId(profileId: string): Promise<DataVault | undefined> {
    const [vault] = await db.select().from(dataVaults).where(eq(dataVaults.profileId, profileId));
    return vault;
  }

  async getDataVaultByUserId(userId: string): Promise<DataVault | undefined> {
    const [vault] = await db.select().from(dataVaults).where(eq(dataVaults.userId, userId));
    return vault;
  }

  async createDataVault(vault: InsertDataVault): Promise<DataVault> {
    const [newVault] = await db.insert(dataVaults).values(vault as any).returning();
    return newVault;
  }

  async updateDataVault(id: string, data: Partial<InsertDataVault>): Promise<DataVault | undefined> {
    const [updated] = await db
      .update(dataVaults)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(dataVaults.id, id))
      .returning();
    return updated;
  }

  // Submission Job methods
  async getSubmissionJob(id: string): Promise<SubmissionJob | undefined> {
    const [job] = await db.select().from(submissionJobs).where(eq(submissionJobs.id, id));
    return job;
  }

  async getSubmissionJobsByUser(userId: string): Promise<SubmissionJob[]> {
    return db.select().from(submissionJobs).where(eq(submissionJobs.userId, userId)).orderBy(desc(submissionJobs.createdAt));
  }

  async getSubmissionJobsByPermit(permitId: string): Promise<SubmissionJob[]> {
    return db.select().from(submissionJobs).where(eq(submissionJobs.permitId, permitId)).orderBy(desc(submissionJobs.createdAt));
  }

  async createSubmissionJob(job: InsertSubmissionJob): Promise<SubmissionJob> {
    const [newJob] = await db.insert(submissionJobs).values(job as any).returning();
    return newJob;
  }

  async updateSubmissionJob(id: string, data: Partial<InsertSubmissionJob>): Promise<SubmissionJob | undefined> {
    const [updated] = await db
      .update(submissionJobs)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(submissionJobs.id, id))
      .returning();
    return updated;
  }

  async getPendingSubmissionJobs(): Promise<SubmissionJob[]> {
    return db.select().from(submissionJobs).where(eq(submissionJobs.status, "draft")).orderBy(submissionJobs.createdAt);
  }

  // Portal Credentials methods
  async getPortalCredential(id: string): Promise<PortalCredential | undefined> {
    const [cred] = await db.select().from(portalCredentials).where(eq(portalCredentials.id, id));
    return cred;
  }

  async getPortalCredentialByUserAndTown(userId: string, townId: string): Promise<PortalCredential | undefined> {
    const [cred] = await db.select().from(portalCredentials).where(
      and(eq(portalCredentials.userId, userId), eq(portalCredentials.townId, townId))
    );
    return cred;
  }

  async createPortalCredential(cred: InsertPortalCredential): Promise<PortalCredential> {
    const [newCred] = await db.insert(portalCredentials).values(cred as any).returning();
    return newCred;
  }

  async updatePortalCredential(id: string, data: Partial<InsertPortalCredential>): Promise<PortalCredential | undefined> {
    const [updated] = await db
      .update(portalCredentials)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(portalCredentials.id, id))
      .returning();
    return updated;
  }

  // Health Districts methods
  async getHealthDistricts(): Promise<HealthDistrict[]> {
    return db.select().from(healthDistricts).orderBy(healthDistricts.name);
  }

  async getHealthDistrict(id: string): Promise<HealthDistrict | undefined> {
    const [district] = await db.select().from(healthDistricts).where(eq(healthDistricts.id, id));
    return district;
  }

  async getTownsByDistrict(districtId: string): Promise<Town[]> {
    return db.select().from(towns).where(eq(towns.healthDistrictId, districtId)).orderBy(towns.townName);
  }
}

export const storage = new DatabaseStorage();
