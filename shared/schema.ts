import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const vehicleTypeEnum = pgEnum("vehicle_type", ["truck", "trailer"]);
export const permitTypeEnum = pgEnum("permit_type", ["yearly", "temporary", "seasonal"]);
export const permitStatusEnum = pgEnum("permit_status", ["draft", "pending", "approved", "expired", "rejected"]);
export const formTypeEnum = pgEnum("form_type", ["online_portal", "pdf_download", "mail_in"]);
export const submissionMethodEnum = pgEnum("submission_method", ["online_only", "email_dropoff", "mail_dropoff", "in_person", "drop_box"]);
export const portalProviderEnum = pgEnum("portal_provider", ["viewpoint_opengov", "citysquared", "accela", "cityview", "manual_pdf", "other"]);
export const badgeTypeEnum = pgEnum("badge_type", ["pioneer", "explorer", "food_type", "first_permit", "multi_town", "speed_demon", "helper"]);
export const badgeTierEnum = pgEnum("badge_tier", ["bronze", "silver", "gold"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "denied"]);
export const submissionStatusEnum = pgEnum("submission_status", ["draft", "pending_review", "ready_to_submit", "submitted", "failed", "completed"]);
export const submissionTypeEnum = pgEnum("submission_type", ["pdf_fill", "portal_automation", "manual"]);

export const healthDistricts = pgTable("health_districts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull().unique(),
  website: varchar("website", { length: 200 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  submissionMethod: submissionMethodEnum("submission_method"),
  portalProvider: portalProviderEnum("portal_provider"),
  portalProviderLabel: varchar("portal_provider_label", { length: 100 }),
  healthDistrictId: varchar("health_district_id").references(() => healthDistricts.id),
  healthDistrictName: varchar("health_district_name", { length: 200 }),
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
  // Enhanced field mappings from Datalab AI analysis
  aiFieldMappings: jsonb("ai_field_mappings").$type<{
    fields: Array<{
      pdfFieldName: string;           // Original field name in PDF
      fieldType: "text" | "checkbox"; // Type of field
      label: string;                  // Human-readable label from PDF
      dataKey: string | null;         // Key in our profile data that matches
      confidence: number;             // Datalab's confidence score 0-1
      defaultValue?: string;          // Optional default if no profile data
    }>;
    lastAnalyzedAt: string;           // ISO timestamp
    analysisSource: "datalab" | "manual" | "gemini";
  }>(),
  datalabAnalyzed: boolean("datalab_analyzed").default(false),
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

export const insertHealthDistrictSchema = createInsertSchema(healthDistricts).omit({
  id: true,
  createdAt: true,
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

export type InsertHealthDistrict = z.infer<typeof insertHealthDistrictSchema>;
export type HealthDistrict = typeof healthDistricts.$inferSelect;

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

// Master Data Vault - Single source of truth for all permit application data
export const dataVaults = pgTable("data_vaults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  profileId: varchar("profile_id").references(() => profiles.id),
  
  // Business Information
  businessName: varchar("business_name", { length: 200 }),
  tradeName: varchar("trade_name", { length: 200 }),
  ownerName: varchar("owner_name", { length: 200 }),
  ownerTitle: varchar("owner_title", { length: 100 }),
  ein: varchar("ein", { length: 20 }),
  
  // Contact Information
  phone: varchar("phone", { length: 20 }),
  altPhone: varchar("alt_phone", { length: 20 }),
  email: varchar("email", { length: 200 }),
  
  // Mailing Address
  mailingStreet: varchar("mailing_street", { length: 200 }),
  mailingCity: varchar("mailing_city", { length: 100 }),
  mailingState: varchar("mailing_state", { length: 2 }),
  mailingZip: varchar("mailing_zip", { length: 10 }),
  
  // Business/Physical Address
  businessStreet: varchar("business_street", { length: 200 }),
  businessCity: varchar("business_city", { length: 100 }),
  businessState: varchar("business_state", { length: 2 }),
  businessZip: varchar("business_zip", { length: 10 }),
  
  // Vehicle Information
  vehicleType: vehicleTypeEnum("vehicle_type"),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleYear: varchar("vehicle_year", { length: 4 }),
  vehicleLicensePlate: varchar("vehicle_license_plate", { length: 20 }),
  vehicleVin: varchar("vehicle_vin", { length: 50 }),
  vehicleLength: varchar("vehicle_length", { length: 20 }),
  vehicleWidth: varchar("vehicle_width", { length: 20 }),
  
  // Operations & Equipment
  waterSupplyType: varchar("water_supply_type", { length: 50 }), // public, private, bottled
  waterTankCapacity: varchar("water_tank_capacity", { length: 50 }),
  wastewaterTankCapacity: varchar("wastewater_tank_capacity", { length: 50 }),
  hasPropane: boolean("has_propane").default(false),
  propaneDetails: text("propane_details"),
  hasFireExtinguisher: boolean("has_fire_extinguisher").default(true),
  hasThreeCompartmentSink: boolean("has_three_compartment_sink").default(false),
  hasHandwashSink: boolean("has_handwash_sink").default(true),
  hasHotHoldingEquipment: boolean("has_hot_holding_equipment").default(false),
  hotHoldingMethod: text("hot_holding_method"),
  hasColdHoldingEquipment: boolean("has_cold_holding_equipment").default(false),
  coldHoldingMethod: text("cold_holding_method"),
  sanitizerType: varchar("sanitizer_type", { length: 100 }),
  
  // Commissary Information
  commissaryName: varchar("commissary_name", { length: 200 }),
  commissaryAddress: text("commissary_address"),
  commissaryPhone: varchar("commissary_phone", { length: 20 }),
  commissaryContactName: varchar("commissary_contact_name", { length: 200 }),
  commissaryAgreementExpiry: timestamp("commissary_agreement_expiry"),
  
  // Prep & Food Info
  prepLocationAddress: text("prep_location_address"),
  prepLocationDescription: text("prep_location_description"),
  menuDescription: text("menu_description"),
  foodItemsList: text("food_items_list").array(),
  foodSourceLocations: text("food_source_locations").array(),
  
  // Certifications & Insurance
  foodHandlerCertNumber: varchar("food_handler_cert_number", { length: 100 }),
  foodHandlerCertExpiry: timestamp("food_handler_cert_expiry"),
  liabilityInsuranceCarrier: varchar("liability_insurance_carrier", { length: 200 }),
  liabilityInsurancePolicyNumber: varchar("liability_insurance_policy_number", { length: 100 }),
  liabilityInsuranceExpiry: timestamp("liability_insurance_expiry"),
  
  // Metadata about data quality
  confidenceScores: jsonb("confidence_scores").$type<Record<string, number>>(),
  fieldSources: jsonb("field_sources").$type<Record<string, string>>(),
  lastSyncedFromParsedLog: timestamp("last_synced_from_parsed_log"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Submission Jobs - Track permit submission attempts
export const submissionJobs = pgTable("submission_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  permitId: varchar("permit_id").references(() => permits.id),
  townId: varchar("town_id").references(() => towns.id),
  vaultId: varchar("vault_id").references(() => dataVaults.id),
  
  // Submission details
  submissionType: submissionTypeEnum("submission_type").notNull(),
  status: submissionStatusEnum("status").default("draft"),
  
  // Generated artifacts
  filledPdfData: text("filled_pdf_data"), // base64 of filled PDF
  filledPdfFilename: varchar("filled_pdf_filename", { length: 200 }),
  portalSessionData: jsonb("portal_session_data").$type<Record<string, unknown>>(),
  
  // Datalab integration
  datalabRequestId: varchar("datalab_request_id", { length: 100 }),
  datalabStatus: varchar("datalab_status", { length: 50 }),
  datalabResponse: jsonb("datalab_response").$type<Record<string, unknown>>(),
  
  // Portal automation
  portalCredentialId: varchar("portal_credential_id"),
  portalNavigationLog: jsonb("portal_navigation_log").$type<Array<{ step: string; timestamp: string; success: boolean; error?: string }>>(),
  
  // Review tracking
  previewGenerated: boolean("preview_generated").default(false),
  userReviewedAt: timestamp("user_reviewed_at"),
  userApproved: boolean("user_approved").default(false),
  submittedAt: timestamp("submitted_at"),
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Portal Credentials - Encrypted storage for ViewPoint/OpenGov logins
export const portalCredentials = pgTable("portal_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  townId: varchar("town_id").references(() => towns.id),
  portalProvider: portalProviderEnum("portal_provider"),
  
  // Encrypted credentials (use Replit secrets for encryption key)
  encryptedUsername: text("encrypted_username"),
  encryptedPassword: text("encrypted_password"),
  
  // Session management
  lastLoginAt: timestamp("last_login_at"),
  lastLoginSuccess: boolean("last_login_success"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations for new tables
export const dataVaultsRelations = relations(dataVaults, ({ one }) => ({
  profile: one(profiles, {
    fields: [dataVaults.profileId],
    references: [profiles.id],
  }),
}));

export const submissionJobsRelations = relations(submissionJobs, ({ one }) => ({
  permit: one(permits, {
    fields: [submissionJobs.permitId],
    references: [permits.id],
  }),
  town: one(towns, {
    fields: [submissionJobs.townId],
    references: [towns.id],
  }),
  vault: one(dataVaults, {
    fields: [submissionJobs.vaultId],
    references: [dataVaults.id],
  }),
}));

export const portalCredentialsRelations = relations(portalCredentials, ({ one }) => ({
  town: one(towns, {
    fields: [portalCredentials.townId],
    references: [towns.id],
  }),
}));

// Insert schemas for new tables
export const insertDataVaultSchema = createInsertSchema(dataVaults).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubmissionJobSchema = createInsertSchema(submissionJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPortalCredentialSchema = createInsertSchema(portalCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDataVault = z.infer<typeof insertDataVaultSchema>;
export type DataVault = typeof dataVaults.$inferSelect;

export type InsertSubmissionJob = z.infer<typeof insertSubmissionJobSchema>;
export type SubmissionJob = typeof submissionJobs.$inferSelect;

export type InsertPortalCredential = z.infer<typeof insertPortalCredentialSchema>;
export type PortalCredential = typeof portalCredentials.$inferSelect;
