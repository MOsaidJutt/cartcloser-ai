// ── Server-side only — never import this in client components ────────────────
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-03-25.dahlia",
});

// Re-export plan config for server routes that need both
export { PLANS, getPlanByPriceId } from "./plans";
export type { PlanName } from "./plans";
