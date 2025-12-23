import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const vehicleTypeEnum = pgEnum("vehicle_type", ["truck", "trailer"]);
export const permitTypeEnum = pgEnum("permit_type", ["yearly", "temporary", "seasonal"]);
export const permitStatusEnum = pgEnum("permit_status", ["draft", "pending", "approved", "expired", "rejected"]);
export const formTypeEnum = pgEnum("form_type", ["online_portal", "pdf_download", "mail_in"]);
export const badgeTypeEnum = pgEnum("badge_type", ["pioneer", "explorer", "food_type", "first_permit", "multi_town", "speed_demon", "helper"]);
export const badgeTierEnum = pgEnum("badge_tier", ["bronze", "silver", "gold"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "denied"]);

export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
  vehicleName: varchar("vehicle_name", { length: 100 }),
  vinPlate: varchar("vin_plate", { length: 50 }),
  menuType: varchar("menu_type", { length: 100 }),
  hasPropane: boolean("has_propane").default(false),
  hasQfoCert: boolean("has_qfo_cert").default(false),
  commissaryName: varchar("commissary_name", { length: 200 }),
  commissaryAddress: text("commissary_address"),
  uploadsJson: jsonb("uploads_json").$type<{ documents: Array<{ name: string; type: string; url: string; folder?: string; base64?: string }> }>(),
  extractedData: jsonb("extracted_data").$type<{
    vin?: string;
    licensePlate?: string;
    businessName?: string;
    ownerName?: string;
    expirationDate?: string;
    licenseNumber?: string;
    rawText?: string;
  }>(),
  parsedDataLog: jsonb("parsed_data_log").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const towns = pgTable("towns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: varchar("state", { length: 2 }).notNull(),
  county: varchar("county", { length: 100 }).notNull(),
  townName: varchar("town_name", { length: 100 }).notNull(),
  permitTypes: text("permit_types").array(),
  portalUrl: text("portal_url"),
  formType: formTypeEnum("form_type").default("pdf_download"),
  requirementsJson: jsonb("requirements_json").$type<{
    coi: boolean;
    background: boolean;
    healthInspection: boolean;
    fireInspection: boolean;
    vehicleInspection: boolean;
    commissaryLetter: boolean;
    menuRequired: boolean;
    fees: { yearly?: number; temporary?: number; seasonal?: number };
    notes: string[];
  }>(),
  lastVerified: timestamp("last_verified"),
  confidenceScore: integer("confidence_score").default(50),
});

export const permits = pgTable("permits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  profileId: varchar("profile_id").references(() => profiles.id),
  townId: varchar("town_id").references(() => towns.id),
  permitType: permitTypeEnum("permit_type").notNull(),
  status: permitStatusEnum("status").default("draft"),
  appliedDate: timestamp("applied_date"),
  expiryDate: timestamp("expiry_date"),
  isPioneer: boolean("is_pioneer").default(false),
  checklistProgress: jsonb("checklist_progress").$type<Record<string, boolean>>(),
  signatureData: text("signature_data"),
  eventName: varchar("event_name", { length: 200 }),
  eventDate: timestamp("event_date"),
  eventEndDate: timestamp("event_end_date"),
  eventAddress: text("event_address"),
  eventCity: varchar("event_city", { length: 100 }),
  eventHours: jsonb("event_hours").$type<{ start: string; end: string }[]>(),
  eventContactName: varchar("event_contact_name", { length: 200 }),
  eventContactPhone: varchar("event_contact_phone", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const badges = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  badgeType: badgeTypeEnum("badge_type").notNull(),
  tier: badgeTierEnum("tier").default("bronze"),
  townId: varchar("town_id").references(() => towns.id),
  foodType: varchar("food_type", { length: 100 }),
  earnedDate: timestamp("earned_date").defaultNow(),
});

export const portalMappings = pgTable("portal_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  townId: varchar("town_id").references(() => towns.id).notNull(),
  fieldSelectors: jsonb("field_selectors").$type<Record<string, string>>(),
  notes: text("notes"),
});

export const profilesRelations = relations(profiles, ({ many }) => ({
  permits: many(permits),
}));

export const townsRelations = relations(towns, ({ many }) => ({
  permits: many(permits),
  badges: many(badges),
  portalMappings: many(portalMappings),
}));

export const permitsRelations = relations(permits, ({ one }) => ({
  profile: one(profiles, {
    fields: [permits.profileId],
    references: [profiles.id],
  }),
  town: one(towns, {
    fields: [permits.townId],
    references: [towns.id],
  }),
}));

export const badgesRelations = relations(badges, ({ one }) => ({
  town: one(towns, {
    fields: [badges.townId],
    references: [towns.id],
  }),
}));

export const portalMappingsRelations = relations(portalMappings, ({ one }) => ({
  town: one(towns, {
    fields: [portalMappings.townId],
    references: [towns.id],
  }),
}));

// Public profiles for opted-in trucks (consumer discovery)
export const publicProfiles = pgTable("public_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").references(() => profiles.id).notNull().unique(),
  userId: varchar("user_id").notNull(),
  isPublic: boolean("is_public").default(false),
  businessName: varchar("business_name", { length: 200 }),
  description: text("description"),
  menuJson: jsonb("menu_json").$type<{ items: Array<{ name: string; price: number; description?: string }> }>(),
  hours: jsonb("hours").$type<Record<string, { open: string; close: string; closed?: boolean }>>(),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  locationAddress: text("location_address"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  website: text("website"),
  socialLinks: jsonb("social_links").$type<{ instagram?: string; facebook?: string; twitter?: string }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Reviews from consumers
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publicProfileId: varchar("public_profile_id").references(() => publicProfiles.id).notNull(),
  rating: integer("rating").notNull(),
  text: text("text"),
  reviewerName: varchar("reviewer_name", { length: 100 }),
  reviewerIp: varchar("reviewer_ip", { length: 45 }),
  status: reviewStatusEnum("status").default("approved"),
  sentimentScore: integer("sentiment_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin configs (pricing, settings, promos)
export const configs = pgTable("configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

// Town forms - official PDF forms from municipalities
export const formCategoryEnum = pgEnum("form_category", [
  "temporary_permit",
  "seasonal_permit",
  "yearly_permit",
  "plan_review",
  "license_renewal",
  "checklist",
  "health_inspection",
  "fire_safety",
  "other"
]);

export const researchStatusEnum = pgEnum("research_status", [
  "pending",
  "researching",
  "completed",
  "failed",
  "needs_review"
]);

export const researchJobs = pgTable("research_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  townRequestId: varchar("town_request_id").references(() => townRequests.id),
  status: researchStatusEnum("status").default("pending"),
  stage: varchar("stage", { length: 50 }).default("discovery"),
  progress: integer("progress").default(0),
  healthDeptUrl: text("health_dept_url"),
  permitPortalUrl: text("permit_portal_url"),
  rawHtmlSnapshot: text("raw_html_snapshot"),
  geminiResponse: jsonb("gemini_response").$type<Record<string, unknown>>(),
  extractedRequirements: jsonb("extracted_requirements").$type<{
    permitTypes: string[];
    fees: { yearly?: number; temporary?: number; seasonal?: number };
    requirements: string[];
    notes: string[];
    hasDownloadableForms: boolean;
    formUrls: string[];
    isPortalOnly: boolean;
  }>(),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const townForms = pgTable("town_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  townId: varchar("town_id").references(() => towns.id).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: formCategoryEnum("category").default("other"),
  externalUrl: text("external_url"),
  sourceUrl: text("source_url"),
  fileData: text("file_data"),
  fileName: varchar("file_name", { length: 200 }),
  fileType: varchar("file_type", { length: 50 }),
  isFillable: boolean("is_fillable").default(false),
  isAiDiscovered: boolean("is_ai_discovered").default(false),
  fieldMappings: jsonb("field_mappings").$type<Record<string, string>>(),
  sortOrder: integer("sort_order").default(0),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pioneer town requests - for users to request new towns
export const townRequests = pgTable("town_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  county: varchar("county", { length: 100 }),
  townName: varchar("town_name", { length: 100 }).notNull(),
  portalUrl: text("portal_url"),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).default("pending"),
  reviewedBy: varchar("reviewed_by"),
  researchJobId: varchar("research_job_id"),
  researchStatus: varchar("research_status", { length: 20 }).default("pending"),
  resultingTownId: varchar("resulting_town_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const townFormsRelations = relations(townForms, ({ one }) => ({
  town: one(towns, {
    fields: [townForms.townId],
    references: [towns.id],
  }),
}));

export const publicProfilesRelations = relations(publicProfiles, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [publicProfiles.profileId],
    references: [profiles.id],
  }),
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  publicProfile: one(publicProfiles, {
    fields: [reviews.publicProfileId],
    references: [publicProfiles.id],
  }),
}));

export const insertProfileSchema = createInsertSchema(profiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTownSchema = createInsertSchema(towns).omit({
  id: true,
});

export const insertPermitSchema = createInsertSchema(permits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBadgeSchema = createInsertSchema(badges).omit({
  id: true,
  earnedDate: true,
});

export const insertPortalMappingSchema = createInsertSchema(portalMappings).omit({
  id: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

export type InsertTown = z.infer<typeof insertTownSchema>;
export type Town = typeof towns.$inferSelect;

export type InsertPermit = z.infer<typeof insertPermitSchema>;
export type Permit = typeof permits.$inferSelect;

export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type Badge = typeof badges.$inferSelect;

export type InsertPortalMapping = z.infer<typeof insertPortalMappingSchema>;
export type PortalMapping = typeof portalMappings.$inferSelect;

export const insertPublicProfileSchema = createInsertSchema(publicProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});

export const insertConfigSchema = createInsertSchema(configs).omit({
  id: true,
  updatedAt: true,
});

export type InsertPublicProfile = z.infer<typeof insertPublicProfileSchema>;
export type PublicProfile = typeof publicProfiles.$inferSelect;

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

export type InsertConfig = z.infer<typeof insertConfigSchema>;
export type Config = typeof configs.$inferSelect;

export const insertTownFormSchema = createInsertSchema(townForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTownRequestSchema = createInsertSchema(townRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertTownForm = z.infer<typeof insertTownFormSchema>;
export type TownForm = typeof townForms.$inferSelect;

export type InsertTownRequest = z.infer<typeof insertTownRequestSchema>;
export type TownRequest = typeof townRequests.$inferSelect;

export const insertResearchJobSchema = createInsertSchema(researchJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type InsertResearchJob = z.infer<typeof insertResearchJobSchema>;
export type ResearchJob = typeof researchJobs.$inferSelect;
