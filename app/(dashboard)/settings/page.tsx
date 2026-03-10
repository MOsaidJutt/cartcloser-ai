"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function SettingsPage() {
  const router = useRouter();
  const [openaiKey, setOpenaiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) { router.push("/login"); return; }
        setHasKey(d.user.hasOpenaiKey);
      });
  }, [router]);

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
      setToast("OpenAI key saved!");
      setTimeout(() => setToast(""), 2500);
    } else {
      const d = await res.json();
      setToast(d.error ?? "Failed to save key");
      setTimeout(() => setToast(""), 3000);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* OpenAI Key */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-6"
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
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-24 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {saving ? "Saving..." : "Save Key"}
            </button>
          </form>
        </motion.div>

        {/* Phase 2 — GHL Settings (greyed out) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-900/50 border border-gray-800/50 rounded-2xl p-6 relative overflow-hidden"
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-gray-950/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center z-10">
            <div className="text-center">
              <span className="text-3xl block mb-2">🔒</span>
              <span className="bg-gray-800 text-gray-400 text-sm font-medium px-4 py-2 rounded-full border border-gray-700">
                Coming in Phase 2
              </span>
            </div>
          </div>

          <h2 className="text-lg font-semibold mb-1 text-gray-500">GoHighLevel Integration</h2>
          <p className="text-gray-600 text-sm mb-5">
            Connect your GHL account to deploy live abandoned cart recovery bots.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">GHL API Token</label>
              <input
                disabled
                placeholder="eyJhbGci..."
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-gray-600 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">GHL Location ID</label>
              <input
                disabled
                placeholder="location_..."
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-gray-600 cursor-not-allowed"
              />
            </div>
            <button disabled className="opacity-30 bg-gray-700 text-gray-400 font-semibold px-6 py-2.5 rounded-xl cursor-not-allowed">
              Connect GHL
            </button>
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-xl border border-gray-700 z-50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
