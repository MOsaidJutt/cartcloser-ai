import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export const PLANS = {
  free: {
    name: "Free",
    priceId: null,
    price: 0,
    agents: 1,
    smsPerMonth: 0,
    features: ["1 agent", "Demo mode only", "Knowledge base builder"],
  },
  starter: {
    name: "Starter",
    priceId: process.env.STRIPE_PRICE_STARTER ?? "",
    price: 29,
    agents: 3,
    smsPerMonth: 500,
    features: ["3 agents", "500 SMS/month", "GHL integration", "Shopify order tracking"],
  },
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRICE_PRO ?? "",
    price: 79,
    agents: 10,
    smsPerMonth: 2000,
    features: ["10 agents", "2,000 SMS/month", "GHL integration", "Revenue analytics", "Priority support"],
  },
  agency: {
    name: "Agency",
    priceId: process.env.STRIPE_PRICE_AGENCY ?? "",
    price: 199,
    agents: -1, // unlimited
    smsPerMonth: -1, // unlimited
    features: ["Unlimited agents", "Unlimited SMS", "White-label ready", "Revenue analytics", "Priority support"],
  },
} as const;

export type PlanName = keyof typeof PLANS;

export function getPlanByPriceId(priceId: string): PlanName {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceId === priceId) return key as PlanName;
  }
  return "free";
}
