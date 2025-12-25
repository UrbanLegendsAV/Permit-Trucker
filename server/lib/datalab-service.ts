import { storage } from "../storage";
import type { SubmissionJob, DataVault } from "@shared/schema";
import { getVaultDataForPdfFill } from "./vault-service";

const DATALAB_API_URL = "https://www.datalab.to/api/v1/fill";
const DATALAB_API_KEY = process.env.DATALAB_API_KEY;

interface DatalabFillRequest {
  pdfBase64: string;
  pdfFilename: string;
  fieldData: Record<string, { value: string; description: string }>;
  confidenceThreshold?: number;
}

interface DatalabResponse {
  success: boolean;
  request_id?: string;
  request_check_url?: string;
  error?: string;
}

interface DatalabResultResponse {
  status: "pending" | "processing" | "completed" | "failed";
  result_url?: string;
  filled_pdf_base64?: string;
  error?: string;
}

export async function fillPdfWithDatalab(request: DatalabFillRequest): Promise<DatalabResponse> {
  if (!DATALAB_API_KEY) {
    console.error("DATALAB_API_KEY not configured");
    return { success: false, error: "Datalab API key not configured" };
  }

  try {
    const pdfBuffer = Buffer.from(request.pdfBase64, "base64");
    
    const formData = new FormData();
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), request.pdfFilename);
    formData.append("field_data", JSON.stringify(request.fieldData));
    
    if (request.confidenceThreshold) {
      formData.append("confidence_threshold", request.confidenceThreshold.toString());
    }

    const response = await fetch(DATALAB_API_URL, {
      method: "POST",
      headers: {
        "X-API-Key": DATALAB_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Datalab API error:", response.status, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const result = await response.json() as DatalabResponse;
    return { ...result, success: true };
  } catch (error) {
    console.error("Datalab request failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function checkDatalabResult(requestCheckUrl: string): Promise<DatalabResultResponse> {
  if (!DATALAB_API_KEY) {
    return { status: "failed", error: "Datalab API key not configured" };
  }

  try {
    const response = await fetch(requestCheckUrl, {
      method: "GET",
      headers: {
        "X-API-Key": DATALAB_API_KEY,
      },
    });

    if (!response.ok) {
      return { status: "failed", error: `API error: ${response.status}` };
    }

    return await response.json() as DatalabResultResponse;
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function createPdfFillJob(
  userId: string,
  permitId: string,
  townId: string,
  vaultId: string,
  pdfBase64: string,
  pdfFilename: string
): Promise<SubmissionJob | null> {
  const vault = await storage.getDataVault(vaultId);
  if (!vault) {
    console.error(`Vault not found: ${vaultId}`);
    return null;
  }

  const job = await storage.createSubmissionJob({
    userId,
    permitId,
    townId,
    vaultId,
    submissionType: "pdf_fill",
    status: "draft",
  });

  const fieldData = getVaultDataForPdfFill(vault);

  const datalabResponse = await fillPdfWithDatalab({
    pdfBase64,
    pdfFilename,
    fieldData,
    confidenceThreshold: 0.5,
  });

  if (datalabResponse.success && datalabResponse.request_id) {
    await storage.updateSubmissionJob(job.id, {
      datalabRequestId: datalabResponse.request_id,
      datalabStatus: "processing",
      datalabResponse: datalabResponse as unknown as Record<string, unknown>,
    });
  } else {
    await storage.updateSubmissionJob(job.id, {
      status: "failed",
      errorMessage: datalabResponse.error || "Failed to submit to Datalab",
      datalabResponse: datalabResponse as unknown as Record<string, unknown>,
    });
  }

  return await storage.getSubmissionJob(job.id) ?? null;
}

export async function pollDatalabJob(jobId: string): Promise<SubmissionJob | null> {
  const job = await storage.getSubmissionJob(jobId);
  if (!job || !job.datalabRequestId || job.datalabStatus !== "processing") {
    return job ?? null;
  }

  const datalabResponse = job.datalabResponse as DatalabResponse | null;
  if (!datalabResponse?.request_check_url) {
    return job;
  }

  const result = await checkDatalabResult(datalabResponse.request_check_url);

  if (result.status === "completed" && result.filled_pdf_base64) {
    await storage.updateSubmissionJob(job.id, {
      status: "pending_review",
      datalabStatus: "completed",
      filledPdfData: result.filled_pdf_base64,
      previewGenerated: true,
      datalabResponse: { ...datalabResponse, result } as unknown as Record<string, unknown>,
    });
  } else if (result.status === "failed") {
    await storage.updateSubmissionJob(job.id, {
      status: "failed",
      datalabStatus: "failed",
      errorMessage: result.error || "Datalab processing failed",
      datalabResponse: { ...datalabResponse, result } as unknown as Record<string, unknown>,
    });
  }

  return await storage.getSubmissionJob(job.id) ?? null;
}

export async function startAutoPdfFill(
  userId: string,
  permitId: string,
  townId: string,
  vaultId: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  const townForms = await storage.getTownForms(townId);
  const primaryForm = townForms.find(f => f.category === "temporary_permit" || f.category === "yearly_permit");
  
  if (!primaryForm || !primaryForm.fileData) {
    return { success: false, error: "No fillable form found for this town" };
  }

  const job = await createPdfFillJob(
    userId,
    permitId,
    townId,
    vaultId,
    primaryForm.fileData,
    primaryForm.fileName || "permit_application.pdf"
  );

  if (!job) {
    return { success: false, error: "Failed to create fill job" };
  }

  return { success: true, jobId: job.id };
}
