import { storage } from "../storage";
import type { SubmissionJob, DataVault, PortalCredential, Town, TownForm, Profile } from "@shared/schema";
import { getVaultDataForPdfFill } from "./vault-service";
import crypto from "crypto";
import type { Page, Browser } from "playwright";

const ENCRYPTION_KEY = process.env.PORTAL_ENCRYPTION_KEY || process.env.SESSION_SECRET;

function getEncryptionKey(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 16) {
    throw new Error("Portal encryption key not configured or too short. Set PORTAL_ENCRYPTION_KEY or SESSION_SECRET environment variable.");
  }
  return crypto.scryptSync(ENCRYPTION_KEY, "permittruck-portal-salt", 32);
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function storePortalCredentials(
  userId: string,
  townId: string,
  username: string,
  password: string
): Promise<PortalCredential> {
  if (!username || !password) {
    throw new Error("Username and password are required");
  }
  
  const town = await storage.getTown(townId);
  if (!town) {
    throw new Error("Town not found");
  }
  
  const encryptedUsername = encrypt(username);
  const encryptedPassword = encrypt(password);

  const existing = await storage.getPortalCredentialByUserAndTown(userId, townId);
  
  if (existing) {
    return await storage.updatePortalCredential(existing.id, {
      encryptedUsername,
      encryptedPassword,
    }) as PortalCredential;
  }

  return await storage.createPortalCredential({
    userId,
    townId,
    portalProvider: town?.portalProvider || null,
    encryptedUsername,
    encryptedPassword,
  });
}

export async function getDecryptedCredentials(
  credentialId: string
): Promise<{ username: string; password: string } | null> {
  const cred = await storage.getPortalCredential(credentialId);
  if (!cred || !cred.encryptedUsername || !cred.encryptedPassword) {
    return null;
  }

  return {
    username: decrypt(cred.encryptedUsername),
    password: decrypt(cred.encryptedPassword),
  };
}

interface PortalNavigationStep {
  step: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

interface OpenGovFieldMapping {
  vaultField: string;
  selectors: string[];
  type: "text" | "select" | "checkbox";
}

const OPENGOV_DEFAULT_MAPPINGS: Record<string, OpenGovFieldMapping> = {
  firstName: {
    vaultField: "first_name",
    selectors: ['input[name*="first" i]', 'input[id*="first" i]', 'input[placeholder*="first" i]'],
    type: "text",
  },
  lastName: {
    vaultField: "last_name", 
    selectors: ['input[name*="last" i]', 'input[id*="last" i]', 'input[placeholder*="last" i]'],
    type: "text",
  },
  email: {
    vaultField: "email",
    selectors: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'],
    type: "text",
  },
  phone: {
    vaultField: "phone",
    selectors: ['input[name*="phone" i]', 'input[id*="phone" i]', 'input[type="tel"]'],
    type: "text",
  },
  address1: {
    vaultField: "address",
    selectors: ['input[name*="address1" i]', 'input[name*="address" i]:not([name*="2"])', 'input[id*="address1" i]'],
    type: "text",
  },
  address2: {
    vaultField: "address_line_2",
    selectors: ['input[name*="address2" i]', 'input[id*="address2" i]'],
    type: "text",
  },
  city: {
    vaultField: "city",
    selectors: ['input[name*="city" i]', 'input[id*="city" i]'],
    type: "text",
  },
  state: {
    vaultField: "state",
    selectors: ['input[name*="state" i]', 'select[name*="state" i]', 'input[id*="state" i]'],
    type: "text",
  },
  zip: {
    vaultField: "zip",
    selectors: ['input[name*="zip" i]', 'input[name*="postal" i]', 'input[id*="zip" i]'],
    type: "text",
  },
  businessName: {
    vaultField: "business_name",
    selectors: ['input[name*="business" i]', 'input[name*="company" i]', 'input[id*="business" i]'],
    type: "text",
  },
};

export async function createPortalAutomationJob(
  userId: string,
  permitId: string,
  townId: string,
  vaultId: string,
  credentialId: string
): Promise<SubmissionJob | null> {
  const vault = await storage.getDataVault(vaultId);
  if (!vault) {
    console.error(`Vault not found: ${vaultId}`);
    return null;
  }

  const town = await storage.getTown(townId);
  if (!town || town.formType !== "online_portal") {
    console.error(`Town not configured for portal automation: ${townId}`);
    return null;
  }

  const job = await storage.createSubmissionJob({
    userId,
    permitId,
    townId,
    vaultId,
    submissionType: "portal_automation",
    status: "draft",
    portalCredentialId: credentialId,
    portalNavigationLog: [],
  });

  return job;
}

function getVaultValue(vault: DataVault, fieldName: string): string | null {
  const fieldMap: Record<string, keyof DataVault> = {
    first_name: "ownerName",
    last_name: "ownerName",
    email: "email",
    phone: "phone",
    address: "mailingStreet",
    address_line_2: "mailingStreet",
    city: "mailingCity",
    state: "mailingState",
    zip: "mailingZip",
    business_name: "businessName",
  };
  
  const vaultField = fieldMap[fieldName];
  if (!vaultField) return null;
  
  const value = vault[vaultField];
  if (typeof value === "string") {
    if (fieldName === "first_name" && value) {
      return value.split(" ")[0] || value;
    }
    if (fieldName === "last_name" && value) {
      const parts = value.split(" ");
      return parts.length > 1 ? parts.slice(1).join(" ") : "";
    }
    return value;
  }
  return null;
}

export async function executePortalAutomation(
  jobId: string
): Promise<{ success: boolean; error?: string; stepsCompleted?: number }> {
  const job = await storage.getSubmissionJob(jobId);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  // Job is already in "draft" status, automation will update it as it progresses

  const vault = job.vaultId ? await storage.getDataVault(job.vaultId) : null;
  const town = job.townId ? await storage.getTown(job.townId) : null;
  const credentials = job.portalCredentialId 
    ? await getDecryptedCredentials(job.portalCredentialId) 
    : null;

  if (!vault || !town || !credentials) {
    await logNavigationStep(jobId, "initialization", false, "Missing vault, town, or credentials");
    return { success: false, error: "Missing required data for automation" };
  }

  if (!town.portalUrl) {
    await logNavigationStep(jobId, "initialization", false, "No portal URL configured");
    return { success: false, error: "No portal URL configured for this town" };
  }

  let stepsCompleted = 0;

  try {
    const { chromium } = await import("playwright");
    
    await logNavigationStep(jobId, "browser_launch", true);
    
    const browser = await chromium.launch({ 
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const portalUrl = town.portalUrl.replace(/\/$/, "");
      
      await page.goto(portalUrl, { waitUntil: "networkidle" });
      await logNavigationStep(jobId, "navigate_portal", true);

      const maxSteps = 14;
      
      for (let step = 1; step <= maxSteps; step++) {
        await logNavigationStep(jobId, `processing_step_${step}`, true);
        
        let filledFields = 0;
        for (const [fieldName, mapping] of Object.entries(OPENGOV_DEFAULT_MAPPINGS)) {
          const value = getVaultValue(vault, mapping.vaultField);
          if (!value) continue;

          for (const selector of mapping.selectors) {
            try {
              const element = await page.$(selector);
              if (element && await element.isVisible()) {
                if (mapping.type === "text") {
                  const currentValue = await element.inputValue().catch(() => "");
                  if (!currentValue || currentValue.trim() === "") {
                    await element.fill(value);
                    filledFields++;
                    console.log(`[Portal] Filled ${fieldName} with vault field ${mapping.vaultField}`);
                  }
                }
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }

        await logNavigationStep(jobId, `step_${step}_filled_${filledFields}_fields`, true);
        stepsCompleted = step;

        const nextButton = await page.$('button:has-text("Next"), button:has-text("Continue"), a:has-text("Next")');
        if (nextButton && await nextButton.isVisible()) {
          await nextButton.click();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(1000);
        } else {
          const submitButton = await page.$('button:has-text("Submit"), button[type="submit"]');
          if (submitButton && await submitButton.isVisible()) {
            await logNavigationStep(jobId, "reached_submit_step", true);
            break;
          }
        }
      }

      await storage.updateSubmissionJob(jobId, {
        status: "pending_review",
        previewGenerated: true,
      });
      await logNavigationStep(jobId, "automation_complete", true);

    } finally {
      await browser.close();
    }

    return { success: true, stepsCompleted };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logNavigationStep(jobId, "automation_error", false, errorMessage);
    await storage.updateSubmissionJob(jobId, {
      status: "failed",
      errorMessage,
      retryCount: (job.retryCount || 0) + 1,
    });
    return { success: false, error: errorMessage, stepsCompleted };
  }
}

export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

async function logNavigationStep(
  jobId: string,
  step: string,
  success: boolean,
  error?: string
): Promise<void> {
  const job = await storage.getSubmissionJob(jobId);
  if (!job) return;

  const log = (job.portalNavigationLog as PortalNavigationStep[] | null) || [];
  log.push({
    step,
    timestamp: new Date().toISOString(),
    success,
    error,
  });

  await storage.updateSubmissionJob(jobId, {
    portalNavigationLog: log,
  });
}

export async function approveAndSubmit(jobId: string): Promise<{ success: boolean; error?: string }> {
  const job = await storage.getSubmissionJob(jobId);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "pending_review") {
    return { success: false, error: "Job is not ready for submission" };
  }

  await storage.updateSubmissionJob(jobId, {
    status: "ready_to_submit",
    userReviewedAt: new Date(),
    userApproved: true,
  });

  if (job.submissionType === "pdf_fill") {
    await storage.updateSubmissionJob(jobId, {
      status: "completed",
      submittedAt: new Date(),
    });
    return { success: true };
  }

  if (job.submissionType === "portal_automation") {
    return { success: true };
  }

  return { success: false, error: "Unknown submission type" };
}

// SeamlessDocs-specific field mappings
const SEAMLESSDOCS_FIELD_MAPPINGS: Record<string, { vaultFields: string[]; selectors: string[]; type: "text" | "select" | "checkbox" | "radio" }> = {
  businessName: {
    vaultFields: ["business_name"],
    selectors: [
      'input[name*="business" i]',
      'input[name*="company" i]',
      'input[placeholder*="business" i]',
      'input[aria-label*="business" i]',
      '[data-field*="business" i] input',
    ],
    type: "text",
  },
  ownerName: {
    vaultFields: ["owner_name", "applicant_name"],
    selectors: [
      'input[name*="owner" i]',
      'input[name*="applicant" i]',
      'input[name*="name" i]:not([name*="business" i]):not([name*="event" i])',
      'input[placeholder*="owner" i]',
      '[data-field*="owner" i] input',
      '[data-field*="applicant" i] input',
    ],
    type: "text",
  },
  email: {
    vaultFields: ["email"],
    selectors: [
      'input[type="email"]',
      'input[name*="email" i]',
      'input[placeholder*="email" i]',
    ],
    type: "text",
  },
  phone: {
    vaultFields: ["phone"],
    selectors: [
      'input[type="tel"]',
      'input[name*="phone" i]',
      'input[name*="telephone" i]',
      'input[placeholder*="phone" i]',
    ],
    type: "text",
  },
  address: {
    vaultFields: ["address", "mailing_address"],
    selectors: [
      'input[name*="address" i]:not([name*="email" i])',
      'input[name*="street" i]',
      'input[placeholder*="address" i]',
      '[data-field*="address" i] input',
    ],
    type: "text",
  },
  city: {
    vaultFields: ["city", "mailing_city"],
    selectors: [
      'input[name*="city" i]',
      'input[placeholder*="city" i]',
    ],
    type: "text",
  },
  state: {
    vaultFields: ["state", "mailing_state"],
    selectors: [
      'select[name*="state" i]',
      'input[name*="state" i]',
    ],
    type: "text",
  },
  zip: {
    vaultFields: ["zip", "mailing_zip"],
    selectors: [
      'input[name*="zip" i]',
      'input[name*="postal" i]',
    ],
    type: "text",
  },
  licenseNumber: {
    vaultFields: ["license_number"],
    selectors: [
      'input[name*="license" i]',
      'input[name*="permit" i]:not([name*="type" i])',
      'input[placeholder*="license" i]',
    ],
    type: "text",
  },
  menuItems: {
    vaultFields: ["food_items_list", "menu_items"],
    selectors: [
      'textarea[name*="menu" i]',
      'textarea[name*="food" i]',
      'input[name*="menu" i]',
      '[data-field*="menu" i] textarea',
      '[data-field*="menu" i] input',
    ],
    type: "text",
  },
  vehicleInfo: {
    vaultFields: ["trailer_make", "trailer_model", "vin"],
    selectors: [
      'input[name*="vehicle" i]',
      'input[name*="truck" i]',
      'input[name*="trailer" i]',
      'textarea[name*="vehicle" i]',
    ],
    type: "text",
  },
};

interface PortalAutomationResult {
  success: boolean;
  error?: string;
  filledFields: string[];
  screenshotBase64?: string;
  portalUrl: string;
  formStatus: "draft_saved" | "submitted" | "pending_user_action" | "error";
  navigationLog: PortalNavigationStep[];
}

export interface FormPortalSubmissionOptions {
  profileId: string;
  formId: string;
  permitId: string;
  eventData?: {
    eventName?: string;
    eventAddress?: string;
    eventDates?: string;
    hoursOfOperation?: string;
  };
  userAnswers?: Record<string, string>;
  submitForm?: boolean; // If false, just fill and save draft
}

// Get profile data in a flat format for form filling
function getProfileDataFlat(profile: Profile): Record<string, string> {
  const data: Record<string, string> = {};
  
  // Parse parsedDataLog if available
  const parsedLog = profile.parsedDataLog as Record<string, any> | null;
  if (parsedLog) {
    // Flatten all categories
    const categories = ["contact_info", "license_info", "operations", "safety", "menu_and_prep", "vehicle_info", "equipment_info", "certifications", "commissary_info", "food_info"];
    for (const category of categories) {
      const categoryData = parsedLog[category];
      if (categoryData && typeof categoryData === "object") {
        for (const [key, val] of Object.entries(categoryData)) {
          if (val && typeof val === "object" && "value" in val && val.value) {
            data[key] = String(val.value);
          } else if (typeof val === "string" && val) {
            data[key] = val;
          }
        }
      }
    }
  }
  
  // Add from extractedData if available
  const extractedData = profile.extractedData as Record<string, string | undefined> | null;
  if (extractedData) {
    if (extractedData.businessName) data.business_name = extractedData.businessName;
    if (extractedData.ownerName) data.owner_name = extractedData.ownerName;
    if (extractedData.licensePlate) data.license_plate = extractedData.licensePlate;
    if (extractedData.vin) data.vin = extractedData.vin;
    if (extractedData.licenseNumber) data.license_number = extractedData.licenseNumber;
  }
  
  // Add vehicle info
  if (profile.vehicleType) data.vehicle_type = profile.vehicleType;
  if (profile.vinPlate) data.vin_plate = profile.vinPlate;
  if (profile.vehicleName) data.vehicle_name = profile.vehicleName;
  
  return data;
}

// Fill SeamlessDocs form fields
async function fillSeamlessDocsFields(
  page: Page,
  profileData: Record<string, string>,
  eventData?: FormPortalSubmissionOptions["eventData"],
  userAnswers?: Record<string, string>
): Promise<string[]> {
  const filledFields: string[] = [];
  
  // Combine all data sources (user answers have highest priority)
  const allData = { ...profileData };
  if (eventData) {
    if (eventData.eventName) allData.event_name = eventData.eventName;
    if (eventData.eventAddress) allData.event_address = eventData.eventAddress;
    if (eventData.eventDates) allData.event_dates = eventData.eventDates;
    if (eventData.hoursOfOperation) allData.hours_of_operation = eventData.hoursOfOperation;
  }
  if (userAnswers) {
    Object.assign(allData, userAnswers);
  }
  
  // Wait for form to load
  await page.waitForTimeout(2000);
  
  // Try to fill each mapped field
  for (const [fieldName, mapping] of Object.entries(SEAMLESSDOCS_FIELD_MAPPINGS)) {
    // Find the value from our data
    let value: string | null = null;
    for (const vaultField of mapping.vaultFields) {
      if (allData[vaultField]) {
        value = allData[vaultField];
        break;
      }
    }
    if (!value) continue;
    
    // Try each selector
    for (const selector of mapping.selectors) {
      try {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          
          if (tagName === "select") {
            // For selects, try to select by text
            await element.selectOption({ label: value }).catch(() => {});
            filledFields.push(fieldName);
            console.log(`[SeamlessDocs] Filled ${fieldName} (select) with: ${value}`);
            break;
          } else if (tagName === "textarea" || tagName === "input") {
            const currentValue = await element.inputValue().catch(() => "");
            if (!currentValue || currentValue.trim() === "") {
              await element.fill(value);
              filledFields.push(fieldName);
              console.log(`[SeamlessDocs] Filled ${fieldName} with: ${value}`);
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  // Also try generic field matching based on labels
  try {
    const labels = await page.$$("label");
    for (const label of labels) {
      const labelText = (await label.textContent())?.toLowerCase() || "";
      const forAttr = await label.getAttribute("for");
      
      if (!forAttr) continue;
      
      const input = await page.$(`#${forAttr}`);
      if (!input || !(await input.isVisible())) continue;
      
      // Try to match label text to our data
      for (const [key, value] of Object.entries(allData)) {
        if (!value) continue;
        const keyWords = key.replace(/_/g, " ").toLowerCase().split(" ");
        const matches = keyWords.some(word => word.length > 2 && labelText.includes(word));
        
        if (matches) {
          const currentValue = await input.inputValue().catch(() => "");
          if (!currentValue || currentValue.trim() === "") {
            try {
              await input.fill(value);
              filledFields.push(`label:${key}`);
              console.log(`[SeamlessDocs] Filled by label match: ${key} with: ${value}`);
            } catch (e) {
              // Ignore fill errors
            }
          }
          break;
        }
      }
    }
  } catch (e) {
    console.log("[SeamlessDocs] Label matching error:", e);
  }
  
  return filledFields;
}

// Main form portal submission function
export async function executeFormPortalSubmission(
  options: FormPortalSubmissionOptions
): Promise<PortalAutomationResult> {
  const { profileId, formId, permitId, eventData, userAnswers, submitForm = false } = options;
  const navigationLog: PortalNavigationStep[] = [];
  
  const logStep = (step: string, success: boolean, error?: string) => {
    navigationLog.push({ step, timestamp: new Date().toISOString(), success, error });
  };
  
  // Get form and profile data
  const form = await storage.getTownFormById(formId);
  if (!form) {
    logStep("initialization", false, "Form not found");
    return { success: false, error: "Form not found", filledFields: [], portalUrl: "", formStatus: "error", navigationLog };
  }
  
  const portalUrl = form.externalUrl || form.sourceUrl || "";
  if (!portalUrl || (!portalUrl.includes("seamlessdocs") && !portalUrl.includes("opengov") && !portalUrl.includes("viewpoint"))) {
    logStep("initialization", false, "No valid portal URL found");
    return { success: false, error: "Form does not have a portal URL configured", filledFields: [], portalUrl, formStatus: "error", navigationLog };
  }
  
  const profile = await storage.getProfile(profileId);
  if (!profile) {
    logStep("initialization", false, "Profile not found");
    return { success: false, error: "Profile not found", filledFields: [], portalUrl, formStatus: "error", navigationLog };
  }
  
  logStep("initialization", true);
  
  let browser: Browser | null = null;
  let screenshotBase64: string | undefined;
  
  try {
    const { chromium } = await import("playwright");
    
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    logStep("browser_launch", true);
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await context.newPage();
    
    // Navigate to portal
    console.log(`[Portal] Navigating to: ${portalUrl}`);
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    logStep("navigate_portal", true);
    
    // Get flattened profile data
    const profileData = getProfileDataFlat(profile);
    console.log(`[Portal] Profile data keys: ${Object.keys(profileData).join(", ")}`);
    
    // Fill form fields
    const filledFields = await fillSeamlessDocsFields(page, profileData, eventData, userAnswers);
    logStep(`filled_${filledFields.length}_fields`, true);
    
    // Take screenshot
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    screenshotBase64 = screenshot.toString("base64");
    logStep("screenshot_captured", true);
    
    let formStatus: PortalAutomationResult["formStatus"] = "pending_user_action";
    
    // If submit requested, try to submit
    if (submitForm) {
      try {
        const submitButton = await page.$('button[type="submit"], button:has-text("Submit"), input[type="submit"]');
        if (submitButton && await submitButton.isVisible()) {
          await submitButton.click();
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(2000);
          formStatus = "submitted";
          logStep("form_submitted", true);
        } else {
          logStep("submit_button_not_found", false, "Could not find submit button");
          formStatus = "pending_user_action";
        }
      } catch (e) {
        logStep("submit_failed", false, String(e));
        formStatus = "pending_user_action";
      }
    }
    
    await browser.close();
    browser = null;
    
    return {
      success: true,
      filledFields,
      screenshotBase64,
      portalUrl,
      formStatus,
      navigationLog,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("automation_error", false, errorMessage);
    
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    return {
      success: false,
      error: errorMessage,
      filledFields: [],
      portalUrl,
      formStatus: "error",
      navigationLog,
    };
  }
}

// Check if a form supports portal automation
export function isPortalForm(form: TownForm): boolean {
  const url = form.externalUrl || form.sourceUrl || "";
  return url.includes("seamlessdocs") || url.includes("opengov") || url.includes("viewpoint");
}

// Detect portal provider from URL
export function detectPortalProvider(url: string): "seamlessdocs" | "opengov" | "viewpoint" | "unknown" {
  if (url.includes("seamlessdocs")) return "seamlessdocs";
  if (url.includes("opengov")) return "opengov";
  if (url.includes("viewpoint")) return "viewpoint";
  return "unknown";
}
