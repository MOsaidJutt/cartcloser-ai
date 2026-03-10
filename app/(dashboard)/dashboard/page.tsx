"use client";

import { useState, useEffect, useCallback } from "react";
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
  status: string;
  ghlDeployed: boolean;
  createdAt: string;
  _count: { conversations: number };
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
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-full shadow-xl border border-gray-700 z-50"
    >
      {message}
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

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            Cart<span className="text-indigo-400">Closer</span> AI
          </h1>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-gray-800"
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-gray-800"
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
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Create New Agent
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 animate-pulse h-52" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          /* Empty state */
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
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors inline-block"
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
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-indigo-500/40 transition-colors hover:shadow-2xl hover:shadow-indigo-900/10 group cursor-default"
                >
                  {/* Store header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                        {agent.storeName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{agent.storeName}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[140px]">
                          {agent.storeUrl.replace(/^https?:\/\//, "")}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={agent.status} />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 mb-5 flex-wrap">
                    <span className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full">
                      {agent.productCount} products
                    </span>
                    <span
                      title="Times the demo was opened"
                      className="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-800/40 px-2.5 py-1 rounded-full"
                    >
                      👁 {agent.demoViews ?? 0} views
                    </span>
                    <span
                      title="Total conversations started"
                      className="text-xs bg-green-900/30 text-green-400 border border-green-800/30 px-2.5 py-1 rounded-full"
                    >
                      💬 {agent._count?.conversations ?? 0} chats
                    </span>
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
                        className="w-full bg-indigo-600/10 hover:bg-indigo-600/25 border border-indigo-500/30 hover:border-indigo-500/60 text-indigo-400 text-sm font-medium py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-900/20"
                      >
                        Copy Demo Link
                      </motion.button>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/agents/${agent.id}/edit`}
                        className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-xl transition-colors"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(agent.id)}
                        className="flex-1 bg-gray-800 hover:bg-red-900/30 hover:text-red-400 text-gray-300 text-sm py-2 rounded-xl transition-colors"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Phase 2 GHL button — greyed out */}
                    <div className="relative group/ghl">
                      <button
                        disabled
                        className="w-full bg-gray-800/50 text-gray-600 text-sm py-2 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <span>🔒</span> Export to GHL
                        <span className="text-xs bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded">
                          Phase 2
                        </span>
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/ghl:block bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-xl border border-gray-700">
                        GoHighLevel integration coming in Phase 2
                      </div>
                    </div>
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
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-semibold mb-2">Delete Agent?</h3>
              <p className="text-gray-400 text-sm mb-6">
                This will permanently delete the agent and all its conversation history.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl transition-colors"
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

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast("")} />}
      </AnimatePresence>
    </div>
  );
}
