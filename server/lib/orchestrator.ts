/**
 * PermitPilot Orchestrator — autonomous inbound-email router
 *
 * Classifies intent with Claude claude-sonnet-4-6, then routes to the correct sub-agent:
 *   claim_listing   → handleClaimRequest
 *   catering_reply  → handleCateringReply
 *   permit_inquiry  → handlePermitInquiry
 *   opt_out         → handleOptOut
 *   general_inquiry → handleGeneralInquiry
 *   spam            → ignored
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import {
  foodTrucks,
  towns,
  inboundEmails,
  agentLogs,
  type InboundEmail,
} from '@shared/schema';
import { eq, ilike, or } from 'drizzle-orm';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type EmailIntent =
  | 'claim_listing'
  | 'catering_reply'
  | 'permit_inquiry'
  | 'opt_out'
  | 'general_inquiry'
  | 'spam';

// ─── SendGrid helper ──────────────────────────────────────────────────────────

async function getSgMail() {
  const mod = await import('@sendgrid/mail');
  const sgMail = mod.default;
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  return sgMail;
}

async function sendReply(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<boolean> {
  try {
    const sgMail = await getSgMail();
    await sgMail.send({
      to,
      from: { email: 'hello@permitpilot.cloud', name: 'PermitPilot' },
      subject,
      text,
      html: html || `<p>${text.replace(/\n/g, '<br>')}</p>`,
    });
    return true;
  } catch (err: any) {
    console.error('[Orchestrator] sendReply failed:', err.message);
    return false;
  }
}

// ─── Agent log helper ─────────────────────────────────────────────────────────

async function logAgentAction(params: {
  agentName: string;
  action: string;
  input?: string | null;
  output?: string | null;
  success: boolean;
  errorMessage?: string | null;
  durationMs?: number | null;
  relatedEmailId?: number | null;
  relatedTruckSlug?: string | null;
}) {
  try {
    await db.insert(agentLogs).values({
      agentName: params.agentName,
      action: params.action,
      input: params.input ?? null,
      output: params.output ?? null,
      success: params.success,
      errorMessage: params.errorMessage ?? null,
      durationMs: params.durationMs ?? null,
      relatedEmailId: params.relatedEmailId ?? null,
      relatedTruckSlug: params.relatedTruckSlug ?? null,
    });
  } catch (err) {
    console.error('[Orchestrator] logAgentAction failed:', err);
  }
}

// ─── Intent classification ────────────────────────────────────────────────────

async function classifyEmailIntent(email: InboundEmail): Promise<EmailIntent> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: `You are classifying an inbound email to PermitPilot, a Connecticut food truck permit filing app and directory.

From: ${email.from}
Subject: ${email.subject}
Body: ${(email.bodyText || '').slice(0, 1000)}

Classify this email as exactly ONE of these intents:
- claim_listing: sender wants to claim their food truck listing
- catering_reply: sender is providing catering information for their listing
- permit_inquiry: asking how to get a permit in a specific CT town
- opt_out: wants to unsubscribe or be removed
- general_inquiry: general question about PermitPilot
- spam: irrelevant or automated message

Reply with ONLY the intent label, nothing else.`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : 'general_inquiry';

  const valid: EmailIntent[] = [
    'claim_listing',
    'catering_reply',
    'permit_inquiry',
    'opt_out',
    'general_inquiry',
    'spam',
  ];
  return valid.includes(text as EmailIntent)
    ? (text as EmailIntent)
    : 'general_inquiry';
}

// ─── Sub-agent: Claim ─────────────────────────────────────────────────────────

async function handleClaimRequest(
  email: InboundEmail,
): Promise<{ replied: boolean; action: string; truckSlug?: string }> {
  const start = Date.now();

  // Ask Claude to extract the truck name/slug from the email
  const extractResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `What food truck name or PermitPilot listing slug is mentioned in this email? Return ONLY the truck name or slug, nothing else. If unclear, return "unknown".

Subject: ${email.subject}
Body: ${(email.bodyText || '').slice(0, 800)}`,
      },
    ],
  });

  const extractedName =
    extractResponse.content[0].type === 'text'
      ? extractResponse.content[0].text.trim()
      : '';

  // Try to find truck by slug, name, or sender email
  const senderEmail = (email.from || '').toLowerCase();
  const senderDomain = senderEmail.includes('@')
    ? senderEmail.split('@')[1]
    : '';

  const allTrucks = await db.select().from(foodTrucks);

  let matched = allTrucks.find(
    (t) =>
      t.email?.toLowerCase() === senderEmail ||
      (senderDomain && t.website?.toLowerCase().includes(senderDomain)) ||
      (extractedName !== 'unknown' &&
        t.name.toLowerCase().includes(extractedName.toLowerCase())),
  );

  if (!matched && extractedName && extractedName !== 'unknown') {
    // Fallback: partial slug match
    matched = allTrucks.find((t) =>
      t.slug.toLowerCase().includes(
        extractedName.toLowerCase().replace(/\s+/g, '-'),
      ),
    );
  }

  if (!matched) {
    const sent = await sendReply(
      email.from!,
      'Re: Claiming your PermitPilot listing',
      `Hi,\n\nWe couldn't find a listing matching your email address or truck name. Visit permitpilot.cloud/directory to find your truck and click "Claim Listing".\n\nQuestions? Just reply to this email.\n\n— PermitPilot`,
    );
    await logAgentAction({
      agentName: 'claim',
      action: 'no_truck_found',
      input: email.bodyText?.slice(0, 300),
      output: `extracted: ${extractedName}, no match`,
      success: sent,
      durationMs: Date.now() - start,
      relatedEmailId: email.id,
    });
    return { replied: sent, action: 'no_match' };
  }

  // Claim the truck
  await db
    .update(foodTrucks)
    .set({ status: 'claimed', email: senderEmail })
    .where(eq(foodTrucks.id, matched.id));

  // Update inbound email with truck slug
  await db
    .update(inboundEmails)
    .set({ truckSlug: matched.slug })
    .where(eq(inboundEmails.id, email.id!));

  const listingUrl = `https://permitpilot.cloud/directory/${matched.slug}`;
  const sent = await sendReply(
    email.from!,
    `Your PermitPilot listing is claimed — welcome!`,
    `Hi!\n\nYour listing for ${matched.name} is now claimed at ${listingUrl}.\n\nNext step: file your first CT permit in 60 seconds at permitpilot.cloud\n\nWelcome to PermitPilot!\n— The PermitPilot Team`,
    `<p>Hi!</p>
<p>Your listing for <strong>${matched.name}</strong> is now claimed at <a href="${listingUrl}">${listingUrl}</a>.</p>
<p><strong>Next step:</strong> File your first CT permit in 60 seconds at <a href="https://permitpilot.cloud">permitpilot.cloud</a></p>
<p>Welcome to PermitPilot!<br>— The PermitPilot Team</p>`,
  );

  await logAgentAction({
    agentName: 'claim',
    action: 'listing_claimed',
    input: email.bodyText?.slice(0, 300),
    output: `claimed ${matched.slug} for ${senderEmail}`,
    success: true,
    durationMs: Date.now() - start,
    relatedEmailId: email.id,
    relatedTruckSlug: matched.slug,
  });

  return { replied: sent, action: 'claimed', truckSlug: matched.slug };
}

// ─── Sub-agent: Catering reply ────────────────────────────────────────────────

async function handleCateringReply(
  email: InboundEmail,
): Promise<{ replied: boolean; action: string; truckSlug?: string }> {
  const start = Date.now();

  const extractResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `Extract catering info from this food truck owner email. Return valid JSON only, no commentary:
{
  "offersPrivateCatering": true,
  "cateringEventTypes": ["weddings","corporate"],
  "cateringMinGuests": 50,
  "cateringMaxGuests": 300,
  "cateringPricePerPerson": "$18",
  "cateringDescription": "We bring the full setup...",
  "cateringContactEmail": "book@truck.com",
  "cateringContactPhone": "(203) 555-1234"
}

Email body: ${(email.bodyText || '').slice(0, 1200)}`,
      },
    ],
  });

  let cateringData: Record<string, any> = {};
  if (extractResponse.content[0].type === 'text') {
    try {
      const raw = extractResponse.content[0].text.trim();
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      cateringData = JSON.parse(cleaned);
    } catch {
      // partial fallback
    }
  }

  // Find truck by sender email
  const senderEmail = (email.from || '').toLowerCase();
  const [matched] = await db
    .select()
    .from(foodTrucks)
    .where(eq(foodTrucks.email, senderEmail))
    .limit(1);

  if (!matched) {
    await logAgentAction({
      agentName: 'catering',
      action: 'no_truck_found',
      input: email.bodyText?.slice(0, 300),
      output: `no truck for ${senderEmail}`,
      success: false,
      durationMs: Date.now() - start,
      relatedEmailId: email.id,
    });
    return { replied: false, action: 'no_match' };
  }

  // Update catering fields
  const updateData: Record<string, any> = {};
  if (cateringData.offersPrivateCatering !== undefined)
    updateData.offersPrivateCatering = Boolean(cateringData.offersPrivateCatering);
  if (cateringData.cateringEventTypes)
    updateData.cateringEventTypes = cateringData.cateringEventTypes;
  if (cateringData.cateringMinGuests)
    updateData.cateringMinGuests = Number(cateringData.cateringMinGuests) || null;
  if (cateringData.cateringMaxGuests)
    updateData.cateringMaxGuests = Number(cateringData.cateringMaxGuests) || null;
  if (cateringData.cateringPricePerPerson)
    updateData.cateringPricePerPerson = cateringData.cateringPricePerPerson;
  if (cateringData.cateringDescription)
    updateData.cateringDescription = cateringData.cateringDescription;
  if (cateringData.cateringContactEmail)
    updateData.cateringContactEmail = cateringData.cateringContactEmail;
  if (cateringData.cateringContactPhone)
    updateData.cateringContactPhone = cateringData.cateringContactPhone;

  if (Object.keys(updateData).length > 0) {
    await db
      .update(foodTrucks)
      .set(updateData)
      .where(eq(foodTrucks.id, matched.id));
  }

  const listingUrl = `https://permitpilot.cloud/directory/${matched.slug}`;
  const sent = await sendReply(
    email.from!,
    `Your catering info is live on PermitPilot`,
    `Hi!\n\nThanks! Your catering info is now live at ${listingUrl}.\n\nEvent planners searching PermitPilot can now find and contact you for weddings, corporate events, and more.\n\n— PermitPilot`,
    `<p>Hi!</p>
<p>Thanks! Your catering info is now live at <a href="${listingUrl}">${listingUrl}</a>.</p>
<p>Event planners searching PermitPilot can now find and contact you for weddings, corporate events, and more.</p>
<p>— PermitPilot</p>`,
  );

  await logAgentAction({
    agentName: 'catering',
    action: 'catering_updated',
    input: email.bodyText?.slice(0, 300),
    output: JSON.stringify(updateData),
    success: true,
    durationMs: Date.now() - start,
    relatedEmailId: email.id,
    relatedTruckSlug: matched.slug,
  });

  return { replied: sent, action: 'catering_updated', truckSlug: matched.slug };
}

// ─── Sub-agent: Permit inquiry ────────────────────────────────────────────────

async function handlePermitInquiry(
  email: InboundEmail,
): Promise<{ replied: boolean; action: string }> {
  const start = Date.now();

  // Extract CT town name from email
  const townExtract = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: `What Connecticut town is mentioned in this food truck permit inquiry email? Return ONLY the town name, nothing else. If unclear, return "unknown".

Subject: ${email.subject}
Body: ${(email.bodyText || '').slice(0, 600)}`,
      },
    ],
  });

  const townName =
    townExtract.content[0].type === 'text'
      ? townExtract.content[0].text.trim()
      : 'unknown';

  // Look up town in DB
  let townData: any = null;
  if (townName && townName !== 'unknown') {
    const [found] = await db
      .select()
      .from(towns)
      .where(ilike(towns.townName, `%${townName}%`))
      .limit(1);
    townData = found;
  }

  // Generate personalized response with Claude
  const replyPrompt = townData
    ? `Write a helpful, concise email response from PermitPilot to a food truck operator asking about permits in ${townData.townName}, CT.

Include:
- Fee: ${(townData.requirements as any)?.fees?.temporary ? `$${(townData.requirements as any).fees.temporary} (temporary)` : 'contact the town for current fees'}
- Form type: ${townData.formType?.replace('_', ' ') || 'PDF download'}
- Portal URL: ${townData.portalUrl || 'N/A'}
- A link to start filing at permitpilot.cloud

Town data: ${JSON.stringify({ townName: townData.townName, county: townData.county, formType: townData.formType, portalUrl: townData.portalUrl })}

Tone: warm, expert, concise (under 150 words). Sign as "The PermitPilot Team".`
    : `Write a helpful, concise email response from PermitPilot to a food truck operator asking about CT food truck permits.

Let them know we cover all 169 CT towns and direct them to permitpilot.cloud to start filing.
Tone: warm, expert, under 100 words. Sign as "The PermitPilot Team".`;

  const replyResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: replyPrompt }],
  });

  const replyBody =
    replyResponse.content[0].type === 'text'
      ? replyResponse.content[0].text.trim()
      : 'Thanks for reaching out! Visit permitpilot.cloud to file your CT food truck permit.';

  const subject = townData
    ? `Re: Food truck permits in ${townData.townName}, CT`
    : `Re: CT food truck permit information`;

  const sent = await sendReply(email.from!, subject, replyBody);

  await logAgentAction({
    agentName: 'permit_inquiry',
    action: 'permit_info_sent',
    input: email.bodyText?.slice(0, 300),
    output: `town: ${townName}, replied: ${sent}`,
    success: sent,
    durationMs: Date.now() - start,
    relatedEmailId: email.id,
  });

  return { replied: sent, action: 'permit_info_sent' };
}

// ─── Sub-agent: Opt-out ───────────────────────────────────────────────────────

async function handleOptOut(
  email: InboundEmail,
): Promise<{ replied: boolean; action: string; truckSlug?: string }> {
  const start = Date.now();

  const senderEmail = (email.from || '').toLowerCase();

  // Find truck by sender email and mark opted out
  const [matched] = await db
    .select()
    .from(foodTrucks)
    .where(eq(foodTrucks.email, senderEmail))
    .limit(1);

  if (matched) {
    await db
      .update(foodTrucks)
      .set({ outreachSent: true, optedOut: true } as any)
      .where(eq(foodTrucks.id, matched.id));
  }

  const listingUrl = matched
    ? `https://permitpilot.cloud/directory/${matched.slug}`
    : 'https://permitpilot.cloud/directory';

  const sent = await sendReply(
    email.from!,
    `You've been removed from PermitPilot outreach`,
    `Hi,\n\nYou've been removed from PermitPilot outreach. You won't receive any further emails from us.\n\nYour listing remains live at ${listingUrl} — reply anytime to claim it or make changes.\n\n— PermitPilot`,
  );

  await logAgentAction({
    agentName: 'optout',
    action: matched ? 'opted_out_truck_found' : 'opted_out_no_match',
    input: senderEmail,
    output: matched ? `suppressed ${matched.slug}` : 'no truck found',
    success: true,
    durationMs: Date.now() - start,
    relatedEmailId: email.id,
    relatedTruckSlug: matched?.slug,
  });

  return { replied: sent, action: 'opted_out', truckSlug: matched?.slug };
}

// ─── Sub-agent: General inquiry ───────────────────────────────────────────────

async function handleGeneralInquiry(
  email: InboundEmail,
): Promise<{ replied: boolean; action: string }> {
  const start = Date.now();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    system:
      'You are the PermitPilot support agent. PermitPilot is Connecticut\'s food truck directory and permit filing app at permitpilot.cloud. Be helpful, warm, and concise. Direct people to permitpilot.cloud for listings and permit filing. Sign as "The PermitPilot Team". Keep responses under 150 words.',
    messages: [
      {
        role: 'user',
        content: `Respond to this inbound email:\n\nSubject: ${email.subject}\n\nBody: ${(email.bodyText || '').slice(0, 800)}`,
      },
    ],
  });

  const replyBody =
    response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : 'Thanks for reaching out! Visit permitpilot.cloud for listings and permit filing.';

  const sent = await sendReply(
    email.from!,
    `Re: ${email.subject || 'Your message to PermitPilot'}`,
    replyBody,
  );

  await logAgentAction({
    agentName: 'general_inquiry',
    action: 'general_reply_sent',
    input: email.bodyText?.slice(0, 300),
    output: `replied: ${sent}`,
    success: sent,
    durationMs: Date.now() - start,
    relatedEmailId: email.id,
  });

  return { replied: sent, action: 'general_reply_sent' };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function processInboundEmail(emailId: number): Promise<void> {
  const startTime = Date.now();

  const [email] = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.id, emailId))
    .limit(1);

  if (!email) return;

  try {
    const intent = await classifyEmailIntent(email);

    // Update record with classified intent
    await db
      .update(inboundEmails)
      .set({ intent, handledBy: 'orchestrator' })
      .where(eq(inboundEmails.id, emailId));

    let result: any;
    switch (intent) {
      case 'claim_listing':
        result = await handleClaimRequest(email);
        break;
      case 'catering_reply':
        result = await handleCateringReply(email);
        break;
      case 'permit_inquiry':
        result = await handlePermitInquiry(email);
        break;
      case 'opt_out':
        result = await handleOptOut(email);
        break;
      case 'general_inquiry':
        result = await handleGeneralInquiry(email);
        break;
      case 'spam':
        result = { replied: false, action: 'ignored' };
        break;
      default:
        result = { replied: false, action: 'unhandled' };
    }

    // Mark reply sent if sub-agent replied
    if (result?.replied) {
      await db
        .update(inboundEmails)
        .set({ replySent: true, replySentAt: new Date(), handledAt: new Date() })
        .where(eq(inboundEmails.id, emailId));
    } else {
      await db
        .update(inboundEmails)
        .set({ handledAt: new Date() })
        .where(eq(inboundEmails.id, emailId));
    }

    await logAgentAction({
      agentName: 'orchestrator',
      action: `classified as ${intent}, routed to sub-agent`,
      input: email.bodyText?.slice(0, 500),
      output: JSON.stringify(result),
      success: true,
      durationMs: Date.now() - startTime,
      relatedEmailId: emailId,
      relatedTruckSlug: email.truckSlug,
    });
  } catch (err: any) {
    console.error('[Orchestrator] processInboundEmail failed:', err);
    await logAgentAction({
      agentName: 'orchestrator',
      action: 'processing_failed',
      input: email.bodyText?.slice(0, 500),
      output: err.message,
      success: false,
      errorMessage: err.message,
      durationMs: Date.now() - startTime,
      relatedEmailId: emailId,
    });
  }
}

/**
 * Dry-run classifier — classifies intent but does NOT send any email or update DB.
 * Used by the admin "Test Orchestrator" panel.
 */
export async function classifyEmailDryRun(
  subject: string,
  bodyText: string,
  from?: string,
): Promise<{ intent: EmailIntent; subAgent: string }> {
  const fakeEmail = { from, subject, bodyText } as InboundEmail;
  const intent = await classifyEmailIntent(fakeEmail);

  const subAgentMap: Record<EmailIntent, string> = {
    claim_listing: 'Claim Agent — looks up truck, sets status → claimed, sends confirmation',
    catering_reply: 'Catering Agent — extracts catering fields, updates food_trucks table, confirms',
    permit_inquiry: 'Permit Inquiry Agent — looks up CT town, generates Claude reply with fee/form info',
    opt_out: 'Opt-Out Agent — sets opted_out=true, suppresses future outreach, confirms removal',
    general_inquiry: 'General Inquiry Agent — Claude generates support reply',
    spam: 'Ignored — no action taken',
  };

  return { intent, subAgent: subAgentMap[intent] };
}
