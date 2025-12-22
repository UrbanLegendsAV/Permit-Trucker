import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const vehicleTypeEnum = pgEnum("vehicle_type", ["truck", "trailer"]);
export const permitTypeEnum = pgEnum("permit_type", ["yearly", "temporary", "seasonal"]);
export const permitStatusEnum = pgEnum("permit_status", ["draft", "pending", "approved", "expired", "rejected"]);
export const formTypeEnum = pgEnum("form_type", ["online_portal", "pdf_download", "mail_in"]);
export const badgeTypeEnum = pgEnum("badge_type", ["pioneer", "first_permit", "multi_town", "speed_demon", "helper"]);
export const badgeTierEnum = pgEnum("badge_tier", ["bronze", "silver", "gold"]);

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
  uploadsJson: jsonb("uploads_json").$type<{ documents: Array<{ name: string; type: string; url: string }> }>(),
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const badges = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  badgeType: badgeTypeEnum("badge_type").notNull(),
  tier: badgeTierEnum("tier").default("bronze"),
  townId: varchar("town_id").references(() => towns.id),
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
