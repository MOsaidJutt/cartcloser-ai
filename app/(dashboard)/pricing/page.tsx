"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { PLANS } from "@/lib/plans";

const PLAN_ORDER = ["free", "starter", "pro", "agency"] as const;
const ADMIN_EMAIL = "nick.gaulton1@gmail.com";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        const email: string = d.user?.email ?? "";
        if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          router.replace("/dashboard");
        } else {
          setReady(true);
        }
      });
  }, [router]);

  if (!ready) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleSelect(plan: string) {
    if (plan === "free") {
      router.push("/dashboard");
      return;
    }
    setLoading(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error ?? "Something went wrong");
      }
    } catch {
      showToast("Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      <header className="border-b border-brand-border bg-brand-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">Pricing</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold mb-4">Simple, transparent pricing</h2>
          <p className="text-gray-400 text-lg">
            Start free. Scale as your store grows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLAN_ORDER.map((planKey, i) => {
            const plan = PLANS[planKey];
            const isPro = planKey === "pro";
            return (
              <motion.div
                key={planKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`relative rounded-2xl border p-6 flex flex-col gap-5 ${
                  isPro
                    ? "bg-brand-gold/10 border-brand-gold/50 ring-2 ring-brand-gold/30"
                    : "bg-brand-card border-brand-border"
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-brand-gold text-[#18110C] font-bold text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-extrabold">
                      {plan.price === 0 ? "Free" : `$${plan.price}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-gray-400 text-sm mb-1">/month</span>
                    )}
                  </div>
                </div>

                <ul className="space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-green-400 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(planKey)}
                  disabled={loading === planKey}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                    isPro
                      ? "bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold"
                      : planKey === "free"
                      ? "bg-brand-input hover:bg-brand-border text-gray-300"
                      : "bg-brand-input hover:bg-brand-border text-white border border-brand-border-lt"
                  }`}
                >
                  {loading === planKey
                    ? "Redirecting..."
                    : planKey === "free"
                    ? "Get Started"
                    : `Get ${plan.name}`}
                </button>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-gray-500 text-sm mt-10">
          All plans include a 7-day free trial. Cancel anytime.
          {" "}
          <Link href="/settings" className="text-brand-gold hover:underline">
            Manage billing in Settings.
          </Link>
        </p>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand-input text-white text-sm px-5 py-3 rounded-full shadow-xl border border-brand-border-lt z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
