"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const PLANS = ["free", "starter", "pro", "agency"] as const;
type Plan = (typeof PLANS)[number];

const PLAN_COLORS: Record<Plan, string> = {
  free: "text-gray-400 bg-gray-800/50 border-gray-700",
  starter: "text-blue-400 bg-blue-900/20 border-blue-700/40",
  pro: "text-brand-gold bg-brand-gold/10 border-brand-gold/30",
  agency: "text-purple-400 bg-purple-900/20 border-purple-700/40",
};

interface AgentSummary {
  id: string;
  storeName: string;
  status: string;
  ghlDeployed: boolean;
  conversions: number;
  totalRevenue: number;
  createdAt: string;
  _count: { conversations: number };
}

interface UserRow {
  id: string;
  email: string;
  planName: Plan;
  planStatus: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  agents: AgentSummary[];
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

function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}
    >
      {plan}
    </span>
  );
}

function PlanSelector({
  userId,
  current,
  onChanged,
}: {
  userId: string;
  current: Plan;
  onChanged: (plan: Plan) => void;
}) {
  const [selected, setSelected] = useState<Plan>(current);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (selected === current) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planName: selected }),
    });
    setSaving(false);
    if (res.ok) {
      onChanged(selected);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as Plan)}
        className="bg-brand-input border border-brand-border text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-gold"
      >
        {PLANS.map((p) => (
          <option key={p} value={p} className="bg-brand-card">
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </option>
        ))}
      </select>
      {selected !== current && (
        <button
          onClick={save}
          disabled={saving}
          className="text-xs bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-semibold px-2.5 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      )}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handlePlanChanged(userId: string, newPlan: Plan) {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, planName: newPlan } : u))
    );
    setToast("Plan updated");
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.planName.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = users.reduce(
    (sum, u) => sum + u.agents.reduce((s, a) => s + (a.totalRevenue ?? 0), 0),
    0
  );
  const totalAgents = users.reduce((sum, u) => sum + u.agents.length, 0);
  const totalConversions = users.reduce(
    (sum, u) => sum + u.agents.reduce((s, a) => s + (a.conversions ?? 0), 0),
    0
  );

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      {/* Header */}
      <header className="border-b border-brand-border bg-brand-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">
              SMS2<span className="text-brand-gold">Cart</span>
            </h1>
            <span className="text-xs bg-brand-gold/20 text-brand-gold border border-brand-gold/30 px-2 py-0.5 rounded-full font-semibold">
              ADMIN
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-brand-input"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Stats overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: users.length },
            { label: "Total Agents", value: totalAgents },
            { label: "Total Sales", value: totalConversions },
            { label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-brand-card border border-brand-border rounded-xl p-4"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold">All Users</h2>
          <input
            type="text"
            placeholder="Search by email or plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-brand-input border border-brand-border text-white text-sm rounded-xl px-4 py-2 w-64 focus:outline-none focus:border-brand-gold placeholder:text-gray-600"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-brand-card border border-brand-border rounded-xl p-5 h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-16">No users found.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((user) => {
              const userRevenue = user.agents.reduce((s, a) => s + (a.totalRevenue ?? 0), 0);
              const userConversions = user.agents.reduce((s, a) => s + (a.conversions ?? 0), 0);
              const isExpanded = expandedUser === user.id;

              return (
                <motion.div
                  key={user.id}
                  layout
                  className="bg-brand-card border border-brand-border rounded-xl overflow-hidden hover:border-brand-border-lt transition-colors"
                >
                  {/* User row */}
                  <div className="p-5 flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center text-brand-gold font-bold text-sm shrink-0">
                      {user.email.charAt(0).toUpperCase()}
                    </div>

                    {/* Email + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{user.email}</p>
                      <p className="text-xs text-gray-500">
                        Joined {new Date(user.createdAt).toLocaleDateString()} ·{" "}
                        {user.agents.length} agent{user.agents.length !== 1 ? "s" : ""}
                        {userConversions > 0 && ` · ${userConversions} sales`}
                        {userRevenue > 0 && ` · $${userRevenue.toFixed(2)} revenue`}
                      </p>
                    </div>

                    {/* Plan badge */}
                    <PlanBadge plan={user.planName} />

                    {/* Plan selector */}
                    <PlanSelector
                      userId={user.id}
                      current={user.planName}
                      onChanged={(plan) => handlePlanChanged(user.id, plan)}
                    />

                    {/* Expand toggle */}
                    {user.agents.length > 0 && (
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                        className="text-xs text-gray-500 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1.5 rounded-lg transition shrink-0"
                      >
                        {isExpanded ? "Hide" : `View ${user.agents.length} agent${user.agents.length !== 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>

                  {/* Agents sub-table */}
                  <AnimatePresence>
                    {isExpanded && user.agents.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-brand-border bg-brand-bg/50 overflow-hidden"
                      >
                        <div className="p-4 space-y-2">
                          {user.agents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex items-center gap-3 bg-brand-card border border-brand-border rounded-lg px-4 py-2.5"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{agent.storeName}</p>
                                <p className="text-xs text-gray-500">
                                  {agent._count.conversations} chats · {agent.conversions} sales
                                  {agent.totalRevenue > 0 && ` · $${agent.totalRevenue.toFixed(2)}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {agent.ghlDeployed && (
                                  <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                    GHL Live
                                  </span>
                                )}
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full border ${
                                    agent.status === "ready"
                                      ? "text-green-400 bg-green-500/10 border-green-500/20"
                                      : "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                                  }`}
                                >
                                  {agent.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast("")} />}
      </AnimatePresence>
    </div>
  );
}
