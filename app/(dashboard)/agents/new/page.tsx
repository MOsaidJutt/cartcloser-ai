"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

interface AgentData {
  id: string;
  storeName: string;
  botName: string;
  openingMessage: string;
  productCount: number;
  featuredProduct?: string;
}

// ─── CHECKLIST ITEM COMPONENT ─────────────────────────────────────────────────

function CheckItem({ item }: { item: ChecklistItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-2.5"
    >
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
        {item.status === "done" && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
        {item.status === "running" && (
          <div className="w-5 h-5 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
        )}
        {item.status === "error" && (
          <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">✗</div>
        )}
        {item.status === "pending" && (
          <div className="w-5 h-5 rounded-full border-2 border-brand-border-lt" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span
          className={`text-sm font-medium ${
            item.status === "done"
              ? "text-white"
              : item.status === "running"
              ? "text-brand-gold-lt"
              : item.status === "error"
              ? "text-red-400"
              : "text-gray-500"
          }`}
        >
          {item.label}
        </span>
        {item.detail && item.status !== "pending" && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.detail}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── STEP 1: URL Input ────────────────────────────────────────────────────────

function StepUrl({ onNext }: { onNext: (url: string, useAI: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [urlStatus, setUrlStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [productCount, setProductCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!url.trim()) { setUrlStatus("idle"); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setValidating(true);
      setUrlStatus("idle");
      try {
        let checkUrl = url.trim();
        if (!checkUrl.startsWith("http")) checkUrl = "https://" + checkUrl;
        checkUrl = checkUrl.replace(/\/$/, "");

        const res = await fetch(`${checkUrl}/products.json?limit=5`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error("Not ok");
        const data = await res.json();
        if (!Array.isArray(data.products)) throw new Error("No products");

        const res2 = await fetch(`${checkUrl}/products.json?limit=250`, {
          signal: AbortSignal.timeout(10000),
        });
        const data2 = await res2.json();
        setProductCount(data2.products?.length ?? 0);
        setUrlStatus("valid");
      } catch {
        setUrlStatus("invalid");
      } finally {
        setValidating(false);
      }
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [url]);

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Enter Shopify Store URL</h2>
      <p className="text-gray-400 mb-8">
        We&apos;ll deep-scan the entire store and build a personalised AI demo agent.
      </p>

      <div className="space-y-3 mb-6">
        <div className="relative">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="e.g. lynxgolf.co.uk or https://store.myshopify.com"
            className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-gold transition pr-10"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {validating && (
              <div className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
            )}
            {!validating && urlStatus === "valid" && (
              <span className="text-green-400 text-lg">✓</span>
            )}
            {!validating && urlStatus === "invalid" && (
              <span className="text-red-400 text-lg">✗</span>
            )}
          </div>
        </div>

        <AnimatePresence>
          {urlStatus === "valid" && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-green-400 text-sm flex items-center gap-2"
            >
              <span>✓</span> Shopify store detected — {productCount}+ products found
            </motion.p>
          )}
          {urlStatus === "invalid" && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-red-400 text-sm flex items-center gap-2"
            >
              <span>✗</span> Could not find a Shopify store at this URL
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={urlStatus !== "valid"}
          onClick={() => onNext(url.trim(), true)}
          className="bg-brand-gold hover:bg-brand-gold-lt disabled:opacity-40 disabled:cursor-not-allowed text-[#18110C] font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          🤖 AI Analysis <span className="text-brand-gold-lt">(Recommended)</span>
        </button>
        <button
          disabled={urlStatus !== "valid"}
          onClick={() => onNext(url.trim(), false)}
          className="bg-brand-input hover:bg-brand-border disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          ⚡ Quick Setup
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-3 text-center">
        AI Analysis uses GPT-4o to build a full knowledge base from the entire site.
      </p>
    </div>
  );
}

// ─── STEP 2: Scanning with Animated Checklist ─────────────────────────────────

function StepScanning({
  checklist,
  crawlProgress,
  aiProgress,
  onAbort,
}: {
  checklist: ChecklistItem[];
  crawlProgress: { count: number; total: number; path: string } | null;
  aiProgress: { count: number; total: number; label: string } | null;
  onAbort: () => void;
}) {
  const doneCount = checklist.filter((i) => i.status === "done").length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-1">Scanning Store</h2>
        <p className="text-gray-400 text-sm">
          Deep-crawling every page — this takes 60–120 seconds
        </p>
      </div>

      {/* Overall progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Progress</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-brand-input rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-brand-gold-lt rounded-full"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-brand-card border border-brand-border rounded-2xl px-5 py-3 divide-y divide-gray-800/50 mb-6">
        {checklist.map((item) => (
          <CheckItem key={item.id} item={item} />
        ))}
      </div>

      {/* Crawl progress sub-detail */}
      <AnimatePresence>
        {crawlProgress && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-brand-card/50 border border-brand-border rounded-xl px-4 py-3 mb-3"
          >
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span className="font-mono truncate max-w-[200px]">{crawlProgress.path}</span>
              <span>{crawlProgress.count}/{crawlProgress.total} pages</span>
            </div>
            <div className="h-1 bg-brand-input rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-purple-500 rounded-full"
                animate={{
                  width: crawlProgress.total > 0
                    ? `${Math.round((crawlProgress.count / crawlProgress.total) * 100)}%`
                    : "0%",
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI chunk progress sub-detail */}
      <AnimatePresence>
        {aiProgress && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-brand-card/50 border border-brand-border rounded-xl px-4 py-3 mb-3"
          >
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span className="truncate max-w-[220px]">{aiProgress.label}</span>
              <span className="text-brand-gold font-mono">{aiProgress.count}/{aiProgress.total}</span>
            </div>
            <div className="h-1 bg-brand-input rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-brand-gold-lt rounded-full"
                animate={{
                  width: aiProgress.total > 0
                    ? `${Math.round((aiProgress.count / aiProgress.total) * 100)}%`
                    : "0%",
                }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-3" />

      <button
        onClick={onAbort}
        className="w-full text-gray-500 hover:text-red-400 text-sm transition-colors py-2"
      >
        Cancel
      </button>
    </div>
  );
}

// ─── STEP 3: Configure ────────────────────────────────────────────────────────

function StepConfigure({
  agent,
  featuredProduct,
  onSave,
}: {
  agent: AgentData;
  featuredProduct: string;
  onSave: () => void;
}) {
  const [botName, setBotName] = useState(agent.botName);
  const [openingMessage, setOpeningMessage] = useState(agent.openingMessage);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("");
  const [tone, setTone] = useState("casual");
  const [saving, setSaving] = useState(false);

  const preview = openingMessage
    .replace(/{bot_name}/g, botName)
    .replace(/{store_name}/g, agent.storeName)
    .replace(/{customer_name}/g, "Sarah")
    .replace(/{product_name}/g, featuredProduct);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/agents/${agent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botName, openingMessage, couponCode, couponDiscount, tone }),
    });
    setSaving(false);
    onSave();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Configure Your Agent</h2>
      <p className="text-gray-400 mb-2">
        Found <strong className="text-white">{agent.productCount} products</strong> in{" "}
        <strong className="text-white">{agent.storeName}</strong>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Bot Name</label>
            <input
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-gold transition"
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
              className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-gold transition resize-none text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use: {"{bot_name}"}, {"{store_name}"}, {"{customer_name}"}, {"{product_name}"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Coupon Code</label>
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="SAVE10"
                className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-gold transition text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Discount</label>
              <input
                value={couponDiscount}
                onChange={(e) => setCouponDiscount(e.target.value)}
                placeholder="10%"
                className="w-full bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-gold transition text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tone</label>
            <div className="flex gap-2">
              {["casual", "friendly", "professional"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize border ${
                    tone === t
                      ? "bg-brand-gold border-brand-gold text-[#18110C]"
                      : "bg-brand-input border-brand-border-lt text-gray-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Opening Message Preview
          </label>
          <div className="bg-brand-input rounded-2xl p-4 border border-brand-border-lt">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-brand-border-lt">
              <div className="w-8 h-8 rounded-full bg-brand-gold flex items-center justify-center text-xs font-bold">
                {agent.storeName.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold">{botName}</p>
                <p className="text-xs text-green-400">Online</p>
              </div>
            </div>
            <div className="bg-brand-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-100 max-w-[90%]">
              {preview}
            </div>
            <p className="text-xs text-gray-600 mt-2 ml-1">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-8 w-full bg-brand-gold hover:bg-brand-gold-lt disabled:opacity-50 text-[#18110C] font-semibold py-3.5 rounded-xl transition-colors text-lg"
      >
        {saving ? "Creating Agent..." : "Create Agent →"}
      </button>
    </div>
  );
}

// ─── STEP 4: Success ──────────────────────────────────────────────────────────

function StepSuccess({ agentId }: { agentId: string }) {
  const [copied, setCopied] = useState(false);
  const demoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/demo/${agentId}`
      : `/demo/${agentId}`;

  useEffect(() => {
    import("canvas-confetti").then((confetti) => {
      confetti.default({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.5 },
        colors: ["#6366f1", "#8b5cf6", "#a78bfa", "#ffffff"],
      });
    });
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(demoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-md mx-auto text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="text-6xl mb-6"
      >
        🎉
      </motion.div>

      <h2 className="text-2xl font-bold mb-2">Agent Created!</h2>
      <p className="text-gray-400 mb-8">
        Your demo is ready. Share the link below with your prospect.
      </p>

      <div className="bg-brand-input border border-brand-border-lt rounded-2xl p-4 mb-4">
        <p className="text-xs text-gray-500 mb-2 text-left">Your demo link</p>
        <p className="text-brand-gold text-sm break-all text-left font-mono">{demoUrl}</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={copyLink}
          className="w-full bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold font-semibold py-3 rounded-xl transition-colors"
        >
          {copied ? "✓ Copied!" : "📋 Copy Demo Link"}
        </button>
        <a
          href={demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full block bg-brand-input hover:bg-brand-border text-gray-200 font-semibold py-3 rounded-xl transition-colors"
        >
          🧪 Test Demo
        </a>
        <Link
          href="/dashboard"
          className="w-full block text-gray-400 hover:text-white py-3 rounded-xl transition-colors text-sm"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

// ─── INITIAL CHECKLIST ────────────────────────────────────────────────────────

function makeInitialChecklist(): ChecklistItem[] {
  return [
    { id: "products", label: "Fetching product catalog", status: "pending" },
    { id: "sitemap", label: "Reading sitemap & pages", status: "pending" },
    { id: "nav", label: "Discovering navigation links", status: "pending" },
    { id: "crawling", label: "Deep-crawling site content", status: "pending" },
    { id: "ai", label: "AI analyzing store knowledge", status: "pending" },
  ];
}

// Maps an SSE step to checklist IDs
function sseStepToChecklistId(step: string): string {
  if (step === "products") return "products";
  if (step === "sitemap") return "sitemap";
  if (step === "nav") return "nav";
  if (["pages", "policies", "blog", "faq", "crawling"].includes(step)) return "crawling";
  if (step === "ai") return "ai";
  return "";
}

// ─── MAIN WIZARD ──────────────────────────────────────────────────────────────

export default function NewAgentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentData, setAgentData] = useState<AgentData | null>(null);
  const [featuredProduct, setFeaturedProduct] = useState("your recent browse");
  const [error, setError] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(makeInitialChecklist());
  const [crawlProgress, setCrawlProgress] = useState<{
    count: number;
    total: number;
    path: string;
  } | null>(null);
  const [aiProgress, setAiProgress] = useState<{
    count: number;
    total: number;
    label: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function updateChecklist(id: string, patch: Partial<ChecklistItem>) {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function handleUrlSubmit(url: string, useAI: boolean) {
    setStep(2);
    setError("");
    setChecklist(makeInitialChecklist());
    setCrawlProgress(null);
    setAiProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl: url, useAI }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(err.error ?? "Failed to create agent");
      }

      // Extract agentId from response header early
      const headerAgentId = res.headers.get("X-Agent-Id");
      if (headerAgentId) setAgentId(headerAgentId);

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: any;
          try { event = JSON.parse(raw); } catch { continue; }

          const { step: evStep, label, done: evDone, count, total, error: evError } = event;

          if (evStep === "done" && event.agent) {
            // Agent is fully built
            const agent = event.agent;
            setAgentId(agent.id);
            setAgentData({
              id: agent.id,
              storeName: agent.storeName,
              botName: agent.botName,
              openingMessage: "Hi! It's {bot_name} from {store_name} 👋 Is this the same {customer_name} who was interested in the {product_name}?",
              productCount: agent.productCount,
            });
            setFeaturedProduct(agent.featuredProduct ?? "your recent browse");
            // Mark all as done
            setChecklist((prev) => prev.map((i) => ({ ...i, status: "done" })));
            setTimeout(() => setStep(3), 600);
            continue;
          }

          if (evError || evStep === "error") {
            setError(label ?? "Something went wrong");
            setStep(1);
            continue;
          }

          const checkId = sseStepToChecklistId(evStep);
          if (!checkId) continue;

          if (evStep === "crawling" && count !== undefined && total !== undefined) {
            // Show sub-progress for crawling
            const path = label?.replace("Scraping ", "") ?? "";
            setCrawlProgress({ count, total, path });
            updateChecklist("crawling", {
              status: "running",
              label: "Deep-crawling site content",
              detail: `${count}/${total} pages`,
            });
          } else if (evStep === "ai" && count !== undefined && total !== undefined && !evDone) {
            // Show AI chunk progress
            setAiProgress({ count, total, label: label ?? `Analyzing batch ${count} of ${total}...` });
            updateChecklist("ai", {
              status: "running",
              label: "AI analyzing store knowledge",
              detail: `Batch ${count}/${total}`,
            });
          } else if (evDone) {
            updateChecklist(checkId, { status: "done", detail: label });
            if (checkId === "crawling") setCrawlProgress(null);
            if (checkId === "ai") setAiProgress(null);

            // Auto-start the next pending item
            setChecklist((prev) => {
              const nextPending = prev.find((i) => i.status === "pending");
              if (!nextPending) return prev;
              return prev.map((i) =>
                i.id === nextPending.id ? { ...i, status: "running" } : i
              );
            });
          } else {
            // Running
            updateChecklist(checkId, { status: "running", detail: label });
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message ?? "Failed to create agent");
        setStep(1);
      }
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      <header className="border-b border-brand-border bg-brand-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">Create New Agent</h1>
          <div className="ml-auto flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  s <= step ? "bg-brand-gold-lt" : "bg-brand-border"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {error && (
          <div className="mb-6 max-w-xl mx-auto bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <StepUrl onNext={handleUrlSubmit} />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <StepScanning
                checklist={checklist}
                crawlProgress={crawlProgress}
                aiProgress={aiProgress}
                onAbort={handleAbort}
              />
            </motion.div>
          )}
          {step === 3 && agentData && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <StepConfigure
                agent={agentData}
                featuredProduct={featuredProduct}
                onSave={() => setStep(4)}
              />
            </motion.div>
          )}
          {step === 4 && agentId && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <StepSuccess agentId={agentId} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
