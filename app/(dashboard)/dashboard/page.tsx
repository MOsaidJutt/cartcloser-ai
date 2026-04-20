"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface Agent {
  id: string;
  storeName: string;
  storeUrl: string;
  storeLogo: string | null;
  botName: string;
  productCount: number;
  demoViews: number;
  conversions: number;
  totalRevenue: number;
  status: string;
  ghlDeployed: boolean;
  createdAt: string;
  _count: { conversations: number };
}

interface DeployResult {
  webhookUrl: string;
  webhookSecret: string;
  agentId: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: "bg-green-500/20 text-green-400 border-green-500/30",
    building: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full border ${colors[status] ?? colors.building}`}
    >
      {status === "building" ? "Building..." : status === "ready" ? "Ready" : "Error"}
    </span>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand-input text-white text-sm px-5 py-3 rounded-full shadow-xl border border-brand-border-lt z-50"
    >
      {message}
    </motion.div>
  );
}

// ── Deploy modal ──────────────────────────────────────────────────────────────
function DeployModal({
  result,
  onClose,
}: {
  result: DeployResult;
  onClose: () => void;
}) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  function copy(text: string, which: "url" | "secret") {
    navigator.clipboard.writeText(text);
    if (which === "url") { setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000); }
    else { setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000); }
  }

  return (
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
        className="bg-brand-card border border-brand-border rounded-2xl p-6 max-w-lg w-full"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400">
            ✓
          </div>
          <div>
            <h3 className="text-lg font-semibold">Agent Deployed to GHL</h3>
            <p className="text-gray-400 text-sm">Configure this webhook in your GHL workflow</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
              Webhook URL
            </label>
            <div className="flex items-center gap-2 bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3">
              <code className="text-brand-gold-lt text-xs flex-1 break-all">{result.webhookUrl}</code>
              <button
                onClick={() => copy(result.webhookUrl, "url")}
                className="text-xs text-gray-400 hover:text-white border border-brand-border-lt px-2.5 py-1.5 rounded-lg transition shrink-0"
              >
                {copiedUrl ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
              Webhook Secret (HMAC)
            </label>
            <div className="flex items-center gap-2 bg-brand-input border border-brand-border-lt rounded-xl px-4 py-3">
              <code className="text-yellow-300 text-xs flex-1 break-all font-mono">{result.webhookSecret}</code>
              <button
                onClick={() => copy(result.webhookSecret, "secret")}
                className="text-xs text-gray-400 hover:text-white border border-brand-border-lt px-2.5 py-1.5 rounded-lg transition shrink-0"
              >
                {copiedSecret ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-1.5">
              Paste this secret into the GHL webhook settings so messages are verified securely.
            </p>
          </div>

          <div className="bg-brand-gold/10 border border-brand-gold/20 rounded-xl px-4 py-3 text-sm text-brand-gold-lt">
            <strong>Next steps in GHL:</strong>
            <ol className="mt-2 space-y-1 text-brand-gold-lt/80 list-decimal list-inside text-xs">
              <li>Go to Automations → Create Workflow → SMS Inbound trigger</li>
              <li>Add a Webhook action, paste the URL above</li>
              <li>Add the secret to the webhook header verification</li>
              <li>Activate the workflow</li>
            </ol>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 bg-brand-input hover:bg-brand-border text-gray-300 py-2.5 rounded-xl transition-colors"
        >
          Close
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const chatClicksRef = useRef<Record<string, number>>({});
  const chatClickTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  function copyDemoLink(id: string) {
    const url = `${window.location.origin}/demo/${id}`;
    navigator.clipboard.writeText(url);
    setToast("Demo link copied!");
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setDeleteTarget(null);
    setDeleting(false);
    setToast("Agent deleted");
  }

  async function handleDeploy(agentId: string) {
    setDeployingId(agentId);
    const res = await fetch(`/api/agents/${agentId}/deploy-ghl`, { method: "POST" });
    const data = await res.json();
    setDeployingId(null);

    if (!res.ok) {
      setToast(data.error ?? "Deploy failed");
      return;
    }

    // Update agent in list
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, ghlDeployed: true } : a))
    );
    setDeployResult(data);
  }

  async function handleExportSnapshot(agentId: string, storeName: string) {
    setExportingId(agentId);
    const res = await fetch(`/api/agents/${agentId}/export-snapshot`, { method: "POST" });
    setExportingId(null);
    if (!res.ok) {
      const d = await res.json();
      setToast(d.error ?? "Export failed");
      return;
    }
    // Trigger browser download
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sms2cart-snapshot-${storeName.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Snapshot downloaded!");
  }

  async function handleUndeploy(agentId: string) {
    if (!confirm("Remove this agent from GHL? The webhook will stop working.")) return;
    const res = await fetch(`/api/agents/${agentId}/undeploy-ghl`, { method: "DELETE" });
    if (res.ok) {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, ghlDeployed: false } : a))
      );
      setToast("Agent undeployed from GHL");
    }
  }

  function handleChatBadgeClick(agentId: string) {
    const count = (chatClicksRef.current[agentId] ?? 0) + 1;
    chatClicksRef.current[agentId] = count;
    if (chatClickTimersRef.current[agentId]) clearTimeout(chatClickTimersRef.current[agentId]);
    if (count >= 3) {
      chatClicksRef.current[agentId] = 0;
      router.push(`/agents/${agentId}/conversations`);
      return;
    }
    chatClickTimersRef.current[agentId] = setTimeout(() => {
      chatClicksRef.current[agentId] = 0;
    }, 2000);
  }

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      {/* Header */}
      <header className="border-b border-brand-border bg-brand-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            SMS2<span className="text-brand-gold">Cart</span>.com
          </h1>
          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-brand-input"
            >
              Pricing
            </Link>
            <Link
              href="/settings"
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-brand-input"
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-brand-input"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Your Demo Agents</h2>
            <p className="text-gray-400 text-sm mt-1">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} created
            </p>
          </div>
          <Link
            href="/agents/new"
            className="bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Create New Agent
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-brand-card border border-brand-border rounded-2xl p-6 animate-pulse h-52" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-24"
          >
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">No agents yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first demo agent by entering a Shopify store URL.
            </p>
            <Link
              href="/agents/new"
              className="bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold font-semibold px-6 py-3 rounded-xl transition-colors inline-block"
            >
              Create Your First Agent
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {agents.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 32, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94, y: -10 }}
                  transition={{ delay: i * 0.07, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="bg-brand-card border border-brand-border rounded-2xl p-6 hover:border-brand-gold/40 transition-colors hover:shadow-2xl hover:shadow-brand-gold/10 group cursor-default"
                >
                  {/* Store header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center text-brand-gold font-bold text-sm">
                        {agent.storeName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{agent.storeName}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[140px]">
                          {agent.storeUrl.replace(/^https?:\/\//, "")}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusBadge status={agent.status} />
                      {agent.ghlDeployed && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          GHL Live
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 mb-5 flex-wrap">
                    <span className="text-xs bg-brand-input text-gray-300 px-2.5 py-1 rounded-full">
                      {agent.productCount} products
                    </span>
                    <span
                      title="Times the demo was opened"
                      className="text-xs bg-brand-gold/15 text-brand-gold border border-brand-gold/20 px-2.5 py-1 rounded-full"
                    >
                      👁 {agent.demoViews ?? 0} views
                    </span>
                    <button
                      title="Total conversations started"
                      onClick={() => handleChatBadgeClick(agent.id)}
                      className="text-xs bg-green-900/30 text-green-400 border border-green-800/30 px-2.5 py-1 rounded-full cursor-default select-none"
                    >
                      💬 {agent._count?.conversations ?? 0} chats
                    </button>
                    <span
                      title="Shopify orders completed via SMS"
                      className="text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-800/30 px-2.5 py-1 rounded-full"
                    >
                      🛒 {agent.conversions ?? 0} sales
                    </span>
                    {(agent.totalRevenue ?? 0) > 0 && (
                      <span
                        title="Revenue tracked from Shopify orders"
                        className="text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-800/30 px-2.5 py-1 rounded-full font-semibold"
                      >
                        💰 ${(agent.totalRevenue ?? 0).toFixed(2)}
                      </span>
                    )}
                    <span className="text-xs text-gray-600 ml-auto">
                      {new Date(agent.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    {agent.status === "ready" && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => copyDemoLink(agent.id)}
                        className="w-full bg-brand-gold/10 hover:bg-brand-gold/25 border border-brand-gold/30 hover:border-brand-gold/60 text-brand-gold text-sm font-medium py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-brand-gold/10"
                      >
                        Copy Demo Link
                      </motion.button>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/agents/${agent.id}/edit`}
                        className="flex-1 text-center bg-brand-input hover:bg-brand-border text-gray-300 text-sm py-2 rounded-xl transition-colors"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(agent.id)}
                        className="flex-1 bg-brand-input hover:bg-red-900/30 hover:text-red-400 text-gray-300 text-sm py-2 px-3 rounded-xl transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {/* GHL Deploy / Undeploy */}
                    {agent.status === "ready" ? (
                      agent.ghlDeployed ? (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDeploy(agent.id)}
                              className="flex-1 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium py-2 rounded-xl transition"
                            >
                              View Webhook
                            </button>
                            <button
                              onClick={() => handleUndeploy(agent.id)}
                              className="flex-1 bg-brand-input hover:bg-red-900/20 hover:text-red-400 text-gray-400 text-xs font-medium py-2 rounded-xl transition"
                            >
                              Undeploy
                            </button>
                          </div>
                          <button
                            onClick={() => handleExportSnapshot(agent.id, agent.storeName)}
                            disabled={exportingId === agent.id}
                            className="w-full bg-brand-gold/10 hover:bg-brand-gold/20 border border-brand-gold/30 text-brand-gold text-xs font-medium py-2 rounded-xl transition disabled:opacity-50"
                          >
                            {exportingId === agent.id ? "Exporting..." : "Export GHL Snapshot ↓"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDeploy(agent.id)}
                          disabled={deployingId === agent.id}
                          className="w-full bg-emerald-600/15 hover:bg-emerald-600/30 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 text-sm font-medium py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deployingId === agent.id ? "Deploying..." : "Deploy to GHL"}
                        </button>
                      )
                    ) : (
                      <button
                        disabled
                        className="w-full bg-brand-input/50 text-gray-600 text-sm py-2 rounded-xl cursor-not-allowed"
                      >
                        Deploy to GHL (agent must be ready)
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
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
              className="bg-brand-card border border-brand-border rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-semibold mb-2">Delete Agent?</h3>
              <p className="text-gray-400 text-sm mb-6">
                This will permanently delete the agent and all its conversation history.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-brand-input hover:bg-brand-border text-gray-300 py-2.5 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteTarget)}
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

      {/* Deploy result modal */}
      <AnimatePresence>
        {deployResult && (
          <DeployModal
            result={deployResult}
            onClose={() => setDeployResult(null)}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast("")} />}
      </AnimatePresence>
    </div>
  );
}
