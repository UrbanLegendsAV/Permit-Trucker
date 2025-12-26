import { storage } from "../storage";
import type { SubmissionJob, DataVault, PortalCredential, Town } from "@shared/schema";
import { getVaultDataForPdfFill } from "./vault-service";
import crypto from "crypto";

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
