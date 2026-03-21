import { and, eq, or } from "drizzle-orm";
import { db } from "../db";
import { configs } from "@shared/schema";
import { users, type User } from "@shared/models/auth";
import { createHmac, timingSafeEqual } from "crypto";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

type StripeSubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "inactive";
type StripeWebhookEvent = {
  id: string;
  type: string;
  data: { object: any };
};

function getAppBaseUrl() {
  return process.env.APP_BASE_URL || process.env.REPLIT_DEV_DOMAIN || "http://localhost:5000";
}

async function getConfigMap(keys: string[]) {
  const rows = await db.select().from(configs);
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(keys.map((key) => [key, map.get(key) ?? ""])) as Record<string, string>;
}

export async function getBillingConfig() {
  const values = await getConfigMap([
    "pro_price",
    "subscription_plan_name",
    "stripe_publishable_key",
    "stripe_price_id_monthly",
  ]);

  return {
    monthlyPrice: Number(values.pro_price || "29.99"),
    planName: values.subscription_plan_name || "PermitPilot Pro",
    stripePublishableKey: values.stripe_publishable_key || process.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
    stripePriceIdMonthly: values.stripe_price_id_monthly || process.env.STRIPE_PRICE_ID_MONTHLY || "",
    hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}

export function isSubscriptionActive(status?: string | null) {
  return Boolean(status && ACTIVE_SUBSCRIPTION_STATUSES.has(status));
}

export async function getUserBillingStatus(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const config = await getBillingConfig();

  return {
    userId,
    planName: config.planName,
    monthlyPrice: config.monthlyPrice,
    stripeConfigured: Boolean(config.hasStripeSecretKey && config.stripePriceIdMonthly),
    stripePublishableKeyConfigured: Boolean(config.stripePublishableKey),
    hasActiveSubscription: isSubscriptionActive(user?.subscriptionStatus),
    subscriptionStatus: user?.subscriptionStatus || "inactive",
    subscriptionPlan: user?.subscriptionPlan || config.planName,
    currentPeriodEnd: user?.subscriptionCurrentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(user?.subscriptionCancelAtPeriodEnd),
  };
}

export async function ensurePaidPermitAccess(userId: string) {
  const status = await getUserBillingStatus(userId);
  if (status.hasActiveSubscription) return status;

  const error = new Error(`PermitPilot Pro is required to use permit autofill and portal assist. The monthly price is $${status.monthlyPrice.toFixed(2)}.`);
  (error as any).statusCode = 402;
  throw error;
}

async function updateUserSubscription(userId: string, updates: Partial<User>) {
  const [updated] = await db
    .update(users)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

async function getUserByStripeCustomerId(customerId: string) {
  const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
  return user;
}

async function getUserByEmailOrReference(email?: string | null, userId?: string | null) {
  if (userId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user) return user;
  }

  if (email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) return user;
  }

  return null;
}

async function getStripeCustomerByEmail(email: string) {
  const response = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Stripe customer lookup failed (${response.status})`);
  }

  const payload = await response.json() as { data?: Array<{ id: string }> };
  return payload.data?.[0] || null;
}

async function getStripeSubscriptionForCustomer(customerId: string) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Stripe subscription lookup failed (${response.status})`);
  }

  const payload = await response.json() as {
    data?: Array<{
      id: string;
      status: StripeSubscriptionStatus;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
      items?: { data?: Array<{ price?: { id?: string } }> };
    }>;
  };

  const ranked = (payload.data || []).sort((a, b) => {
    const score = (status?: string) => (status === "active" ? 3 : status === "trialing" ? 2 : status === "past_due" ? 1 : 0);
    return score(b.status) - score(a.status);
  });

  return ranked[0] || null;
}

async function getStripeSubscriptionById(subscriptionId: string) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Stripe subscription fetch failed (${response.status})`);
  }

  return response.json() as Promise<{
    id: string;
    status: StripeSubscriptionStatus;
    cancel_at_period_end?: boolean;
    current_period_end?: number;
    customer?: string;
  }>;
}

export async function refreshUserStripeSubscription(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  if (!process.env.STRIPE_SECRET_KEY) {
    return getUserBillingStatus(userId);
  }

  let customerId = user.stripeCustomerId || null;
  if (!customerId && user.email) {
    const customer = await getStripeCustomerByEmail(user.email);
    customerId = customer?.id || null;
  }

  if (!customerId) {
    await updateUserSubscription(userId, {
      subscriptionStatus: "inactive",
      subscriptionPlan: "PermitPilot Pro",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAtPeriodEnd: false,
    });
    return getUserBillingStatus(userId);
  }

  const subscription = await getStripeSubscriptionForCustomer(customerId);
  if (!subscription) {
    await updateUserSubscription(userId, {
      stripeCustomerId: customerId,
      subscriptionStatus: "inactive",
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAtPeriodEnd: false,
    });
    return getUserBillingStatus(userId);
  }

  await updateUserSubscription(userId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPlan: "PermitPilot Pro",
    subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
    subscriptionCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });

  return getUserBillingStatus(userId);
}

export async function createStripeCheckoutSession(userId: string, successUrl?: string, cancelUrl?: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.email) {
    throw new Error("A user email is required before starting checkout");
  }

  const config = await getBillingConfig();
  if (!process.env.STRIPE_SECRET_KEY || !config.stripePriceIdMonthly) {
    throw new Error("Stripe billing is not configured yet. Add STRIPE_SECRET_KEY and stripe_price_id_monthly first.");
  }

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", successUrl || `${getAppBaseUrl()}/dashboard?billing=success`);
  body.set("cancel_url", cancelUrl || `${getAppBaseUrl()}/dashboard?billing=cancelled`);
  body.set("line_items[0][price]", config.stripePriceIdMonthly);
  body.set("line_items[0][quantity]", "1");
  body.set("allow_promotion_codes", "true");
  body.set("customer_email", user.email);
  body.set("client_reference_id", userId);
  body.set("metadata[userId]", userId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe checkout failed: ${errorText}`);
  }

  const session = await response.json() as { url?: string; customer?: string };

  if (typeof session.customer === "string" && session.customer) {
    await updateUserSubscription(userId, { stripeCustomerId: session.customer });
  }

  return { checkoutUrl: session.url || null };
}

export function verifyStripeWebhookSignature(rawBody: Buffer | string | undefined, signatureHeader?: string | string[]) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) {
    throw new Error("Missing Stripe signature header");
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );

  if (!parts.t || !parts.v1) {
    throw new Error("Invalid Stripe signature header");
  }

  const signedPayload = `${parts.t}.${payload}`;
  const expected = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(parts.v1, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error("Invalid Stripe webhook signature");
  }

  return JSON.parse(payload) as StripeWebhookEvent;
}

export async function handleStripeWebhookEvent(event: StripeWebhookEvent) {
  const object = event.data?.object || {};

  if (event.type === "checkout.session.completed") {
    const checkoutUser = await getUserByEmailOrReference(object.customer_email || null, object.client_reference_id || null);
    if (!checkoutUser) return { handled: false, reason: "user_not_found" };

    let subscriptionDetails: Awaited<ReturnType<typeof getStripeSubscriptionById>> | null = null;
    if (typeof object.subscription === "string" && object.subscription) {
      try {
        subscriptionDetails = await getStripeSubscriptionById(object.subscription);
      } catch {
        subscriptionDetails = null;
      }
    }

    await updateUserSubscription(checkoutUser.id, {
      stripeCustomerId: typeof object.customer === "string" ? object.customer : checkoutUser.stripeCustomerId,
      stripeSubscriptionId: typeof object.subscription === "string" ? object.subscription : checkoutUser.stripeSubscriptionId,
      subscriptionStatus: subscriptionDetails?.status || "active",
      subscriptionPlan: "PermitPilot Pro",
      subscriptionCurrentPeriodEnd: subscriptionDetails?.current_period_end ? new Date(subscriptionDetails.current_period_end * 1000) : null,
      subscriptionCancelAtPeriodEnd: Boolean(subscriptionDetails?.cancel_at_period_end),
    });

    return { handled: true, type: event.type, userId: checkoutUser.id };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.payment_succeeded"
  ) {
    const customerId =
      typeof object.customer === "string"
        ? object.customer
        : typeof object.customer?.id === "string"
        ? object.customer.id
        : null;

    if (!customerId) return { handled: false, reason: "customer_missing" };

    const user = await getUserByStripeCustomerId(customerId);
    if (!user) return { handled: false, reason: "user_not_found" };

    const fallbackStatus: StripeSubscriptionStatus =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : event.type === "invoice.payment_failed"
        ? "past_due"
        : "active";

    const rawPeriodEnd = object.current_period_end ?? object.lines?.data?.[0]?.period?.end ?? null;

    await updateUserSubscription(user.id, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: typeof object.id === "string" && object.object === "subscription" ? object.id : user.stripeSubscriptionId,
      subscriptionStatus: (object.status as StripeSubscriptionStatus | undefined) || fallbackStatus,
      subscriptionPlan: "PermitPilot Pro",
      subscriptionCurrentPeriodEnd: rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : user.subscriptionCurrentPeriodEnd,
      subscriptionCancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    });

    return { handled: true, type: event.type, userId: user.id };
  }

  return { handled: false, reason: "event_ignored", type: event.type };
}

export async function setUserSubscriptionStatus(
  userId: string,
  data: {
    subscriptionStatus: StripeSubscriptionStatus;
    subscriptionPlan?: string | null;
    subscriptionCurrentPeriodEnd?: Date | null;
    subscriptionCancelAtPeriodEnd?: boolean;
  },
) {
  await updateUserSubscription(userId, {
    subscriptionStatus: data.subscriptionStatus,
    subscriptionPlan: data.subscriptionPlan || "PermitPilot Pro",
    subscriptionCurrentPeriodEnd: data.subscriptionCurrentPeriodEnd ?? null,
    subscriptionCancelAtPeriodEnd: Boolean(data.subscriptionCancelAtPeriodEnd),
  });

  return getUserBillingStatus(userId);
}
