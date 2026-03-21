import { eq } from "drizzle-orm";
import { db } from "../db";
import { foodTrucks } from "@shared/schema";
import { storage } from "../storage";

type VerificationEvidence = { type: string; points: number; note: string };

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

function extractDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function namesLookRelated(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function getDocumentFolders(profile: { uploadsJson?: { documents?: Array<{ folder?: string }> } | null }) {
  return (profile.uploadsJson?.documents || [])
    .map((doc) => normalize(doc.folder).replace(/-/g, "_"))
    .filter(Boolean);
}

function scoreDocuments(folders: string[]): VerificationEvidence[] {
  const evidence: VerificationEvidence[] = [];
  const hasPermit = folders.some((folder) => folder.includes("health_permit") || folder.includes("permit_application"));
  const hasCommissary = folders.some((folder) => folder.includes("commissary"));
  const hasInsurance = folders.some((folder) => folder.includes("coi") || folder.includes("insurance"));
  const hasMenu = folders.some((folder) => folder.includes("menu"));

  if (hasPermit) evidence.push({ type: "document", points: 40, note: "Uploaded permit or granted health permit" });
  if (hasCommissary) evidence.push({ type: "document", points: 20, note: "Uploaded commissary agreement" });
  if (hasInsurance) evidence.push({ type: "document", points: 20, note: "Uploaded COI or insurance evidence" });
  if (hasMenu) evidence.push({ type: "document", points: 5, note: "Uploaded menu evidence" });

  return evidence;
}

export async function evaluateClaimVerification(profileId: string) {
  const profile = await storage.getProfile(profileId);
  if (!profile) return null;

  const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.profileId, profileId)).limit(1);
  if (!truck) return null;

  const claimRequest = await storage.getClaimRequestByProfileId(profileId);
  if (!claimRequest) return null;

  const vault = await storage.getDataVaultByProfileId(profileId);
  const publicProfile = await storage.getPublicProfile(profileId);
  const evidence: VerificationEvidence[] = [];

  evidence.push(...scoreDocuments(getDocumentFolders(profile)));

  const businessName = vault?.businessName || publicProfile?.businessName || profile.vehicleName;
  if (namesLookRelated(businessName, truck.name)) {
    evidence.push({ type: "identity_match", points: 20, note: "Business name matches truck listing" });
  }

  if (normalizePhone(vault?.phone) && normalizePhone(vault?.phone) === normalizePhone(truck.phone)) {
    evidence.push({ type: "phone_match", points: 10, note: "Phone matches existing listing" });
  }

  if (normalize(vault?.email) && normalize(vault?.email) === normalize(truck.email)) {
    evidence.push({ type: "email_match", points: 10, note: "Email matches existing listing" });
  }

  const websiteDomain = extractDomain(truck.website);
  const emailDomain = normalize(vault?.email).split("@")[1] || null;
  if (websiteDomain && emailDomain && websiteDomain === emailDomain) {
    evidence.push({ type: "domain_match", points: 15, note: "Business email domain matches website domain" });
  }

  const verificationScore = Math.min(100, evidence.reduce((sum, item) => sum + item.points, 0));
  const status =
    verificationScore >= 80 ? "verified" :
    verificationScore >= 45 ? "needs_review" :
    "pending";

  const updatedClaimRequest = await storage.updateClaimRequest(claimRequest.id, {
    status,
    verificationScore,
    verificationEvidence: evidence,
  });

  await db.update(foodTrucks).set({
    status,
    verificationScore,
    ...(status === "verified" ? { verifiedAt: new Date() } : { verifiedAt: null }),
  }).where(eq(foodTrucks.id, truck.id));

  if (publicProfile) {
    await storage.updatePublicProfile(profileId, {
      isVerified: status === "verified",
    });
  }

  await storage.createListingAuditLog({
    action: "claim_verification_scored",
    actorUserId: claimRequest.userId,
    truckSlug: truck.slug,
    profileId,
    claimRequestId: claimRequest.id,
    details: {
      verificationScore,
      status,
      evidence,
    },
  });

  return {
    claimRequest: updatedClaimRequest,
    verificationScore,
    status,
    evidence,
  };
}
