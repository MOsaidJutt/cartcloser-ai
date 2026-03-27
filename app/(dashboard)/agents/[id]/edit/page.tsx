"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface AgentConfig {
  restrictedTopics?: string[];
  fallbackMessage?: string;
  primaryProducts?: string[];
  disclosureText?: string;
  disableCheckoutLinks?: boolean;
  customInstructions?: string;
}

interface Agent {
  id: string;
  storeName: string;
  storeUrl: string;
  botName: string;
  openingMessage: string;
  couponCode: string | null;
  couponDiscount: string | null;
  tone: string;
  currency: string;
  productCount: number;
  status: string;
  config: string;
  refreshInterval: number | null;
  refreshUnit: string | null;
  nextRefreshAt: string | null;
  lastRefreshedAt: string | null;
}

interface KBSection { heading: string; content: string; }
interface KBData {
  storeName: string;
  productCount: number;
  characterCount: number;
  sections: KBSection[];
}

// ─── KB VIEWER ────────────────────────────────────────────────────────────────

function KnowledgeBaseViewer({ agentId }: { agentId: string }) {
  const [kb, setKb] = useState<KBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingSection, setSavingSection] = useState(false);
  const [checkUrl, setCheckUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlPreview, setUrlPreview] = useState<{ title: string; content: string } | null>(null);
  const [appendingUrl, setAppendingUrl] = useState(false);
  const [kbToast, setKbToast] = useState("");

  const showKbToast = (msg: string) => { setKbToast(msg); setTimeout(() => setKbToast(""), 2500); };

  useEffect(() => {
    fetch(`/api/agents/${agentId}/knowledge-base`)
      .then((r) => r.json())
      .then((d) => {
        setKb(d);
        if (d.sections?.length > 0) setExpanded(d.sections[0].heading);
        setLoading(false);
      });
  }, [agentId]);

  function copyAll() {
    if (!kb) return;
    navigator.clipboard.writeText(kb.sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n---\n\n"));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function saveSection(heading: string) {
    setSavingSection(true);
    const res = await fetch(`/api/agents/${agentId}/knowledge-base`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "update-section", sectionHeading: heading, content: editContent }),
    });
    const d = await res.json();
    setSavingSection(false);
    if (res.ok) {
      setKb((prev) => prev ? { ...prev, sections: d.sections, characterCount: d.characterCount } : prev);
      setEditingSection(null); showKbToast("Section saved!");
    } else { showKbToast(d.error ?? "Failed to save"); }
  }

  async function fetchUrlPreview() {
    if (!checkUrl.trim()) return;
    setFetchingUrl(true); setUrlPreview(null);
    const res = await fetch(`/api/agents/${agentId}/knowledge-base`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fetch-url", url: checkUrl }),
    });
    const d = await res.json();
    setFetchingUrl(false);
    if (res.ok && d.title) setUrlPreview({ title: d.title, content: d.content });
    else showKbToast(d.error ?? "Could not fetch URL");
  }

  async function appendUrl() {
    if (!urlPreview) return;
    setAppendingUrl(true);
    const res = await fetch(`/api/agents/${agentId}/knowledge-base`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "append-section", title: urlPreview.title, content: urlPreview.content }),
    });
    const d = await res.json();
    setAppendingUrl(false);
    if (res.ok) {
      setKb((prev) => prev ? { ...prev, sections: d.sections, characterCount: d.characterCount } : prev);
      setUrlPreview(null); setCheckUrl(""); showKbToast("Section added!");
    } else { showKbToast(d.error ?? "Failed to append"); }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!kb) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-400">{kb.sections.length} sections · {kb.characterCount.toLocaleString()} chars</div>
        <button onClick={copyAll} className="text-xs text-indigo-400 hover:text-indigo-300 transition">
          {copied ? "Copied!" : "Copy All"}
        </button>
      </div>
      <div className="space-y-2 mb-8">
        {kb.sections.map((s) => (
          <div key={s.heading} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === s.heading ? null : s.heading)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-200 hover:text-white transition"
            >
              <span>{s.heading}</span>
              <span className="text-gray-500 text-xs">{expanded === s.heading ? "▲" : "▼"}</span>
            </button>
            <AnimatePresence>
              {expanded === s.heading && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="overflow-hidden border-t border-gray-800">
                  <div className="px-4 py-3">
                    {editingSection === s.heading ? (
                      <div>
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                          rows={8} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 resize-y focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => saveSection(s.heading)} disabled={savingSection}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                            {savingSection ? "Saving..." : "Save"}
                          </button>
                          <button onClick={() => setEditingSection(null)} className="text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg transition">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{s.content.slice(0, 600)}{s.content.length > 600 ? "…" : ""}</p>
                        <button onClick={() => { setEditingSection(s.heading); setEditContent(s.content); setExpanded(s.heading); }}
                          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition">Edit</button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      {/* Add URL section */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Add Content from URL</h4>
        <div className="flex gap-2 mb-3">
          <input value={checkUrl} onChange={(e) => setCheckUrl(e.target.value)} placeholder="https://store.com/faq"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button onClick={fetchUrlPreview} disabled={fetchingUrl || !checkUrl.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition">
            {fetchingUrl ? "Fetching..." : "Fetch"}
          </button>
        </div>
        {urlPreview && (
          <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300">
            <p className="font-semibold text-white mb-1">{urlPreview.title}</p>
            <p className="text-gray-400 line-clamp-3">{urlPreview.content.slice(0, 300)}…</p>
            <button onClick={appendUrl} disabled={appendingUrl}
              className="mt-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition">
              {appendingUrl ? "Adding..." : "Add to Knowledge Base"}
            </button>
          </div>
        )}
      </div>
      <AnimatePresence>
        {kbToast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-xl border border-gray-700 z-50">
            {kbToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CUSTOMISATION PANEL ──────────────────────────────────────────────────────

function CustomisationPanel({ config, onChange }: { config: AgentConfig; onChange: (c: AgentConfig) => void }) {
  const [newTopic, setNewTopic] = useState("");
  const [newProduct, setNewProduct] = useState("");

  return (
    <div className="space-y-6">
      {/* Primary Products */}
      <div>
        <label className="block text-sm font-semibold text-gray-200 mb-1">Primary Products</label>
        <p className="text-xs text-gray-500 mb-2">Bot leads with these products first in every conversation.</p>
        <div className="flex gap-2 mb-2">
          <input value={newProduct} onChange={(e) => setNewProduct(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newProduct.trim()) {
                e.preventDefault();
                onChange({ ...config, primaryProducts: [...(config.primaryProducts ?? []), newProduct.trim()] });
                setNewProduct("");
              }
            }}
            placeholder="e.g. Ozlo Sleepbuds"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button type="button" onClick={() => {
            if (!newProduct.trim()) return;
            onChange({ ...config, primaryProducts: [...(config.primaryProducts ?? []), newProduct.trim()] });
            setNewProduct("");
          }} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-2 rounded-lg transition">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.primaryProducts ?? []).map((p) => (
            <span key={p} className="flex items-center gap-1.5 bg-indigo-600/20 border border-indigo-600/30 text-indigo-300 text-xs px-3 py-1 rounded-full">
              {p}
              <button type="button" onClick={() => onChange({ ...config, primaryProducts: config.primaryProducts?.filter((x) => x !== p) })}
                className="text-indigo-400 hover:text-white transition">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Restricted Topics */}
      <div>
        <label className="block text-sm font-semibold text-gray-200 mb-1">Restricted Topics</label>
        <p className="text-xs text-gray-500 mb-2">Bot will not discuss these — will use fallback message instead.</p>
        <div className="flex gap-2 mb-2">
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTopic.trim()) {
                e.preventDefault();
                onChange({ ...config, restrictedTopics: [...(config.restrictedTopics ?? []), newTopic.trim()] });
                setNewTopic("");
              }
            }}
            placeholder="e.g. phone number, pricing, competitors"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button type="button" onClick={() => {
            if (!newTopic.trim()) return;
            onChange({ ...config, restrictedTopics: [...(config.restrictedTopics ?? []), newTopic.trim()] });
            setNewTopic("");
          }} className="bg-red-700 hover:bg-red-600 text-white text-sm px-3 py-2 rounded-lg transition">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(config.restrictedTopics ?? []).map((t) => (
            <span key={t} className="flex items-center gap-1.5 bg-red-900/20 border border-red-800/30 text-red-300 text-xs px-3 py-1 rounded-full">
              {t}
              <button type="button" onClick={() => onChange({ ...config, restrictedTopics: config.restrictedTopics?.filter((x) => x !== t) })}
                className="text-red-400 hover:text-white transition">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Fallback message */}
      <div>
        <label className="block text-sm font-semibold text-gray-200 mb-1">Fallback Message</label>
        <p className="text-xs text-gray-500 mb-2">Sent when a restricted topic is raised.</p>
        <input value={config.fallbackMessage ?? ""}
          onChange={(e) => onChange({ ...config, fallbackMessage: e.target.value })}
          placeholder="For more help, please reach out to us via email."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>

      {/* Disclosure text */}
      <div>
        <label className="block text-sm font-semibold text-gray-200 mb-1">Disclosure Text (optional)</label>
        <p className="text-xs text-gray-500 mb-2">Appended to the opening message. E.g. &quot;Note: this is an automated assistant.&quot;</p>
        <input value={config.disclosureText ?? ""}
          onChange={(e) => onChange({ ...config, disclosureText: e.target.value })}
          placeholder="Note: this is an automated assistant."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      </div>

      {/* Disable checkout links */}
      <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-200">Information-only mode</p>
          <p className="text-xs text-gray-500 mt-0.5">Disable checkout links — bot answers questions only, no purchase links sent.</p>
        </div>
        <button type="button"
          onClick={() => onChange({ ...config, disableCheckoutLinks: !config.disableCheckoutLinks })}
          className={`relative w-11 h-6 rounded-full transition-colors ${config.disableCheckoutLinks ? "bg-indigo-600" : "bg-gray-600"}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${config.disableCheckoutLinks ? "translate-x-5" : ""}`} />
        </button>
      </div>

      {/* Custom instructions */}
      <div>
        <label className="block text-sm font-semibold text-gray-200 mb-1">Custom Instructions</label>
        <p className="text-xs text-gray-500 mb-2">Extra rules injected directly into the bot&apos;s system prompt for this client.</p>
        <textarea value={config.customInstructions ?? ""}
          onChange={(e) => onChange({ ...config, customInstructions: e.target.value })}
          rows={4} placeholder="e.g. Always mention our 30-day free trial. Never discuss returns over $500."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
      </div>
    </div>
  );
}

// ─── REFRESH SCHEDULER ────────────────────────────────────────────────────────

function RefreshScheduler({ refreshInterval, refreshUnit, nextRefreshAt, lastRefreshedAt, onChange }: {
  refreshInterval: number | null;
  refreshUnit: string | null;
  nextRefreshAt: string | null;
  lastRefreshedAt: string | null;
  onChange: (interval: number, unit: string) => void;
}) {
  const [interval, setInterval] = useState(refreshInterval ?? 0);
  const [unit, setUnit] = useState(refreshUnit ?? "week");

  function computePreview(n: number, u: string): string {
    if (!n || n <= 0) return "Disabled";
    const now = new Date();
    if (u === "day")   now.setDate(now.getDate() + n);
    if (u === "week")  now.setDate(now.getDate() + n * 7);
    if (u === "month") now.setMonth(now.getMonth() + n);
    now.setHours(3, 0, 0, 0);
    return now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " at 03:00 AM (UTC)";
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Knowledge Base Auto-Refresh</h3>
      <p className="text-xs text-gray-500 mb-4">Bot will automatically re-scrape the store and rebuild its knowledge base on this schedule.</p>

      <div className="flex gap-3 items-end mb-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Refresh every</label>
          <input type="number" min={0} max={99} value={interval || ""}
            onChange={(e) => { const v = parseInt(e.target.value) || 0; setInterval(v); onChange(v, unit); }}
            placeholder="e.g. 2"
            className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Unit</label>
          <select value={unit} onChange={(e) => { setUnit(e.target.value); onChange(interval, e.target.value); }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="day">Day(s)</option>
            <option value="week">Week(s)</option>
            <option value="month">Month(s)</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg px-4 py-3 text-xs space-y-1">
        <div className="flex gap-2">
          <span className="text-gray-500">Next refresh:</span>
          <span className={interval > 0 ? "text-green-400 font-medium" : "text-gray-500"}>
            {computePreview(interval, unit)}
          </span>
        </div>
        {lastRefreshedAt && (
          <div className="flex gap-2">
            <span className="text-gray-500">Last refreshed:</span>
            <span className="text-gray-400">{new Date(lastRefreshedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
        {nextRefreshAt && interval > 0 && (
          <div className="flex gap-2">
            <span className="text-gray-500">Saved next run:</span>
            <span className="text-gray-400">{new Date(nextRefreshAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function EditAgentPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "customise" | "knowledge">("settings");

  // Basic settings
  const [botName, setBotName] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("");
  const [tone, setTone] = useState("casual");

  // Per-agent config
  const [config, setConfig] = useState<AgentConfig>({});

  // Refresh schedule
  const [refreshInterval, setRefreshInterval] = useState<number>(0);
  const [refreshUnit, setRefreshUnit] = useState<string>("week");

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); }, []);

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.agent) { router.push("/dashboard"); return; }
        const a: Agent = d.agent;
        setAgent(a);
        setBotName(a.botName);
        setOpeningMessage(a.openingMessage);
        setCouponCode(a.couponCode ?? "");
        setCouponDiscount(a.couponDiscount ?? "");
        setTone(a.tone ?? "casual");
        setConfig(a.config ? JSON.parse(a.config) : {});
        setRefreshInterval(a.refreshInterval ?? 0);
        setRefreshUnit(a.refreshUnit ?? "week");
        setLoading(false);
      });
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botName, openingMessage, couponCode, couponDiscount, tone,
        config,
        refreshInterval,
        refreshUnit,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setAgent(d.agent);
      showToast("Changes saved!");
    } else { showToast("Failed to save"); }
  }

  async function handleRescan() {
    setRescanning(true);
    const res = await fetch(`/api/agents/${id}/scrape`, { method: "POST" });
    setRescanning(false);
    if (res.ok) {
      const d = await res.json();
      setAgent((prev) => prev ? { ...prev, productCount: d.productCount, status: "ready" } : prev);
      showToast(`Store re-scanned — ${d.productCount} products`);
    } else { showToast("Re-scan failed"); }
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) return null;

  const preview = openingMessage
    .replace(/{bot_name}/g, botName)
    .replace(/{store_name}/g, agent.storeName)
    .replace(/{customer_name}/g, "Sarah")
    .replace(/{product_name}/g, "your selected item");

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</Link>
          <h1 className="text-lg font-semibold">{agent.storeName}</h1>
          <span className="text-xs text-gray-500">{agent.productCount} products</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Tab bar */}
        <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(["settings", "customise", "knowledge"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                activeTab === tab ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white"
              }`}>
              {tab === "settings" ? "Bot Settings" : tab === "customise" ? "Customise" : "Knowledge Base"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── BOT SETTINGS TAB ── */}
          {activeTab === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div>
                  <h2 className="text-xl font-bold mb-6">Bot Settings</h2>
                  <form onSubmit={handleSave} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">Bot Name</label>
                      <input value={botName} onChange={(e) => setBotName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">Opening Message Template</label>
                      <textarea value={openingMessage} onChange={(e) => setOpeningMessage(e.target.value)}
                        rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none text-sm" />
                      <p className="text-xs text-gray-500 mt-1">Variables: {"{bot_name}"}, {"{store_name}"}, {"{customer_name}"}, {"{product_name}"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Coupon Code</label>
                        <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="SAVE10"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Discount</label>
                        <input value={couponDiscount} onChange={(e) => setCouponDiscount(e.target.value)} placeholder="10%"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Tone</label>
                      <div className="flex gap-2">
                        {["casual", "friendly", "professional"].map((t) => (
                          <button key={t} type="button" onClick={() => setTone(t)}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize border ${
                              tone === t ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                            }`}>{t}</button>
                        ))}
                      </div>
                    </div>

                    {/* KB Refresh Scheduler */}
                    <RefreshScheduler
                      refreshInterval={refreshInterval}
                      refreshUnit={refreshUnit}
                      nextRefreshAt={agent.nextRefreshAt}
                      lastRefreshedAt={agent.lastRefreshedAt}
                      onChange={(n, u) => { setRefreshInterval(n); setRefreshUnit(u); }}
                    />

                    <div className="flex gap-3 pt-2">
                      <button type="submit" disabled={saving}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={handleRescan} disabled={rescanning}
                        className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 font-semibold px-4 py-3 rounded-xl transition-colors text-sm">
                        {rescanning ? "Scanning..." : "Re-scan Store"}
                      </button>
                    </div>
                  </form>

                  <div className="mt-10 pt-6 border-t border-gray-800">
                    <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
                    <button onClick={() => setShowDeleteModal(true)}
                      className="bg-red-900/20 hover:bg-red-900/40 border border-red-800/40 text-red-400 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
                      Delete Agent
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <h2 className="text-xl font-bold mb-6">Preview</h2>
                  <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700 mb-4">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-700">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">{agent.storeName.charAt(0)}</div>
                      <div>
                        <p className="text-xs font-semibold">{botName}</p>
                        <p className="text-xs text-green-400">Online</p>
                      </div>
                    </div>
                    <div className="bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-100 max-w-[90%]">{preview}</div>
                    <p className="text-xs text-gray-600 mt-2 ml-1">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                    <p className="text-xs text-gray-500 mb-2">Demo Link</p>
                    <p className="text-indigo-400 text-sm break-all font-mono">
                      {typeof window !== "undefined" ? `${window.location.origin}/demo/${agent.id}` : ""}
                    </p>
                    <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/demo/${agent.id}`); showToast("Demo link copied!"); }}
                      className="mt-3 w-full bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-600/30 text-indigo-400 text-sm py-2 rounded-xl transition-colors">
                      Copy Demo Link
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── CUSTOMISE TAB ── */}
          {activeTab === "customise" && (
            <motion.div key="customise" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              <div className="max-w-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Customise Agent</h2>
                    <p className="text-sm text-gray-400 mt-1">Fine-tune bot behaviour for this specific client.</p>
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
                <CustomisationPanel config={config} onChange={setConfig} />
              </div>
            </motion.div>
          )}

          {/* ── KNOWLEDGE BASE TAB ── */}
          {activeTab === "knowledge" && (
            <motion.div key="knowledge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Knowledge Base</h2>
                    <p className="text-sm text-gray-400 mt-1">Everything your AI agent knows about {agent.storeName}</p>
                  </div>
                  <button onClick={handleRescan} disabled={rescanning}
                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 font-semibold px-4 py-2 rounded-xl transition-colors text-sm border border-gray-700">
                    {rescanning ? "Scanning..." : "Re-scan Store"}
                  </button>
                </div>
                <KnowledgeBaseViewer agentId={id} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Delete modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold mb-2">Delete Agent?</h3>
              <p className="text-gray-400 text-sm mb-6">This will permanently delete the agent and all conversation history. Cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl transition-colors">Cancel</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors font-medium">
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-xl border border-gray-700 z-50">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
