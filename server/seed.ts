import { db } from "./db";
import { towns, configs, profiles, publicProfiles, reviews, foodTrucks } from "@shared/schema";
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

    // Seed directory listings for CT food trucks (upsert-safe)
    console.log("Seeding CT food truck directory listings...");

    const ctDirectoryTrucks = [
      {
        profileId: "dir-truck-01",
        userId: "dir-user-01",
        vehicleType: "truck" as const,
        vehicleName: "Zuppardi's Apizza",
        menuType: "Pizza",
      },
      {
        profileId: "dir-truck-02",
        userId: "dir-user-02",
        vehicleType: "truck" as const,
        vehicleName: "Ricky D's Rib Shack",
        menuType: "BBQ",
      },
      {
        profileId: "dir-truck-03",
        userId: "dir-user-03",
        vehicleType: "truck" as const,
        vehicleName: "Muy Guapo Tacos",
        menuType: "Mexican",
      },
      {
        profileId: "dir-truck-04",
        userId: "dir-user-04",
        vehicleType: "truck" as const,
        vehicleName: "Melt Mobile",
        menuType: "American",
      },
      {
        profileId: "dir-truck-05",
        userId: "dir-user-05",
        vehicleType: "truck" as const,
        vehicleName: "Hardcore Sweet Cupcakes",
        menuType: "Desserts",
      },
      {
        profileId: "dir-truck-06",
        userId: "dir-user-06",
        vehicleType: "truck" as const,
        vehicleName: "The Whey Station",
        menuType: "American",
      },
      {
        profileId: "dir-truck-07",
        userId: "dir-user-07",
        vehicleType: "truck" as const,
        vehicleName: "Taco Loco",
        menuType: "Mexican",
      },
      {
        profileId: "dir-truck-08",
        userId: "dir-user-08",
        vehicleType: "truck" as const,
        vehicleName: "Caseus Fromagerie",
        menuType: "American",
      },
      {
        profileId: "dir-truck-09",
        userId: "dir-user-09",
        vehicleType: "truck" as const,
        vehicleName: "Señor Sisig CT",
        menuType: "Fusion",
      },
      {
        profileId: "dir-truck-10",
        userId: "dir-user-10",
        vehicleType: "truck" as const,
        vehicleName: "Joey B's Food Truck",
        menuType: "American",
      },
      {
        profileId: "dir-truck-11",
        userId: "dir-user-11",
        vehicleType: "truck" as const,
        vehicleName: "Krust Pizza",
        menuType: "Pizza",
      },
      {
        profileId: "dir-truck-12",
        userId: "dir-user-12",
        vehicleType: "truck" as const,
        vehicleName: "Arethusa al tavolo Mobile",
        menuType: "Farm-to-Table",
      },
    ];

    for (const p of ctDirectoryTrucks) {
      await db.insert(profiles).values({
        id: p.profileId,
        userId: p.userId,
        vehicleType: p.vehicleType,
        vehicleName: p.vehicleName,
        menuType: p.menuType,
      }).onConflictDoNothing();
    }

    const ctPublicProfiles = [
      {
        id: "dir-public-01",
        profileId: "dir-truck-01",
        userId: "dir-user-01",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Zuppardi's Apizza",
        description: "Famous New Haven-style apizza since 1934. Wood-fired thin crust pizza from a legendary CT institution.",
        cuisineType: "Pizza",
        county: "New Haven",
        locationLat: "41.2733",
        locationLng: "-72.9476",
        locationAddress: "West Haven, CT",
        website: "https://www.zuppardisapizza.com",
      },
      {
        id: "dir-public-02",
        profileId: "dir-truck-02",
        userId: "dir-user-02",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Ricky D's Rib Shack",
        description: "Award-winning BBQ ribs, brisket, and pulled pork. A Connecticut BBQ institution.",
        cuisineType: "BBQ",
        county: "New Haven",
        locationLat: "41.3082",
        locationLng: "-72.9251",
        locationAddress: "New Haven, CT",
        website: "https://www.rickydsribshack.com",
      },
      {
        id: "dir-public-03",
        profileId: "dir-truck-03",
        userId: "dir-user-03",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Muy Guapo Tacos",
        description: "Authentic Mexican street food. Tacos, burritos, and quesadillas with homemade salsas.",
        cuisineType: "Mexican",
        county: "Fairfield",
        locationLat: "41.2049",
        locationLng: "-73.2060",
        locationAddress: "Bridgeport, CT",
        website: "https://www.muyguapotacos.com",
      },
      {
        id: "dir-public-04",
        profileId: "dir-truck-04",
        userId: "dir-user-04",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Melt Mobile",
        description: "Gourmet grilled cheese sandwiches and comfort food. Creative flavor combinations on artisan bread.",
        cuisineType: "American",
        county: "Hartford",
        locationLat: "41.7637",
        locationLng: "-72.6851",
        locationAddress: "Hartford, CT",
        website: "https://www.meltmobilect.com",
      },
      {
        id: "dir-public-05",
        profileId: "dir-truck-05",
        userId: "dir-user-05",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Hardcore Sweet Cupcakes",
        description: "Over-the-top cupcakes and desserts. Unique flavors and beautiful designs for events.",
        cuisineType: "Desserts",
        county: "Hartford",
        locationLat: "41.7480",
        locationLng: "-72.7457",
        locationAddress: "West Hartford, CT",
        website: "https://www.hardcoresweet.com",
      },
      {
        id: "dir-public-06",
        profileId: "dir-truck-06",
        userId: "dir-user-06",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "The Whey Station",
        description: "Artisanal grilled cheese truck. Locally sourced cheeses and creative sandwiches.",
        cuisineType: "American",
        county: "Middlesex",
        locationLat: "41.5565",
        locationLng: "-72.6557",
        locationAddress: "Middletown, CT",
        website: "https://www.thewheystation.com",
      },
      {
        id: "dir-public-07",
        profileId: "dir-truck-07",
        userId: "dir-user-07",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Taco Loco",
        description: "Authentic Mexican tacos, burritos, and Mexican street corn. Family recipes from Mexico City.",
        cuisineType: "Mexican",
        county: "New London",
        locationLat: "41.3557",
        locationLng: "-72.0995",
        locationAddress: "New London, CT",
        website: "https://www.tacolococt.com",
      },
      {
        id: "dir-public-08",
        profileId: "dir-truck-08",
        userId: "dir-user-08",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Caseus Fromagerie",
        description: "Cheese-focused food truck from the acclaimed New Haven restaurant. Mac & cheese, grilled cheese, cheese plates.",
        cuisineType: "American",
        county: "New Haven",
        locationLat: "41.3113",
        locationLng: "-72.9246",
        locationAddress: "New Haven, CT",
        website: "https://www.caseusnewhaven.com",
      },
      {
        id: "dir-public-09",
        profileId: "dir-truck-09",
        userId: "dir-user-09",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Señor Sisig CT",
        description: "Filipino-Mexican fusion. Burritos, tacos, and rice plates with a unique twist.",
        cuisineType: "Fusion",
        county: "Fairfield",
        locationLat: "41.1842",
        locationLng: "-73.1334",
        locationAddress: "Stratford, CT",
      },
      {
        id: "dir-public-10",
        profileId: "dir-truck-10",
        userId: "dir-user-10",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Joey B's Food Truck",
        description: "Classic American comfort food. Burgers, hot dogs, fries, and milkshakes done right.",
        cuisineType: "American",
        county: "Litchfield",
        locationLat: "41.5773",
        locationLng: "-73.4082",
        locationAddress: "New Milford, CT",
      },
      {
        id: "dir-public-11",
        profileId: "dir-truck-11",
        userId: "dir-user-11",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Krust Pizza",
        description: "Wood-fired Neapolitan pizza from a custom-built mobile oven. Fresh ingredients, crispy crust.",
        cuisineType: "Pizza",
        county: "Fairfield",
        locationLat: "41.2230",
        locationLng: "-73.2138",
        locationAddress: "Fairfield, CT",
      },
      {
        id: "dir-public-12",
        profileId: "dir-truck-12",
        userId: "dir-user-12",
        isPublic: true,
        isVerified: false,
        source: "directory",
        businessName: "Arethusa al tavolo Mobile",
        description: "Farm-to-table food truck from the renowned Arethusa Farm. Seasonal menus with local dairy and produce.",
        cuisineType: "Farm-to-Table",
        county: "Litchfield",
        locationLat: "41.7449",
        locationLng: "-73.2130",
        locationAddress: "Bantam, CT",
        website: "https://www.arethusaaltavolo.com",
      },
    ];

    for (const pub of ctPublicProfiles) {
      await db.insert(publicProfiles).values(pub).onConflictDoNothing();
    }
    console.log(`Seeded ${ctPublicProfiles.length} CT directory food trucks`);

    // Seed food_trucks table (CT Food Truck Directory)
    console.log("Seeding food_trucks directory...");
    const ctFoodTrucks = [
      {
        slug: "brazilian-bbq-boys",
        name: "Brazilian BBQ Boys",
        cuisine: "Brazilian BBQ",
        towns: ["Hartford", "West Hartford", "New Haven"],
        website: "https://www.brazilianbbqboys.com",
        instagramHandle: "@brazilianbbqboys",
        description: "Authentic Brazilian churrasco on wheels. Picanha, linguiça, and slow-roasted meats with chimichurri.",
        status: "claimed",
        source: "founder",
      },
      {
        slug: "taco-road-trip",
        name: "Taco Road Trip",
        cuisine: "Mexican",
        towns: ["Stamford", "Greenwich", "Norwalk"],
        description: "Street-style tacos made fresh to order. Carnitas, al pastor, and fish tacos with housemade salsa.",
        status: "unclaimed",
        source: "research",
      },
      {
        slug: "richs-wings-and-things",
        name: "Rich's Wings & Things",
        cuisine: "Wings / American",
        towns: ["Bridgeport", "New Haven", "Milford"],
        description: "Buffalo wings, tenders, and loaded fries. Sauces from mild to ghost pepper.",
        status: "unclaimed",
        source: "research",
      },
      {
        slug: "jesses-ice-cream-truck",
        name: "Jesse's Ice Cream Truck",
        cuisine: "Ice Cream / Desserts",
        towns: ["Glastonbury", "South Windsor", "Manchester"],
        description: "Soft serve, sundaes, and novelty ice cream. CT's favorite summer tradition.",
        status: "unclaimed",
        source: "research",
      },
      {
        slug: "nicky-zooks",
        name: "Nicky Zooks",
        cuisine: "American / Comfort Food",
        towns: ["Waterbury", "Naugatuck", "Ansonia"],
        description: "Loaded burgers, cheese steaks, and comfort food classics done the CT way.",
        status: "unclaimed",
        source: "research",
      },
      {
        slug: "fullmoon-taco-truck",
        name: "Fullmoon Taco Truck",
        cuisine: "Mexican",
        towns: ["New London", "Groton", "Norwich"],
        description: "Late-night tacos, burritos, and elotes. Open until the crowd goes home.",
        status: "unclaimed",
        source: "research",
      },
      {
        slug: "the-blind-rhino-food-truck",
        name: "The Blind Rhino Food Truck",
        cuisine: "Wings / BBQ",
        towns: ["Shelton", "Derby", "Ansonia"],
        website: "https://www.theblindrhino.com",
        description: "Extension of the Blind Rhino bar & grill. Craft wings, smash burgers, and street fries.",
        status: "unclaimed",
        source: "research",
      },
      {
        slug: "chefos-eatery",
        name: "Chefo's Eatery",
        cuisine: "Latin Fusion",
        towns: ["Hartford", "Bristol", "New Britain"],
        description: "Latin-inspired street food. Pernil tacos, tostones, arroz con pollo wraps, and fresh aguas frescas.",
        status: "unclaimed",
        source: "research",
      },
    ];
    for (const truck of ctFoodTrucks) {
      await db.insert(foodTrucks).values(truck).onConflictDoNothing();
    }
    console.log(`Seeded ${ctFoodTrucks.length} food trucks into directory`);

    await runFullCTSeed();
    
    // Seed default email/password user
    await seedDefaultUser();
  } catch (error) {
    console.error("Error seeding:", error);
  }
}
