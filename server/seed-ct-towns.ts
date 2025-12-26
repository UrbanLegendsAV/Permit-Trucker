import { db } from "./db";
import { healthDistricts, towns } from "@shared/schema";
import { eq } from "drizzle-orm";

const ctHealthDistricts = [
  { name: "Eastern Highlands Health District", website: "ehhd.org" },
  { name: "Naugatuck Valley Health District", website: "nvhd.org" },
  { name: "Farmington Valley Health District", website: "fvhd.org" },
  { name: "Central Connecticut Health District", website: "ccthd.org" },
  { name: "Quinnipiack Valley Health District", website: "qvhd.org" },
  { name: "Bethel Health Dept.", website: "bethel-ct.gov" },
  { name: "Torrington Area Health District", website: "tahd.org" },
  { name: "West Hartford-Bloomfield District", website: "westhartfordct.gov" },
  { name: "Uncas Health District", website: "uncashd.org" },
  { name: "East Shore District Health", website: "esdhd.org" },
  { name: "Bridgeport Health & Social Services", website: "bridgeportct.gov" },
  { name: "Newtown Health District", website: "newtown-ct.gov/health-district" },
  { name: "Bristol-Burlington Health District", website: "bbhd.org" },
  { name: "Brookfield Health Dept.", website: "brookfieldct.gov" },
  { name: "Northeast District Health", website: "nddh.org" },
  { name: "Chesprocott Health District", website: "chesprocott.org" },
  { name: "CT River Area Health District", website: "crahd.org" },
  { name: "Chatham Health District", website: "chathamhealth.org" },
  { name: "Cromwell Health Dept.", website: "cromwellct.com" },
  { name: "Danbury Health & Human Services", website: "danbury-ct.gov" },
  { name: "Darien Health Dept.", website: "darienct.gov" },
  { name: "Durham Health Dept.", website: "townofdurhamct.org" },
  { name: "East Hartford Health Dept.", website: "easthartfordct.gov" },
  { name: "Ledge Light Health District", website: "llhd.org" },
  { name: "North Central Health District", website: "ncdhd.org" },
  { name: "Aspetuck Health District", website: "aspetuckhd.org" },
  { name: "Essex Health Dept.", website: "essexct.gov" },
  { name: "Fairfield Health Dept.", website: "fairfieldct.org" },
  { name: "Glastonbury Health Dept.", website: "glastonbury-ct.gov" },
  { name: "Greenwich Health Dept.", website: "greenwichct.gov" },
  { name: "Guilford Health Dept.", website: "ci.guilford.ct.us" },
  { name: "Hartford Health & Human Services", website: "hartfordct.gov" },
  { name: "Killingworth Health Dept.", website: "townofkillingworth.com" },
  { name: "Lyme Health Dept.", website: "townlyme.org" },
  { name: "Madison Health Dept.", website: "madisonct.org" },
  { name: "Manchester Health Dept.", website: "manchesterct.gov" },
  { name: "Meriden Health & Human Services", website: "meridenct.gov" },
  { name: "Middlebury Health Dept.", website: "middlebury-ct.org" },
  { name: "Middlefield Health Dept.", website: "middlefieldct.org" },
  { name: "Middletown Health Dept.", website: "middletownct.gov" },
  { name: "Milford Health Dept.", website: "ci.milford.ct.us" },
  { name: "Monroe Health Dept.", website: "monroect.org" },
  { name: "New Britain Health Dept.", website: "newbritainct.gov" },
  { name: "New Canaan Health Dept.", website: "newcanaan.info" },
  { name: "New Fairfield Health Dept.", website: "newfairfield.org" },
  { name: "New Haven Health Dept.", website: "newhavenct.gov" },
  { name: "Housatonic Valley Health District", website: "hvhd.us" },
  { name: "Norwalk Health Dept.", website: "norwalkct.org" },
  { name: "Orange Health Dept.", website: "orange-ct.gov" },
  { name: "Plainville-Southington District", website: "pshd.org" },
  { name: "Redding Health Dept.", website: "townofreddingct.org" },
  { name: "Ridgefield Health Dept.", website: "ridgefieldct.org" },
  { name: "Sherman Health Dept.", website: "townofshermanct.org" },
  { name: "South Windsor Health Dept.", website: "southwindsor-ct.gov" },
  { name: "Stamford Dept. of Health", website: "stamfordct.gov" },
  { name: "Stratford Health Dept.", website: "stratfordct.gov" },
  { name: "Trumbull Health Dept.", website: "trumbull-ct.gov" },
  { name: "Wallingford Health Dept.", website: "wallingfordct.gov" },
  { name: "Waterbury Health Dept.", website: "waterburyct.org" },
  { name: "Westbrook Health Dept.", website: "westbrookct.us" },
  { name: "Weston Health Dept.", website: "westonct.gov" },
  { name: "West Haven Health Dept.", website: "cityofwesthaven.com" },
  { name: "Wilton Health Dept.", website: "wiltonct.org" },
  { name: "Windsor Health Dept.", website: "townofwindsorct.com" },
];

const ctCountyMap: Record<string, string> = {
  "Andover": "Tolland", "Ansonia": "New Haven", "Ashford": "Windham", "Avon": "Hartford",
  "Barkhamsted": "Litchfield", "Beacon Falls": "New Haven", "Berlin": "Hartford", "Bethany": "New Haven",
  "Bethel": "Fairfield", "Bethlehem": "Litchfield", "Bloomfield": "Hartford", "Bolton": "Tolland",
  "Bozrah": "New London", "Branford": "New Haven", "Bridgeport": "Fairfield", "Bridgewater": "Litchfield",
  "Bristol": "Hartford", "Brookfield": "Fairfield", "Brooklyn": "Windham", "Burlington": "Hartford",
  "Canaan": "Litchfield", "Canterbury": "Windham", "Canton": "Hartford", "Chaplin": "Windham",
  "Cheshire": "New Haven", "Chester": "Middlesex", "Clinton": "Middlesex", "Colchester": "New London",
  "Colebrook": "Litchfield", "Columbia": "Tolland", "Cornwall": "Litchfield", "Coventry": "Tolland",
  "Cromwell": "Middlesex", "Danbury": "Fairfield", "Darien": "Fairfield", "Deep River": "Middlesex",
  "Derby": "New Haven", "Durham": "Middlesex", "East Granby": "Hartford", "East Haddam": "Middlesex",
  "East Hampton": "Middlesex", "East Hartford": "Hartford", "East Haven": "New Haven", "East Lyme": "New London",
  "East Windsor": "Hartford", "Eastford": "Windham", "Easton": "Fairfield", "Ellington": "Tolland",
  "Enfield": "Hartford", "Essex": "Middlesex", "Fairfield": "Fairfield", "Farmington": "Hartford",
  "Franklin": "New London", "Glastonbury": "Hartford", "Goshen": "Litchfield", "Granby": "Hartford",
  "Greenwich": "Fairfield", "Griswold": "New London", "Groton": "New London", "Guilford": "New Haven",
  "Haddam": "Middlesex", "Hamden": "New Haven", "Hampton": "Windham", "Hartford": "Hartford",
  "Hartland": "Hartford", "Harwinton": "Litchfield", "Hebron": "Tolland", "Kent": "Litchfield",
  "Killingly": "Windham", "Killingworth": "Middlesex", "Lebanon": "New London", "Ledyard": "New London",
  "Lisbon": "New London", "Litchfield": "Litchfield", "Lyme": "New London", "Madison": "New Haven",
  "Manchester": "Hartford", "Mansfield": "Tolland", "Marlborough": "Hartford", "Meriden": "New Haven",
  "Middlebury": "New Haven", "Middlefield": "Middlesex", "Middletown": "Middlesex", "Milford": "New Haven",
  "Monroe": "Fairfield", "Montville": "New London", "Morris": "Litchfield", "Naugatuck": "New Haven",
  "New Britain": "Hartford", "New Canaan": "Fairfield", "New Fairfield": "Fairfield", "New Hartford": "Litchfield",
  "New Haven": "New Haven", "New London": "New London", "New Milford": "Litchfield", "Newington": "Hartford",
  "Newtown": "Fairfield", "Norfolk": "Litchfield", "North Branford": "New Haven", "North Canaan": "Litchfield",
  "North Haven": "New Haven", "North Stonington": "New London", "Norwalk": "Fairfield", "Norwich": "New London",
  "Old Lyme": "New London", "Old Saybrook": "Middlesex", "Orange": "New Haven", "Oxford": "New Haven",
  "Plainfield": "Windham", "Plainville": "Hartford", "Plymouth": "Litchfield", "Pomfret": "Windham",
  "Portland": "Middlesex", "Preston": "New London", "Prospect": "New Haven", "Putnam": "Windham",
  "Redding": "Fairfield", "Ridgefield": "Fairfield", "Rocky Hill": "Hartford", "Roxbury": "Litchfield",
  "Salem": "New London", "Salisbury": "Litchfield", "Scotland": "Windham", "Seymour": "New Haven",
  "Sharon": "Litchfield", "Shelton": "Fairfield", "Sherman": "Fairfield", "Simsbury": "Hartford",
  "Somers": "Tolland", "South Windsor": "Hartford", "Southbury": "New Haven", "Southington": "Hartford",
  "Sprague": "New London", "Stafford": "Tolland", "Stamford": "Fairfield", "Sterling": "Windham",
  "Stonington": "New London", "Stratford": "Fairfield", "Suffield": "Hartford", "Thomaston": "Litchfield",
  "Thompson": "Windham", "Tolland": "Tolland", "Torrington": "Litchfield", "Trumbull": "Fairfield",
  "Union": "Tolland", "Vernon": "Tolland", "Voluntown": "New London", "Wallingford": "New Haven",
  "Warren": "Litchfield", "Washington": "Litchfield", "Waterbury": "New Haven", "Waterford": "New London",
  "Watertown": "Litchfield", "West Hartford": "Hartford", "West Haven": "New Haven", "Westbrook": "Middlesex",
  "Weston": "Fairfield", "Westport": "Fairfield", "Wethersfield": "Hartford", "Willington": "Tolland",
  "Wilton": "Fairfield", "Winchester": "Litchfield", "Windham": "Windham", "Windsor": "Hartford",
  "Windsor Locks": "Hartford", "Wolcott": "New Haven", "Woodbridge": "New Haven", "Woodbury": "Litchfield",
  "Woodstock": "Windham"
};

const ctTownData = [
  { town: "Andover", district: "Eastern Highlands Health District" },
  { town: "Ansonia", district: "Naugatuck Valley Health District" },
  { town: "Ashford", district: "Eastern Highlands Health District" },
  { town: "Avon", district: "Farmington Valley Health District" },
  { town: "Barkhamsted", district: "Farmington Valley Health District" },
  { town: "Beacon Falls", district: "Naugatuck Valley Health District" },
  { town: "Berlin", district: "Central Connecticut Health District" },
  { town: "Bethany", district: "Quinnipiack Valley Health District" },
  { town: "Bethel", district: "Bethel Health Dept." },
  { town: "Bethlehem", district: "Torrington Area Health District" },
  { town: "Bloomfield", district: "West Hartford-Bloomfield District" },
  { town: "Bolton", district: "Eastern Highlands Health District" },
  { town: "Bozrah", district: "Uncas Health District" },
  { town: "Branford", district: "East Shore District Health" },
  { town: "Bridgeport", district: "Bridgeport Health & Social Services" },
  { town: "Bridgewater", district: "Newtown Health District" },
  { town: "Bristol", district: "Bristol-Burlington Health District" },
  { town: "Brookfield", district: "Brookfield Health Dept." },
  { town: "Brooklyn", district: "Northeast District Health" },
  { town: "Burlington", district: "Bristol-Burlington Health District" },
  { town: "Canaan", district: "Torrington Area Health District" },
  { town: "Canterbury", district: "Northeast District Health" },
  { town: "Canton", district: "Farmington Valley Health District" },
  { town: "Chaplin", district: "Eastern Highlands Health District" },
  { town: "Cheshire", district: "Chesprocott Health District" },
  { town: "Chester", district: "CT River Area Health District" },
  { town: "Clinton", district: "CT River Area Health District" },
  { town: "Colchester", district: "Chatham Health District" },
  { town: "Colebrook", district: "Farmington Valley Health District" },
  { town: "Columbia", district: "Eastern Highlands Health District" },
  { town: "Cornwall", district: "Torrington Area Health District" },
  { town: "Coventry", district: "Eastern Highlands Health District" },
  { town: "Cromwell", district: "Cromwell Health Dept." },
  { town: "Danbury", district: "Danbury Health & Human Services" },
  { town: "Darien", district: "Darien Health Dept." },
  { town: "Deep River", district: "CT River Area Health District" },
  { town: "Derby", district: "Naugatuck Valley Health District" },
  { town: "Durham", district: "Durham Health Dept." },
  { town: "East Granby", district: "Farmington Valley Health District" },
  { town: "East Haddam", district: "Chatham Health District" },
  { town: "East Hampton", district: "Chatham Health District" },
  { town: "East Hartford", district: "East Hartford Health Dept." },
  { town: "East Haven", district: "East Shore District Health" },
  { town: "East Lyme", district: "Ledge Light Health District" },
  { town: "East Windsor", district: "North Central Health District" },
  { town: "Eastford", district: "Northeast District Health" },
  { town: "Easton", district: "Aspetuck Health District" },
  { town: "Ellington", district: "North Central Health District" },
  { town: "Enfield", district: "North Central Health District" },
  { town: "Essex", district: "Essex Health Dept." },
  { town: "Fairfield", district: "Fairfield Health Dept." },
  { town: "Farmington", district: "Farmington Valley Health District" },
  { town: "Franklin", district: "Uncas Health District" },
  { town: "Glastonbury", district: "Glastonbury Health Dept." },
  { town: "Goshen", district: "Torrington Area Health District" },
  { town: "Granby", district: "Farmington Valley Health District" },
  { town: "Greenwich", district: "Greenwich Health Dept." },
  { town: "Griswold", district: "Uncas Health District" },
  { town: "Groton", district: "Ledge Light Health District" },
  { town: "Guilford", district: "Guilford Health Dept." },
  { town: "Haddam", district: "CT River Area Health District" },
  { town: "Hamden", district: "Quinnipiack Valley Health District" },
  { town: "Hampton", district: "Northeast District Health" },
  { town: "Hartford", district: "Hartford Health & Human Services" },
  { town: "Hartland", district: "Farmington Valley Health District" },
  { town: "Harwinton", district: "Torrington Area Health District" },
  { town: "Hebron", district: "Chatham Health District" },
  { town: "Kent", district: "Torrington Area Health District" },
  { town: "Killingly", district: "Northeast District Health" },
  { town: "Killingworth", district: "Killingworth Health Dept." },
  { town: "Lebanon", district: "Uncas Health District" },
  { town: "Ledyard", district: "Ledge Light Health District" },
  { town: "Lisbon", district: "Uncas Health District" },
  { town: "Litchfield", district: "Torrington Area Health District" },
  { town: "Lyme", district: "Lyme Health Dept." },
  { town: "Madison", district: "Madison Health Dept." },
  { town: "Manchester", district: "Manchester Health Dept." },
  { town: "Mansfield", district: "Eastern Highlands Health District" },
  { town: "Marlborough", district: "Chatham Health District" },
  { town: "Meriden", district: "Meriden Health & Human Services" },
  { town: "Middlebury", district: "Middlebury Health Dept." },
  { town: "Middlefield", district: "Middlefield Health Dept." },
  { town: "Middletown", district: "Middletown Health Dept." },
  { town: "Milford", district: "Milford Health Dept." },
  { town: "Monroe", district: "Monroe Health Dept." },
  { town: "Montville", district: "Uncas Health District" },
  { town: "Morris", district: "Torrington Area Health District" },
  { town: "Naugatuck", district: "Naugatuck Valley Health District" },
  { town: "New Britain", district: "New Britain Health Dept." },
  { town: "New Canaan", district: "New Canaan Health Dept." },
  { town: "New Fairfield", district: "New Fairfield Health Dept." },
  { town: "New Hartford", district: "Farmington Valley Health District" },
  { town: "New Haven", district: "New Haven Health Dept." },
  { town: "New London", district: "Ledge Light Health District" },
  { town: "New Milford", district: "Housatonic Valley Health District" },
  { town: "Newington", district: "Central Connecticut Health District" },
  { town: "Newtown", district: "Newtown Health District" },
  { town: "Norfolk", district: "Torrington Area Health District" },
  { town: "North Branford", district: "East Shore District Health" },
  { town: "North Canaan", district: "Torrington Area Health District" },
  { town: "North Haven", district: "Quinnipiack Valley Health District" },
  { town: "North Stonington", district: "Ledge Light Health District" },
  { town: "Norwalk", district: "Norwalk Health Dept." },
  { town: "Norwich", district: "Uncas Health District" },
  { town: "Old Lyme", district: "Ledge Light Health District" },
  { town: "Old Saybrook", district: "CT River Area Health District" },
  { town: "Orange", district: "Orange Health Dept." },
  { town: "Oxford", district: "Housatonic Valley Health District" },
  { town: "Plainfield", district: "Northeast District Health" },
  { town: "Plainville", district: "Plainville-Southington District" },
  { town: "Plymouth", district: "Torrington Area Health District" },
  { town: "Pomfret", district: "Northeast District Health" },
  { town: "Portland", district: "Chatham Health District" },
  { town: "Preston", district: "Uncas Health District" },
  { town: "Prospect", district: "Chesprocott Health District" },
  { town: "Putnam", district: "Northeast District Health" },
  { town: "Redding", district: "Redding Health Dept." },
  { town: "Ridgefield", district: "Ridgefield Health Dept." },
  { town: "Rocky Hill", district: "Central Connecticut Health District" },
  { town: "Roxbury", district: "Newtown Health District" },
  { town: "Salem", district: "Uncas Health District" },
  { town: "Salisbury", district: "Torrington Area Health District" },
  { town: "Scotland", district: "Eastern Highlands Health District" },
  { town: "Seymour", district: "Naugatuck Valley Health District" },
  { town: "Sharon", district: "Housatonic Valley Health District" },
  { town: "Shelton", district: "Naugatuck Valley Health District" },
  { town: "Sherman", district: "Sherman Health Dept." },
  { town: "Simsbury", district: "Farmington Valley Health District" },
  { town: "Somers", district: "North Central Health District" },
  { town: "South Windsor", district: "South Windsor Health Dept." },
  { town: "Southbury", district: "Housatonic Valley Health District" },
  { town: "Southington", district: "Plainville-Southington District" },
  { town: "Sprague", district: "Uncas Health District" },
  { town: "Stafford", district: "North Central Health District" },
  { town: "Stamford", district: "Stamford Dept. of Health" },
  { town: "Sterling", district: "Northeast District Health" },
  { town: "Stonington", district: "Ledge Light Health District" },
  { town: "Stratford", district: "Stratford Health Dept." },
  { town: "Suffield", district: "North Central Health District" },
  { town: "Thomaston", district: "Torrington Area Health District" },
  { town: "Thompson", district: "Northeast District Health" },
  { town: "Tolland", district: "Eastern Highlands Health District" },
  { town: "Torrington", district: "Torrington Area Health District" },
  { town: "Trumbull", district: "Trumbull Health Dept." },
  { town: "Union", district: "Northeast District Health" },
  { town: "Vernon", district: "North Central Health District" },
  { town: "Voluntown", district: "Uncas Health District" },
  { town: "Wallingford", district: "Wallingford Health Dept." },
  { town: "Warren", district: "Torrington Area Health District" },
  { town: "Washington", district: "Housatonic Valley Health District" },
  { town: "Waterbury", district: "Waterbury Health Dept." },
  { town: "Waterford", district: "Ledge Light Health District" },
  { town: "Watertown", district: "Torrington Area Health District" },
  { town: "West Hartford", district: "West Hartford-Bloomfield District" },
  { town: "West Haven", district: "West Haven Health Dept." },
  { town: "Westbrook", district: "Westbrook Health Dept." },
  { town: "Weston", district: "Weston Health Dept." },
  { town: "Westport", district: "Aspetuck Health District" },
  { town: "Wethersfield", district: "Central Connecticut Health District" },
  { town: "Willington", district: "Eastern Highlands Health District" },
  { town: "Wilton", district: "Wilton Health Dept." },
  { town: "Winchester", district: "Torrington Area Health District" },
  { town: "Windham", district: "Uncas Health District" },
  { town: "Windsor", district: "Windsor Health Dept." },
  { town: "Windsor Locks", district: "North Central Health District" },
  { town: "Wolcott", district: "Chesprocott Health District" },
  { town: "Woodbridge", district: "Quinnipiack Valley Health District" },
  { town: "Woodbury", district: "Housatonic Valley Health District" },
  { town: "Woodstock", district: "Northeast District Health" },
];

export async function seedHealthDistricts() {
  console.log("Seeding health districts...");
  
  const districtMap = new Map<string, string>();
  
  for (const district of ctHealthDistricts) {
    const existing = await db.select().from(healthDistricts).where(eq(healthDistricts.name, district.name)).limit(1);
    
    if (existing.length === 0) {
      const [inserted] = await db.insert(healthDistricts).values({
        name: district.name,
        website: `https://${district.website}`,
      }).returning();
      districtMap.set(district.name, inserted.id);
      console.log(`  Created district: ${district.name}`);
    } else {
      districtMap.set(district.name, existing[0].id);
    }
  }
  
  return districtMap;
}

export async function seedAllCTTowns(districtMap: Map<string, string>) {
  console.log("Seeding all CT towns...");
  
  let created = 0;
  let updated = 0;
  
  for (const data of ctTownData) {
    const county = ctCountyMap[data.town] || "Unknown";
    const districtId = districtMap.get(data.district);
    const districtInfo = ctHealthDistricts.find(d => d.name === data.district);
    const website = districtInfo ? `https://${districtInfo.website}` : null;
    
    const existing = await db.select().from(towns).where(eq(towns.townName, data.town)).limit(1);
    
    if (existing.length === 0) {
      await db.insert(towns).values({
        state: "CT",
        county,
        townName: data.town,
        permitTypes: ["yearly", "temporary"],
        portalUrl: website,
        formType: "pdf_download",
        healthDistrictId: districtId,
        healthDistrictName: data.district,
        confidenceScore: 30,
        requirementsJson: {
          coi: true,
          background: false,
          healthInspection: true,
          fireInspection: false,
          vehicleInspection: false,
          commissaryLetter: true,
          menuRequired: true,
          fees: { yearly: 100, temporary: 50 },
          notes: ["Verify requirements with health district"],
        },
      });
      created++;
    } else {
      await db.update(towns).set({
        healthDistrictId: districtId,
        healthDistrictName: data.district,
        portalUrl: existing[0].portalUrl || website,
      }).where(eq(towns.id, existing[0].id));
      updated++;
    }
  }
  
  console.log(`  Created ${created} new towns, updated ${updated} existing towns`);
}

export async function runFullCTSeed() {
  console.log("Starting full CT town seed...");
  const districtMap = await seedHealthDistricts();
  await seedAllCTTowns(districtMap);
  console.log("CT town seed complete!");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFullCTSeed().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
