import sgMail from '@sendgrid/mail';
import { db } from '../db';
import { foodTrucks } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

function buildOutreachEmail(truckName: string, slug: string): sgMail.MailDataRequired {
  const listingUrl = `https://permitpilot.cloud/directory/${slug}`;
  return {
    to: '',
    from: {
      email: 'hello@permitpilot.cloud',
      name: 'PermitPilot',
    },
    subject: `We built your PermitPilot listing — claim it free`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'DM Sans', Arial, sans-serif; background: #F5F7FA; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background: #0A0F1E; padding: 32px 40px; text-align: center; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; }
    .header-title span { color: #1B4FD8; }
    .body { padding: 36px 40px; }
    .body h2 { font-size: 20px; color: #0A0F1E; margin: 0 0 12px; }
    .body p { font-size: 15px; color: #444; line-height: 1.7; margin: 0 0 20px; }
    .listing-box { background: #F5F7FA; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin: 24px 0; }
    .listing-box .truck-name { font-size: 18px; font-weight: 700; color: #0A0F1E; margin: 0 0 4px; }
    .listing-box .listing-url { font-size: 13px; color: #1B4FD8; }
    .cta-btn { display: block; background: #1B4FD8; color: #ffffff !important; text-decoration: none; text-align: center; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 24px 0; }
    .permit-note { background: #E1F5EE; border-radius: 8px; padding: 16px 20px; }
    .permit-note p { color: #085041; font-size: 14px; margin: 0; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #eee; }
    .footer p { font-size: 12px; color: #8897B2; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">Permit<span>Pilot</span></p>
    </div>
    <div class="body">
      <h2>Hey ${truckName} — your listing is ready.</h2>
      <p>We're building Connecticut's most complete food truck directory, and we already created a page for you. It's live right now — no signup required to view it.</p>
      <div class="listing-box">
        <p class="truck-name">${truckName}</p>
        <p class="listing-url">${listingUrl}</p>
      </div>
      <a href="${listingUrl}" class="cta-btn">View &amp; Claim Your Free Listing &rarr;</a>
      <p>Claiming your listing is free and takes 2 minutes. Once claimed, you can update your description, add photos, list your menu, and control where you show up on the map.</p>
      <div class="permit-note">
        <p>&#x1F7E2; <strong>Bonus:</strong> PermitPilot also auto-files Connecticut health department permits for food trucks — town by town, forms pre-filled. Operators save hours per permit.</p>
      </div>
    </div>
    <div class="footer">
      <p>PermitPilot &middot; Connecticut's Food Truck Hub &middot; <a href="https://permitpilot.cloud">permitpilot.cloud</a></p>
      <p style="margin-top:8px;">You received this because your truck appears in CT food truck directories. Reply to opt out.</p>
    </div>
  </div>
</body>
</html>
    `,
    text: `Hey ${truckName} — we built your PermitPilot listing. View and claim it free at ${listingUrl}. PermitPilot is Connecticut's food truck directory + permit filing app. Reply to opt out.`,
  };
}

async function extractEmailFromWebsite(website: string): Promise<string | null> {
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PermitPilot/1.0 (directory listing bot)' },
    });
    clearTimeout(timeout);
    const html = await response.text();
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) || [];
    const filtered = matches.filter(
      (e) =>
        !e.includes('sentry') &&
        !e.includes('example') &&
        !e.includes('.png') &&
        !e.includes('.jpg') &&
        !e.includes('wix') &&
        !e.includes('squarespace'),
    );
    return filtered[0] || null;
  } catch {
    return null;
  }
}

export interface OutreachResult {
  name: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  email?: string;
  error?: string;
}

export interface OutreachSummary {
  sent: number;
  failed: number;
  skipped: number;
  results: OutreachResult[];
}

export async function runOutreachAgent(): Promise<OutreachSummary> {
  const results: OutreachResult[] = [];
  let sent = 0, failed = 0, skipped = 0;

  const trucks = await db
    .select()
    .from(foodTrucks)
    .where(and(eq(foodTrucks.status, 'unclaimed'), eq(foodTrucks.outreachSent, false)));

  for (const truck of trucks) {
    if (!truck.website && !truck.email) {
      skipped++;
      results.push({ name: truck.name, status: 'skipped', reason: 'no website or email' });
      continue;
    }

    let contactEmail = truck.email;

    if (!contactEmail && truck.website) {
      contactEmail = await extractEmailFromWebsite(truck.website);
    }

    if (!contactEmail) {
      skipped++;
      results.push({ name: truck.name, status: 'skipped', reason: 'could not find email' });
      continue;
    }

    try {
      const msg = buildOutreachEmail(truck.name, truck.slug);
      msg.to = contactEmail;
      await sgMail.send(msg);

      await db
        .update(foodTrucks)
        .set({ outreachSent: true, outreachSentAt: new Date() })
        .where(eq(foodTrucks.id, truck.id));

      sent++;
      results.push({ name: truck.name, status: 'sent', email: contactEmail });
    } catch (err: any) {
      failed++;
      results.push({ name: truck.name, status: 'failed', error: err.message });
    }

    // Rate limit: 1 email/second to avoid SendGrid throttling
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { sent, failed, skipped, results };
}

export async function sendTestOutreachEmail(toEmail: string, slug: string): Promise<void> {
  const [truck] = await db.select().from(foodTrucks).where(eq(foodTrucks.slug, slug));
  const truckName = truck?.name ?? slug;
  const msg = buildOutreachEmail(truckName, slug);
  msg.to = toEmail;
  await sgMail.send(msg);
}
