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

interface ViewPointConfig {
  loginUrl: string;
  permitFormPath: string;
  fieldMappings: Record<string, string>;
  uploadSelectors: Record<string, string>;
}

const VIEWPOINT_CONFIGS: Record<string, ViewPointConfig> = {
  default: {
    loginUrl: "/Account/Login",
    permitFormPath: "/Permits/Apply",
    fieldMappings: {
      businessName: "#BusinessName",
      ownerName: "#ApplicantName",
      phone: "#Phone",
      email: "#Email",
      address: "#Address",
    },
    uploadSelectors: {
      documents: "#FileUpload",
    },
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

export async function executePortalAutomation(
  jobId: string
): Promise<{ success: boolean; error?: string }> {
  const job = await storage.getSubmissionJob(jobId);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

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
      const config = VIEWPOINT_CONFIGS[town.portalProvider || "default"] || VIEWPOINT_CONFIGS.default;
      const baseUrl = town.portalUrl.replace(/\/$/, "");
      
      await page.goto(`${baseUrl}${config.loginUrl}`);
      await logNavigationStep(jobId, "navigate_login", true);
      
      await page.fill('input[type="email"], input[name="email"], input[name="username"]', credentials.username);
      await page.fill('input[type="password"], input[name="password"]', credentials.password);
      await logNavigationStep(jobId, "fill_credentials", true);
      
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForLoadState("networkidle");
      await logNavigationStep(jobId, "submit_login", true);
      
      await page.goto(`${baseUrl}${config.permitFormPath}`);
      await page.waitForLoadState("networkidle");
      await logNavigationStep(jobId, "navigate_permit_form", true);
      
      const fieldData = getVaultDataForPdfFill(vault);
      for (const [fieldKey, selector] of Object.entries(config.fieldMappings)) {
        const data = fieldData[fieldKey];
        if (data?.value) {
          try {
            await page.fill(selector, data.value);
          } catch (e) {
            console.warn(`Could not fill field ${fieldKey}: ${e}`);
          }
        }
      }
      await logNavigationStep(jobId, "fill_form_fields", true);
      
      await storage.updateSubmissionJob(jobId, {
        status: "pending_review",
        previewGenerated: true,
      });
      await logNavigationStep(jobId, "prepare_for_review", true);

    } finally {
      await browser.close();
    }

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logNavigationStep(jobId, "automation_error", false, errorMessage);
    await storage.updateSubmissionJob(jobId, {
      status: "failed",
      errorMessage,
      retryCount: (job.retryCount || 0) + 1,
    });
    return { success: false, error: errorMessage };
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
