"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

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
}

interface KBSection {
  heading: string;
  content: string;
}

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
  // URL check panel
  const [checkUrl, setCheckUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlPreview, setUrlPreview] = useState<{ title: string; content: string } | null>(null);
  const [appendingUrl, setAppendingUrl] = useState(false);
  const [kbToast, setKbToast] = useState("");

  const showKbToast = (msg: string) => {
    setKbToast(msg);
    setTimeout(() => setKbToast(""), 2500);
  };

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
    const text = kb.sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEdit(section: KBSection) {
    setEditingSection(section.heading);
    setEditContent(section.content);
    setExpanded(section.heading);
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
      setEditingSection(null);
      showKbToast("Section saved!");
    } else {
      showKbToast(d.error ?? "Failed to save");
    }
  }

  async function fetchUrlPreview() {
    if (!checkUrl.trim()) return;
    setFetchingUrl(true);
    setUrlPreview(null);
    const res = await fetch(`/api/agents/${agentId}/knowledge-base`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fetch-page", url: checkUrl.trim() }),
    });
    const d = await res.json();
    setFetchingUrl(false);
    if (res.ok && d.preview) {
      setUrlPreview({ title: d.title, content: d.preview });
    } else {
      showKbToast(d.error ?? "Failed to fetch page");
    }
  }

  async function appendUrlToKb() {
    if (!urlPreview) return;
    setAppendingUrl(true);
    const sectionHeading = `Additional: ${urlPreview.title}`;
    const res = await fetch(`/api/agents/${agentId}/knowledge-base`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "append-section", sectionHeading, content: urlPreview.content }),
    });
    const d = await res.json();
    setAppendingUrl(false);
    if (res.ok) {
      setKb((prev) => prev ? { ...prev, sections: d.sections, characterCount: d.characterCount } : prev);
      setUrlPreview(null);
      setCheckUrl("");
      showKbToast("Page content added to knowledge base!");
    } else {
      showKbToast(d.error ?? "Failed to add content");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!kb || kb.sections.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg mb-2">No knowledge base found</p>
        <p className="text-sm">Re-scan the store to generate a knowledge base.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-4 text-sm text-gray-400">
          <span><strong className="text-white">{kb.sections.length}</strong> sections</span>
          <span><strong className="text-white">{kb.characterCount.toLocaleString()}</strong> chars</span>
          <span><strong className="text-white">{kb.productCount}</strong> products</span>
        </div>
        <button
          onClick={copyAll}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          {copied ? "✓ Copied!" : "Copy All"}
        </button>
      </div>

      {/* Check URL panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5">
        <p className="text-sm font-medium text-gray-200 mb-1">Check a Store Page</p>
        <p className="text-xs text-gray-500 mb-3">
          Enter a URL from this store — the bot will fetch its content and you can add it to the knowledge base.
        </p>
        <div className="flex gap-2">
          <input
            value={checkUrl}
            onChange={(e) => setCheckUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchUrlPreview()}
            placeholder="https://yourstore.com/pages/faq"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
          <button
            onClick={fetchUrlPreview}
            disabled={fetchingUrl || !checkUrl.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            {fetchingUrl ? (
              <span className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Fetching...
              </span>
            ) : "Fetch Page"}
          </button>
        </div>

        <AnimatePresence>
          {urlPreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden"
            >
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-indigo-400 mb-1">{urlPreview.title}</p>
                <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto mb-3">
                  {urlPreview.content}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={appendUrlToKb}
                    disabled={appendingUrl}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {appendingUrl ? "Adding..." : "Add to Knowledge Base"}
                  </button>
                  <button
                    onClick={() => setUrlPreview(null)}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Accordion sections */}
      <div className="space-y-2">
        {kb.sections.map((section) => (
          <div key={section.heading} className="border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center bg-gray-900 hover:bg-gray-800/60 transition-colors">
              <button
                onClick={() => setExpanded(expanded === section.heading ? null : section.heading)}
                className="flex-1 flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-gray-200">{section.heading}</span>
                <span className="text-gray-500 text-xs ml-4 flex-shrink-0">
                  {expanded === section.heading ? "▲" : "▼"}
                </span>
              </button>
              <button
                onClick={() => editingSection === section.heading ? setEditingSection(null) : startEdit(section)}
                className="px-3 py-3 text-gray-500 hover:text-indigo-400 transition-colors text-xs flex-shrink-0"
                title="Edit section"
              >
                {editingSection === section.heading ? "✕" : "Edit"}
              </button>
            </div>
            <AnimatePresence>
              {expanded === section.heading && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-4 bg-gray-950 border-t border-gray-800">
                    {editingSection === section.heading ? (
                      <div>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={10}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-200 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-y"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => saveSection(section.heading)}
                            disabled={savingSection}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                          >
                            {savingSection ? "Saving..." : "Save Section"}
                          </button>
                          <button
                            onClick={() => setEditingSection(null)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
                        {section.content}
                      </pre>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* KB toast */}
      <AnimatePresence>
        {kbToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-xl border border-gray-700 z-50"
          >
            {kbToast}
          </motion.div>
        )}
      </AnimatePresence>
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
  const [activeTab, setActiveTab] = useState<"settings" | "knowledge">("settings");

  // Form state
  const [botName, setBotName] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("");
  const [tone, setTone] = useState("casual");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  useEffect(() => {
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.agent) { router.push("/dashboard"); return; }
        const a = d.agent;
        setAgent(a);
        setBotName(a.botName);
        setOpeningMessage(a.openingMessage);
        setCouponCode(a.couponCode ?? "");
        setCouponDiscount(a.couponDiscount ?? "");
        setTone(a.tone ?? "casual");
        setLoading(false);
      });
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botName, openingMessage, couponCode, couponDiscount, tone }),
    });
    setSaving(false);
    if (res.ok) showToast("Changes saved!");
    else showToast("Failed to save");
  }

  async function handleRescan() {
    setRescanning(true);
    const res = await fetch(`/api/agents/${id}/scrape`, { method: "POST" });
    setRescanning(false);
    if (res.ok) {
      const d = await res.json();
      setAgent((prev) => prev ? { ...prev, productCount: d.productCount, status: "ready" } : prev);
      showToast(`Store re-scanned — ${d.productCount} products`);
    } else {
      showToast("Re-scan failed");
    }
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
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">{agent.storeName}</h1>
          <span className="text-xs text-gray-500">{agent.productCount} products</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Tab bar */}
        <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(["settings", "knowledge"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? "bg-indigo-600 text-white shadow"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "settings" ? "Agent Settings" : "Knowledge Base"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Form */}
                <div>
                  <h2 className="text-xl font-bold mb-6">Edit Agent</h2>
                  <form onSubmit={handleSave} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">Bot Name</label>
                      <input
                        value={botName}
                        onChange={(e) => setBotName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">
                        Opening Message Template
                      </label>
                      <textarea
                        value={openingMessage}
                        onChange={(e) => setOpeningMessage(e.target.value)}
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Variables: {"{bot_name}"}, {"{store_name}"}, {"{customer_name}"}, {"{product_name}"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Coupon Code</label>
                        <input
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                          placeholder="SAVE10"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Discount</label>
                        <input
                          value={couponDiscount}
                          onChange={(e) => setCouponDiscount(e.target.value)}
                          placeholder="10%"
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Tone</label>
                      <div className="flex gap-2">
                        {["casual", "friendly", "professional"].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTone(t)}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize border ${
                              tone === t
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRescan}
                        disabled={rescanning}
                        className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 font-semibold px-4 py-3 rounded-xl transition-colors text-sm"
                      >
                        {rescanning ? "Scanning..." : "Re-scan Store"}
                      </button>
                    </div>
                  </form>

                  {/* Danger zone */}
                  <div className="mt-10 pt-6 border-t border-gray-800">
                    <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="bg-red-900/20 hover:bg-red-900/40 border border-red-800/40 text-red-400 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      Delete Agent
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <h2 className="text-xl font-bold mb-6">Preview</h2>
                  <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700 mb-4">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-700">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
                        {agent.storeName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{botName}</p>
                        <p className="text-xs text-green-400">Online</p>
                      </div>
                    </div>
                    <div className="bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-100 max-w-[90%]">
                      {preview}
                    </div>
                    <p className="text-xs text-gray-600 mt-2 ml-1">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  {/* Demo link */}
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                    <p className="text-xs text-gray-500 mb-2">Demo Link</p>
                    <p className="text-indigo-400 text-sm break-all font-mono">
                      {typeof window !== "undefined" ? `${window.location.origin}/demo/${agent.id}` : ""}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/demo/${agent.id}`);
                        showToast("Demo link copied!");
                      }}
                      className="mt-3 w-full bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-600/30 text-indigo-400 text-sm py-2 rounded-xl transition-colors"
                    >
                      Copy Demo Link
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "knowledge" && (
            <motion.div
              key="knowledge"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Knowledge Base</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      Everything your AI agent knows about {agent.storeName}
                    </p>
                  </div>
                  <button
                    onClick={handleRescan}
                    disabled={rescanning}
                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 font-semibold px-4 py-2 rounded-xl transition-colors text-sm border border-gray-700"
                  >
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-semibold mb-2">Delete Agent?</h3>
              <p className="text-gray-400 text-sm mb-6">
                This will permanently delete the agent and all its conversation history. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors font-medium"
                >
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
