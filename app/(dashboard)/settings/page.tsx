"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PLANS } from "@/lib/plans";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── OpenAI ────────────────────────────────────────────────────────────────
  const [openaiKey, setOpenaiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // ── GHL ───────────────────────────────────────────────────────────────────
  const [ghlToken, setGhlToken] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [showGhlToken, setShowGhlToken] = useState(false);
  const [ghlConnecting, setGhlConnecting] = useState(false);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [ghlLocationName, setGhlLocationName] = useState("");
  const [ghlSavedLocationId, setGhlSavedLocationId] = useState("");

  // ── Billing ───────────────────────────────────────────────────────────────
  const [billing, setBilling] = useState<{
    planName: string;
    planStatus: string;
    currentPeriodEnd: string | null;
    hasStripeCustomer: boolean;
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState("");

  function showToast(msg: string, duration = 2500) {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  }

  // ── Load session ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) { router.push("/login"); return; }
        setHasKey(d.user.hasOpenaiKey);
      });

    // Load GHL status
    fetch("/api/settings/ghl")
      .then((r) => r.json())
      .then((d) => {
        if (d.connected) {
          setGhlConnected(true);
          setGhlSavedLocationId(d.locationId ?? "");
          setGhlLocationName(d.locationName ?? "Connected");
        }
      })
      .catch(() => {});

    // Load billing status
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((d) => setBilling(d))
      .catch(() => {});

    // Show success toast if coming back from Stripe checkout
    if (searchParams.get("billing") === "success") {
      showToast("Subscription activated! Welcome aboard.");
    }
  }, [router, searchParams]);

  // ── Open Stripe portal ────────────────────────────────────────────────────
  async function openBillingPortal() {
    setBillingLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
      else showToast(d.error ?? "Could not open billing portal");
    } finally {
      setBillingLoading(false);
    }
  }

  // ── Save OpenAI Key ───────────────────────────────────────────────────────
  async function saveOpenaiKey(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings/openai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openaiKey }),
    });
    setSaving(false);
    if (res.ok) {
      setHasKey(true);
      setOpenaiKey("");
      showToast("OpenAI key saved!");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to save key", 3000);
    }
  }

  // ── Connect GHL ───────────────────────────────────────────────────────────
  async function connectGhl(e: React.FormEvent) {
    e.preventDefault();
    if (!ghlToken.trim() || !ghlLocationId.trim()) {
      showToast("Both fields are required", 3000);
      return;
    }
    setGhlConnecting(true);
    const res = await fetch("/api/settings/ghl", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ghlApiToken: ghlToken, ghlLocationId }),
    });
    setGhlConnecting(false);
    if (res.ok) {
      const d = await res.json();
      setGhlConnected(true);
      setGhlSavedLocationId(d.locationId ?? ghlLocationId);
      setGhlLocationName(d.locationName ?? "Connected");
      setGhlToken("");
      setGhlLocationId("");
      showToast("GHL account connected!");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Failed to connect GHL", 4000);
    }
  }

  // ── Test GHL connection ───────────────────────────────────────────────────
  async function testGhl() {
    const res = await fetch("/api/settings/ghl");
    const d = await res.json();
    if (d.connected) {
      showToast("GHL connection is active ✓");
    } else {
      showToast("GHL connection failed — please reconnect", 4000);
    }
  }

  // ── Disconnect GHL ────────────────────────────────────────────────────────
  async function disconnectGhl() {
    if (!confirm("Disconnect your GHL account? This will not affect already-deployed agents.")) return;
    const res = await fetch("/api/settings/ghl", { method: "DELETE" });
    if (res.ok) {
      setGhlConnected(false);
      setGhlSavedLocationId("");
      setGhlLocationName("");
      showToast("GHL account disconnected");
    }
  }

  // ── Webhook URL ───────────────────────────────────────────────────────────
  const webhookBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/ghl`
      : "/api/webhook/ghl";

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      <header className="border-b border-brand-border bg-brand-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* ── OpenAI Key ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-brand-card border border-brand-border rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold mb-1">OpenAI API Key</h2>
          <p className="text-gray-400 text-sm mb-5">
            Used for AI store analysis and chat. Stored securely, never exposed to clients.
          </p>

          {hasKey && (
            <div className="flex items-center gap-2 mb-4 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <span className="text-green-400 text-sm">✓ OpenAI key is configured</span>
            </div>
          )}

          <form onSubmit={saveOpenaiKey} className="space-y-4">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={hasKey ? "Enter new key to replace..." : "sk-proj-..."}
                className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 pr-24 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-gold transition"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <button
              type="submit"
              disabled={saving || !openaiKey}
              className="bg-brand-gold hover:bg-brand-gold-lt disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {saving ? "Saving..." : "Save Key"}
            </button>
          </form>
        </motion.div>

        {/* ── GoHighLevel Integration ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-brand-card border border-brand-border rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold">GoHighLevel Integration</h2>
            {ghlConnected && (
              <span className="flex items-center gap-1.5 text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                Connected
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mb-5">
            Connect your GHL account to deploy live abandoned cart recovery bots via SMS.
          </p>

          {ghlConnected ? (
            /* ── Connected state ─────────────────────────────────────────── */
            <div className="space-y-4">
              <div className="bg-brand-input/60 border border-brand-border-lt rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Connected Account</p>
                <p className="text-white font-medium">{ghlLocationName}</p>
                <p className="text-gray-400 text-sm font-mono">{ghlSavedLocationId}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
                  Inbound Webhook URL (per agent)
                </p>
                <div className="bg-brand-input/60 border border-brand-border-lt rounded-xl px-4 py-3 flex items-center gap-3">
                  <code className="text-brand-gold-lt text-xs flex-1 break-all">
                    {webhookBase}/{"{"}<span className="text-yellow-300">agentId</span>{"}"}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${webhookBase}/{agentId}`);
                      showToast("Copied!");
                    }}
                    className="text-xs text-gray-400 hover:text-white border border-brand-border-lt px-3 py-1.5 rounded-lg transition"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-1.5">
                  Replace <code className="text-yellow-300">{"{agentId}"}</code> with the agent ID shown on the Deploy page.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={testGhl}
                  className="bg-brand-border hover:bg-brand-border-lt text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
                >
                  Test Connection
                </button>
                <button
                  type="button"
                  onClick={disconnectGhl}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-sm font-medium px-5 py-2.5 rounded-xl transition"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            /* ── Connect form ─────────────────────────────────────────────── */
            <form onSubmit={connectGhl} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">GHL API Token</label>
                <div className="relative">
                  <input
                    type={showGhlToken ? "text" : "password"}
                    value={ghlToken}
                    onChange={(e) => setGhlToken(e.target.value)}
                    placeholder="eyJhbGci..."
                    className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 pr-24 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-gold transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGhlToken(!showGhlToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
                  >
                    {showGhlToken ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-1.5">
                  Found in GHL → Settings → Integrations → API Keys
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1.5">GHL Location ID</label>
                <input
                  type="text"
                  value={ghlLocationId}
                  onChange={(e) => setGhlLocationId(e.target.value)}
                  placeholder="aBcDeFgHiJkL..."
                  className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-gold transition"
                />
                <p className="text-gray-500 text-xs mt-1.5">
                  Found in GHL → Settings → Business Profile → Location ID
                </p>
              </div>

              <button
                type="submit"
                disabled={ghlConnecting || !ghlToken.trim() || !ghlLocationId.trim()}
                className="bg-brand-gold hover:bg-brand-gold-lt disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                {ghlConnecting ? "Connecting..." : "Connect GHL"}
              </button>
            </form>
          )}
        </motion.div>
        {/* ── Billing ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-brand-card border border-brand-border rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold mb-1">Billing & Plan</h2>
          <p className="text-gray-400 text-sm mb-5">
            Manage your subscription, upgrade, or cancel anytime.
          </p>

          {billing ? (
            <div className="space-y-4">
              {/* Current plan badge */}
              <div className="bg-brand-input/60 border border-brand-border-lt rounded-xl px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current Plan</p>
                  <p className="text-white font-semibold capitalize text-lg">{billing.planName}</p>
                  {billing.planStatus === "active" && billing.currentPeriodEnd && (
                    <p className="text-gray-400 text-xs mt-0.5">
                      Renews {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                  {billing.planStatus === "past_due" && (
                    <p className="text-red-400 text-xs mt-0.5">Payment past due — please update your card</p>
                  )}
                  {billing.planStatus === "canceled" && (
                    <p className="text-yellow-400 text-xs mt-0.5">Subscription canceled</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  billing.planStatus === "active"
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : billing.planStatus === "past_due"
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-brand-border text-gray-400 border-brand-border-lt"
                }`}>
                  {billing.planStatus === "free" ? "Free" : billing.planStatus}
                </span>
              </div>

              {/* Plan features */}
              {billing.planName in PLANS && (
                <div className="grid grid-cols-2 gap-2">
                  {PLANS[billing.planName as keyof typeof PLANS].features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="text-green-400 text-xs">✓</span> {f}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Link
                  href="/pricing"
                  className="bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold text-sm font-medium px-5 py-2.5 rounded-xl transition"
                >
                  {billing.planName === "free" ? "Upgrade Plan" : "Change Plan"}
                </Link>
                {billing.hasStripeCustomer && (
                  <button
                    type="button"
                    onClick={openBillingPortal}
                    disabled={billingLoading}
                    className="bg-brand-border hover:bg-brand-border-lt disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
                  >
                    {billingLoading ? "Opening..." : "Manage Billing"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-500 text-sm">
              Loading billing info...
            </div>
          )}
        </motion.div>

      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand-input text-white text-sm px-5 py-3 rounded-full shadow-xl border border-brand-border-lt z-50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
