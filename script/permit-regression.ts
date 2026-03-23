import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";

process.env.DATABASE_URL ||= "postgres://permitpilot:permitpilot@127.0.0.1:5432/permitpilot";

type ParsedFieldValue = {
  value: string | null;
};

type ParsedUserData = {
  contact_info?: Record<string, ParsedFieldValue>;
  operations?: Record<string, ParsedFieldValue>;
  safety?: Record<string, ParsedFieldValue>;
  menu_and_prep?: Record<string, ParsedFieldValue>;
  commissary_info?: Record<string, ParsedFieldValue>;
};

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const sampleParsedData: ParsedUserData = {
  contact_info: {
    business_name: { value: "PermitPilot Test Truck" },
    owner_name: { value: "Alex Operator" },
    applicant_name: { value: "Alex Operator" },
    email: { value: "alex@example.com" },
    phone: { value: "(203) 555-0100" },
    address: { value: "123 Main Street" },
    mailing_address: { value: "123 Main Street Hartford, CT 06103" },
    city: { value: "Hartford" },
    state: { value: "CT" },
    zip: { value: "06103" },
  },
  operations: {
    sanitizer_type: { value: "Bleach sanitizer" },
    sanitizing_method: { value: "Three-compartment sink with sanitizer test strips" },
    toilet_facilities: { value: "Portable restroom available on site" },
    water_supply_type: { value: "Self-contained fresh water tank" },
  },
  safety: {
    hot_holding_method: { value: "Steam table above 135F" },
    cold_storage_method: { value: "Commercial refrigerator below 41F" },
    waste_water_disposal: { value: "Disposed at commissary via approved drain" },
    temperature_monitoring_method: { value: "Digital probe thermometers" },
  },
  menu_and_prep: {
    food_items_list: { value: "BBQ sandwiches, rice bowls, fries" },
    prep_location: { value: "Commissary kitchen" },
    food_source_location: { value: "Restaurant Depot and Costco" },
  },
  commissary_info: {
    commissary_name: { value: "Test Commissary Kitchen" },
    commissary_address: { value: "456 Prep Ave, Hartford, CT 06106" },
  },
};

async function checkBuiltInTemplates(): Promise<CheckResult[]> {
  const { fillPdfForm, getAvailableTemplates, getTemplateById } = await import("../server/lib/pdf-service");
  const results: CheckResult[] = [];

  for (const templateInfo of getAvailableTemplates()) {
    const template = getTemplateById(templateInfo.formId);
    if (!template) {
      results.push({ name: templateInfo.formId, ok: false, detail: "Template definition missing" });
      continue;
    }

    const pdfPath = path.resolve(template.pdfPath);
    if (!fs.existsSync(pdfPath)) {
      results.push({ name: templateInfo.formId, ok: false, detail: `Missing PDF file: ${pdfPath}` });
      continue;
    }

    try {
      const output = await fillPdfForm(templateInfo.formId, sampleParsedData, {
        eventName: "Regression Test Event",
        eventAddress: "789 Event Way",
        eventDates: "04/10/2026 - 04/12/2026",
        hoursOfOperation: "10:00 AM - 6:00 PM",
        personInCharge: "Alex Operator",
        licenseType: "temporary",
      });

      if (!output || output.length < 1000) {
        results.push({ name: templateInfo.formId, ok: false, detail: "Generated PDF output was unexpectedly small" });
        continue;
      }

      const pdfDoc = await PDFDocument.load(output);
      results.push({
        name: templateInfo.formId,
        ok: true,
        detail: `Generated ${pdfDoc.getPageCount()} page output from ${path.basename(pdfPath)}`,
      });
    } catch (error: any) {
      results.push({ name: templateInfo.formId, ok: false, detail: error.message || "Template fill failed" });
    }
  }

  return results;
}

async function inspectCriticalAssets(): Promise<CheckResult[]> {
  const assetFiles = [
    "attached_assets/Fillable_TemporarySeasonal_Food_Service_License_Application_Fi_1766435479788.pdf",
    "attached_assets/Fillable_FOOD_SERVICE_PLAN_Review_Application_Packet_7-15-25_1766435479788.pdf",
    "attached_assets/Food_License_New-Chg_Owner-Renewal_Application_2025_Rev.7-10-2_1766435479789.pdf",
    "attached_assets/Temporary_Seasonal_Food_Service_License_Application_(4)_1766519430109.pdf",
    "attached_assets/Itinerant-Food-Vendor-Application-PDF_1766452214150.pdf",
  ];

  const results: CheckResult[] = [];

  for (const relativeFile of assetFiles) {
    const fullPath = path.resolve(relativeFile);
    if (!fs.existsSync(fullPath)) {
      results.push({ name: relativeFile, ok: false, detail: "File missing" });
      continue;
    }

    try {
      const bytes = fs.readFileSync(fullPath);
      const pdfDoc = await PDFDocument.load(bytes);
      const acroFields = pdfDoc.getForm().getFields().length;
      results.push({
        name: relativeFile,
        ok: true,
        detail: `${pdfDoc.getPageCount()} pages, ${acroFields} AcroForm fields`,
      });
    } catch (error: any) {
      results.push({ name: relativeFile, ok: false, detail: error.message || "Failed to inspect PDF asset" });
    }
  }

  return results;
}

async function main() {
  const checks = [
    ...(await checkBuiltInTemplates()),
    ...(await inspectCriticalAssets()),
  ];

  const failures = checks.filter((check) => !check.ok);

  console.log("\nPermit Regression Report");
  console.log("========================");
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name} :: ${check.detail}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} permit regression check(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${checks.length} permit regression checks passed.`);
}

main().catch((error) => {
  console.error("Permit regression runner failed:", error);
  process.exit(1);
});
