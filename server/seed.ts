import { db } from "./db";
import { towns, configs, profiles, publicProfiles, reviews } from "@shared/schema";
import { users } from "@shared/models/auth";
import { runFullCTSeed } from "./seed-ct-towns";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

// Seed the default user for email/password login
async function seedDefaultUser() {
  const email = "23luis.leite@gmail.com";
  const password = "Permittracker2025!";
  
  try {
    // Check if user already exists
    const [existingUser] = await db.select().from(users).where(eq(users.email, email));
    
    if (existingUser) {
      // Update password if user exists but doesn't have password
      if (!existingUser.passwordHash) {
        const passwordHash = await bcrypt.hash(password, 10);
        await db.update(users)
          .set({ passwordHash, authProvider: "email" })
          .where(eq(users.email, email));
        console.log(`Updated password for user: ${email}`);
      } else {
        console.log(`User ${email} already exists with password`);
      }
      return;
    }
    
    // Create new user
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      email,
      passwordHash,
      firstName: "Luis",
      lastName: "Leite",
      authProvider: "email",
      role: "owner",
    });
    console.log(`Created default user: ${email}`);
  } catch (error) {
    console.error("Error seeding default user:", error);
  }
}

const ctTowns = [
  {
    state: "CT",
    county: "Fairfield",
    townName: "Bethel",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: "https://bethel-ct.gov/?SEC=B6C10D79-A9D5-41BA-AB9A-934BA60CAB2D",
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: false,
      menuRequired: true,
      fees: { yearly: 175, temporary: 75, seasonal: 100 },
      notes: [
        "CFPM certificate required for Class 2, 3, and 4",
        "24-hour emergency contact required",
        "Submit to Bethel Health Department",
        "License not issued if taxes delinquent 1+ years"
      ],
    },
    confidenceScore: 90,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Danbury",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: "https://danburyct-health.viewpointcloud.com",
    formType: "online_portal" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 150, temporary: 50, seasonal: 100 },
      notes: ["Must apply 30 days in advance"],
    },
    confidenceScore: 85,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Stamford",
    permitTypes: ["yearly", "temporary"],
    portalUrl: "https://www.stamfordct.gov/health",
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: true,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: true,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 200, temporary: 75 },
      notes: ["Background check required for all operators"],
    },
    confidenceScore: 90,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Norwalk",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: null,
    formType: "mail_in" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 175, temporary: 60, seasonal: 125 },
      notes: ["Mail applications to Health Department"],
    },
    confidenceScore: 75,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Bridgeport",
    permitTypes: ["yearly", "temporary"],
    portalUrl: "https://www.bridgeportct.gov",
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: true,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: true,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 180, temporary: 65 },
      notes: ["Police clearance required"],
    },
    confidenceScore: 80,
  },
  {
    state: "CT",
    county: "New Haven",
    townName: "New Haven",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: "https://www.newhavenct.gov/health",
    formType: "online_portal" as const,
    requirementsJson: {
      coi: true,
      background: true,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: true,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 250, temporary: 100, seasonal: 175 },
      notes: ["Yale event permits require additional approval"],
    },
    confidenceScore: 92,
  },
  {
    state: "CT",
    county: "Hartford",
    townName: "Hartford",
    permitTypes: ["yearly", "temporary"],
    portalUrl: "https://www.hartfordct.gov",
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: true,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 200, temporary: 80 },
      notes: ["Downtown permits limited availability"],
    },
    confidenceScore: 88,
  },
  {
    state: "CT",
    county: "Hartford",
    townName: "West Hartford",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 175, temporary: 50, seasonal: 125 },
      notes: [],
    },
    confidenceScore: 70,
  },
  {
    state: "CT",
    county: "New London",
    townName: "New London",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "mail_in" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: false,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 125, temporary: 40 },
      notes: [],
    },
    confidenceScore: 55,
  },
  {
    state: "CT",
    county: "Litchfield",
    townName: "Torrington",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: false,
      fees: { yearly: 100, temporary: 35 },
      notes: [],
    },
    confidenceScore: 45,
  },
  {
    state: "CT",
    county: "Middlesex",
    townName: "Middletown",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 150, temporary: 50, seasonal: 100 },
      notes: ["Wesleyan campus events require university approval"],
    },
    confidenceScore: 65,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Greenwich",
    permitTypes: ["yearly", "temporary"],
    portalUrl: "https://www.greenwichct.gov",
    formType: "online_portal" as const,
    requirementsJson: {
      coi: true,
      background: true,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: true,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 300, temporary: 125 },
      notes: ["Higher insurance requirements", "Location approval required"],
    },
    confidenceScore: 85,
  },
  {
    state: "CT",
    county: "New Haven",
    townName: "Milford",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 140, temporary: 45, seasonal: 95 },
      notes: ["Beach permits seasonal only"],
    },
    confidenceScore: 72,
  },
  {
    state: "CT",
    county: "New Haven",
    townName: "Hamden",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 135, temporary: 50 },
      notes: [],
    },
    confidenceScore: 60,
  },
  {
    state: "CT",
    county: "Hartford",
    townName: "Manchester",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 150, temporary: 55 },
      notes: [],
    },
    confidenceScore: 58,
  },
  {
    state: "CT",
    county: "Hartford",
    townName: "Bristol",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "mail_in" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: false,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 120, temporary: 40 },
      notes: [],
    },
    confidenceScore: 50,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Westport",
    permitTypes: ["yearly", "temporary"],
    portalUrl: "https://www.westportct.gov",
    formType: "online_portal" as const,
    requirementsJson: {
      coi: true,
      background: true,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: true,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 275, temporary: 100 },
      notes: ["Limited locations approved for food trucks"],
    },
    confidenceScore: 82,
  },
  {
    state: "CT",
    county: "Fairfield",
    townName: "Fairfield",
    permitTypes: ["yearly", "temporary", "seasonal"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 175, temporary: 60, seasonal: 120 },
      notes: [],
    },
    confidenceScore: 68,
  },
  {
    state: "CT",
    county: "New Haven",
    townName: "Wallingford",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: false,
      fees: { yearly: 130, temporary: 45 },
      notes: [],
    },
    confidenceScore: 55,
  },
  {
    state: "CT",
    county: "Hartford",
    townName: "Enfield",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "mail_in" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: false,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 110, temporary: 35 },
      notes: [],
    },
    confidenceScore: 42,
  },
  {
    state: "CT",
    county: "New Haven",
    townName: "Meriden",
    permitTypes: ["yearly", "temporary"],
    portalUrl: null,
    formType: "pdf_download" as const,
    requirementsJson: {
      coi: true,
      background: false,
      healthInspection: true,
      fireInspection: true,
      vehicleInspection: false,
      commissaryLetter: true,
      menuRequired: true,
      fees: { yearly: 125, temporary: 40 },
      notes: [],
    },
    confidenceScore: 52,
  },
];

const defaultConfigs = [
  { key: "pro_price", value: "99", description: "Pro plan monthly price in USD" },
  { key: "basic_price", value: "0", description: "Basic plan monthly price in USD" },
  { key: "max_vehicles", value: "5", description: "Maximum vehicles per user" },
  { key: "pioneer_threshold", value: "60", description: "Confidence score below which users earn Pioneer badge" },
];

export async function seedTowns() {
  try {
    const existingTowns = await db.select().from(towns);
    if (existingTowns.length > 0) {
      console.log(`Towns already seeded (${existingTowns.length} towns found)`);
    } else {
      console.log("Seeding CT towns...");
      for (const town of ctTowns) {
        await db.insert(towns).values(town);
      }
      console.log(`Seeded ${ctTowns.length} CT towns`);
    }

    // Seed default configs
    const existingConfigs = await db.select().from(configs);
    if (existingConfigs.length === 0) {
      console.log("Seeding default configs...");
      for (const config of defaultConfigs) {
        await db.insert(configs).values(config);
      }
      console.log(`Seeded ${defaultConfigs.length} default configs`);
    }

    // Seed sample public profiles for demo (only if none exist)
    const existingPublicProfiles = await db.select().from(publicProfiles);
    if (existingPublicProfiles.length === 0) {
      console.log("Seeding sample public profiles...");
      
      // Create sample vehicle profiles first
      const sampleProfiles = [
        {
          id: "demo-profile-1",
          userId: "demo-user-1",
          vehicleType: "truck" as const,
          vehicleName: "Taco Loco CT",
          menuType: "Mexican Street Food",
        },
        {
          id: "demo-profile-2",
          userId: "demo-user-2",
          vehicleType: "truck" as const,
          vehicleName: "The Lobster Roll",
          menuType: "Seafood",
        },
        {
          id: "demo-profile-3",
          userId: "demo-user-3",
          vehicleType: "trailer" as const,
          vehicleName: "BBQ Brothers",
          menuType: "Southern BBQ",
        },
      ];

      for (const profile of sampleProfiles) {
        await db.insert(profiles).values(profile).onConflictDoNothing();
      }

      // Create public profiles with CT locations
      const samplePublicProfiles = [
        {
          id: "demo-public-1",
          profileId: "demo-profile-1",
          userId: "demo-user-1",
          isPublic: true,
          businessName: "Taco Loco CT",
          description: "Authentic Mexican street tacos, burritos, and quesadillas made fresh daily!",
          locationLat: "41.3083",
          locationLng: "-72.9279",
          locationAddress: "New Haven Green, New Haven, CT",
          phoneNumber: "(203) 555-0123",
          menuJson: {
            items: [
              { name: "Street Tacos (3)", price: 10, description: "Choice of carne asada, carnitas, or pollo" },
              { name: "Burrito Grande", price: 12, description: "Rice, beans, meat, cheese, sour cream" },
              { name: "Quesadilla", price: 9, description: "Grilled with cheese and your choice of meat" },
            ],
          },
          hours: {
            monday: { open: "11:00", close: "20:00" },
            tuesday: { open: "11:00", close: "20:00" },
            wednesday: { open: "11:00", close: "20:00" },
            thursday: { open: "11:00", close: "21:00" },
            friday: { open: "11:00", close: "22:00" },
            saturday: { open: "12:00", close: "22:00" },
            sunday: { open: "12:00", close: "18:00", closed: true },
          },
        },
        {
          id: "demo-public-2",
          profileId: "demo-profile-2",
          userId: "demo-user-2",
          isPublic: true,
          businessName: "The Lobster Roll",
          description: "Fresh Connecticut lobster rolls and seafood favorites. Catch of the day!",
          locationLat: "41.0534",
          locationLng: "-73.5387",
          locationAddress: "Stamford Downtown, Stamford, CT",
          phoneNumber: "(203) 555-0456",
          menuJson: {
            items: [
              { name: "CT Lobster Roll", price: 24, description: "Fresh lobster, butter, toasted roll" },
              { name: "Clam Chowder", price: 8, description: "New England style, creamy and hearty" },
              { name: "Fish & Chips", price: 16, description: "Beer-battered cod with fries" },
            ],
          },
          hours: {
            monday: { open: "11:00", close: "19:00" },
            tuesday: { open: "11:00", close: "19:00" },
            wednesday: { open: "11:00", close: "19:00" },
            thursday: { open: "11:00", close: "20:00" },
            friday: { open: "11:00", close: "21:00" },
            saturday: { open: "11:00", close: "21:00" },
            sunday: { open: "12:00", close: "18:00" },
          },
        },
        {
          id: "demo-public-3",
          profileId: "demo-profile-3",
          userId: "demo-user-3",
          isPublic: true,
          businessName: "BBQ Brothers",
          description: "Low and slow smoked meats, homemade sauces, and classic Southern sides.",
          locationLat: "41.7658",
          locationLng: "-72.6734",
          locationAddress: "Bushnell Park, Hartford, CT",
          phoneNumber: "(860) 555-0789",
          menuJson: {
            items: [
              { name: "Brisket Plate", price: 18, description: "Slow-smoked 14hr brisket with 2 sides" },
              { name: "Pulled Pork Sandwich", price: 12, description: "House-smoked with Carolina sauce" },
              { name: "Rib Tips", price: 14, description: "Tender tips with dry rub" },
            ],
          },
          hours: {
            monday: { open: "11:00", close: "15:00", closed: true },
            tuesday: { open: "11:00", close: "20:00" },
            wednesday: { open: "11:00", close: "20:00" },
            thursday: { open: "11:00", close: "20:00" },
            friday: { open: "11:00", close: "21:00" },
            saturday: { open: "11:00", close: "21:00" },
            sunday: { open: "12:00", close: "18:00" },
          },
        },
      ];

      for (const pub of samplePublicProfiles) {
        await db.insert(publicProfiles).values(pub).onConflictDoNothing();
      }

      // Create sample reviews
      const sampleReviews = [
        {
          publicProfileId: "demo-public-1",
          rating: 5,
          text: "Best tacos in Connecticut! The carne asada is incredible.",
          reviewerName: "FoodieJohn",
          status: "approved" as const,
        },
        {
          publicProfileId: "demo-public-1",
          rating: 4,
          text: "Great food, friendly service. Will definitely come back!",
          reviewerName: "Sarah M.",
          status: "approved" as const,
        },
        {
          publicProfileId: "demo-public-2",
          rating: 5,
          text: "The lobster roll is worth every penny. So fresh!",
          reviewerName: "SeafoodLover",
          status: "approved" as const,
        },
        {
          publicProfileId: "demo-public-3",
          rating: 5,
          text: "Real deal BBQ! The brisket melts in your mouth.",
          reviewerName: "BBQFan",
          status: "approved" as const,
        },
        {
          publicProfileId: "demo-public-3",
          rating: 4,
          text: "Solid pulled pork. Lines can be long but worth the wait.",
          reviewerName: "Mike T.",
          status: "approved" as const,
        },
      ];

      for (const review of sampleReviews) {
        await db.insert(reviews).values(review);
      }

      console.log(`Seeded 3 sample public profiles and ${sampleReviews.length} reviews`);
    }
    
    await runFullCTSeed();
    
    // Seed default email/password user
    await seedDefaultUser();
  } catch (error) {
    console.error("Error seeding:", error);
  }
}
