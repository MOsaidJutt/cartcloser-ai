"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ─── HIDDEN TERMINAL ──────────────────────────────────────────────────────────

function TerminalPanel({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<string[]>(["[terminal] Connecting to server logs..."]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const res = await fetch("/api/admin/logs");
        if (!res.ok || !res.body) {
          setLines((p) => [...p, `[error] Could not connect: ${res.status}`]);
          return;
        }
        setConnected(true);
        const reader = res.body.getReader();
        readerRef.current = reader;
        const dec = new TextDecoder();
        let buf = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            try {
              const { line } = JSON.parse(part.slice(6));
              if (line) setLines((p) => [...p.slice(-500), line]);
            } catch {}
          }
        }
      } catch (e: any) {
        if (!cancelled) setLines((p) => [...p, `[error] ${e.message}`]);
      }
    }

    connect();
    return () => {
      cancelled = true;
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1117] border-t border-green-500/30 shadow-2xl"
      style={{ height: "40vh" }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-green-500/20">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
          <span className="text-xs font-mono text-green-400">SERVER LOGS — sms2cart</span>
          <span className="text-xs text-gray-600 font-mono">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLines([])} className="text-xs text-gray-600 hover:text-gray-400 font-mono">clear</button>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-red-400 font-mono">✕ close</button>
        </div>
      </div>
      <div className="overflow-y-auto h-full pb-8 px-4 py-2 font-mono text-xs">
        {lines.map((line, i) => (
          <div key={i} className={`leading-5 ${
            line.includes("[error]") || line.includes("Error") || line.includes("error")
              ? "text-red-400"
              : line.includes("[knowledge-base]") || line.includes("[agents")
              ? "text-green-300"
              : line.includes("warn") || line.includes("WARN")
              ? "text-yellow-400"
              : "text-gray-400"
          }`}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

const PLANS = ["free", "starter", "pro", "agency"] as const;
type Plan = (typeof PLANS)[number];

const PLAN_COLORS: Record<Plan, string> = {
  free: "text-gray-400 bg-gray-800/50 border-gray-700",
  starter: "text-blue-400 bg-blue-900/20 border-blue-700/40",
  pro: "text-brand-gold bg-brand-gold/10 border-brand-gold/30",
  agency: "text-purple-400 bg-purple-900/20 border-purple-700/40",
};

interface CouponSummary {
  id: string;
  code: string;
  active: boolean;
  usedCount: number;
  discountValue: string;
  discountType: string;
}

interface AgentSummary {
  id: string;
  storeName: string;
  storeUrl: string;
  status: string;
  productCount: number;
  ghlDeployed: boolean;
  ghlDeployedAt: string | null;
  conversions: number;
  totalRevenue: number;
  tone: string;
  lastRefreshedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string; planName: string };
  _count: { conversations: number; coupons: number };
  coupons: CouponSummary[];
}

interface UserRow {
  id: string;
  email: string;
  planName: Plan;
  planStatus: string;
  blocked: boolean;
  currentPeriodEnd: string | null;
  createdAt: string;
  agents: AgentSummary[];
}

interface SalesRow {
  id: string;
  visitorName: string;
  productName: string | null;
  checkoutClickedAt: string | null;
  lastCheckoutUrl: string | null;
  convertedAt: string | null;
  shopifyOrderId: string | null;
  shopifyOrderTotal: string | null;
  createdAt: string;
  agent: { id: string; storeName: string; currency: string; user: { id: string; email: string } };
  _count: { messages: number };
}

interface PlatformStats {
  totalUsers: number;
  totalAgents: number;
  totalConversations: number;
  totalMessages: number;
  totalRevenue: number;
  totalConversions: number;
  checkoutClicks: number;
  shopifyConverted: number;
  ghlDeployed: number;
  activeToday: number;
  conversionRate: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-brand-input text-white text-sm px-5 py-3 rounded-full shadow-xl border border-brand-border-lt z-50 whitespace-nowrap"
    >
      {message}
    </motion.div>
  );
}

function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
      {plan}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = status === "ready" ? "text-green-400 bg-green-500/10 border-green-500/20"
    : status === "error" ? "text-red-400 bg-red-500/10 border-red-500/20"
    : "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${colors}`}>{status}</span>;
}

// ─── MODALS ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-brand-card border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-2xl z-10"
      >
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        {children}
      </motion.div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: UserRow) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setSaving(true);
    const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json(); setSaving(false);
    if (!res.ok) { setErr(data.error ?? "Failed"); return; }
    onCreated({ ...data.user, agents: [] }); onClose();
  }
  return (
    <Modal title="Create User" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-brand-input border border-brand-border text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-gold" />
        <input type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full bg-brand-input border border-brand-border text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-gold" />
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-brand-border text-gray-400 rounded-xl py-2 text-sm hover:text-white transition">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold rounded-xl py-2 text-sm disabled:opacity-50">{saving ? "Creating..." : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ChangePasswordModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState(""); const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}/password`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json(); setSaving(false);
    if (!res.ok) { setErr(data.error ?? "Failed"); return; }
    onDone(); onClose();
  }
  return (
    <Modal title="Change Password" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" placeholder="New password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full bg-brand-input border border-brand-border text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-gold" />
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-brand-border text-gray-400 rounded-xl py-2 text-sm hover:text-white transition">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold rounded-xl py-2 text-sm disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TransferAgentModal({ agent, users, onClose, onDone }: { agent: AgentSummary & { ownerEmail: string }; users: UserRow[]; onClose: () => void; onDone: (agentId: string, toUserId: string) => void }) {
  const [toUserId, setToUserId] = useState(""); const [saving, setSaving] = useState(false); const [err, setErr] = useState("");
  const eligible = users.filter((u) => u.email !== agent.ownerEmail);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!toUserId) { setErr("Select a user"); return; } setErr(""); setSaving(true);
    const res = await fetch(`/api/admin/agents/${agent.id}/transfer`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUserId }) });
    const data = await res.json(); setSaving(false);
    if (!res.ok) { setErr(data.error ?? "Failed"); return; }
    onDone(agent.id, toUserId); onClose();
  }
  return (
    <Modal title={`Transfer "${agent.storeName}"`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-4">Conversations stay with the agent — only ownership changes.</p>
      <form onSubmit={submit} className="space-y-3">
        <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="w-full bg-brand-input border border-brand-border text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-gold">
          <option value="">— Select new owner —</option>
          {eligible.map((u) => <option key={u.id} value={u.id} className="bg-brand-card">{u.email}</option>)}
        </select>
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 border border-brand-border text-gray-400 rounded-xl py-2 text-sm hover:text-white transition">Cancel</button>
          <button type="submit" disabled={saving || !toUserId} className="flex-1 bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold rounded-xl py-2 text-sm disabled:opacity-50">{saving ? "Transferring..." : "Transfer"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PlanSelector({ userId, current, onChanged }: { userId: string; current: Plan; onChanged: (plan: Plan) => void }) {
  const [selected, setSelected] = useState<Plan>(current); const [saving, setSaving] = useState(false);
  async function save() {
    if (selected === current) return; setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}/plan`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planName: selected }) });
    setSaving(false); if (res.ok) onChanged(selected);
  }
  return (
    <div className="flex items-center gap-2">
      <select value={selected} onChange={(e) => setSelected(e.target.value as Plan)} className="bg-brand-input border border-brand-border text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-gold">
        {PLANS.map((p) => <option key={p} value={p} className="bg-brand-card">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
      </select>
      {selected !== current && <button onClick={save} disabled={saving} className="text-xs bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-semibold px-2.5 py-1.5 rounded-lg transition disabled:opacity-50">{saving ? "..." : "Save"}</button>}
    </div>
  );
}

// ─── STATS TAB ────────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats").then(r => r.json()).then(d => { setStats(d); setLoading(false); });
  }, []);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(12)].map((_, i) => <div key={i} className="bg-brand-card border border-brand-border rounded-xl p-4 h-20 animate-pulse" />)}</div>;
  if (!stats) return null;

  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: "👥" },
    { label: "Total Agents", value: stats.totalAgents, icon: "🤖" },
    { label: "GHL Deployed", value: stats.ghlDeployed, icon: "📡" },
    { label: "Total Revenue", value: `$${stats.totalRevenue.toFixed(2)}`, icon: "💰" },
    { label: "Total Conversations", value: stats.totalConversations, icon: "💬" },
    { label: "Total Messages", value: stats.totalMessages, icon: "✉️" },
    { label: "Active Today", value: stats.activeToday, icon: "🔥" },
    { label: "Checkout Clicks", value: stats.checkoutClicks, icon: "🛒" },
    { label: "Shopify Sales", value: stats.shopifyConverted, icon: "✅" },
    { label: "Link Conversions", value: stats.totalConversions, icon: "🔗" },
    { label: "Conversion Rate", value: `${stats.conversionRate}%`, icon: "📈" },
    { label: "Avg Msgs/Conv", value: stats.totalConversations > 0 ? (stats.totalMessages / stats.totalConversations).toFixed(1) : "0", icon: "📊" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-brand-card border border-brand-border rounded-xl p-4">
            <p className="text-xl mb-1">{c.icon}</p>
            <p className="text-2xl font-bold text-white">{c.value}</p>
            <p className="text-xs text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Conversion funnel */}
      <div className="bg-brand-card border border-brand-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">Conversion Funnel</h3>
        <div className="space-y-3">
          {[
            { label: "Conversations started", value: stats.totalConversations, color: "bg-blue-500" },
            { label: "Checkout links clicked", value: stats.checkoutClicks, color: "bg-yellow-500" },
            { label: "Shopify orders confirmed", value: stats.shopifyConverted, color: "bg-green-500" },
          ].map((row) => {
            const pct = stats.totalConversations > 0 ? (row.value / stats.totalConversations) * 100 : 0;
            return (
              <div key={row.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">{row.label}</span>
                  <span className="text-white font-medium">{row.value} <span className="text-gray-500">({pct.toFixed(1)}%)</span></span>
                </div>
                <div className="h-2 bg-brand-input rounded-full overflow-hidden">
                  <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── AGENTS TAB ───────────────────────────────────────────────────────────────

function AgentsTab({ users, setUsers, setToast }: { users: UserRow[]; setUsers: React.Dispatch<React.SetStateAction<UserRow[]>>; setToast: (m: string) => void }) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "ghl" | "error">("all");
  const [transferAgent, setTransferAgent] = useState<(AgentSummary & { ownerEmail: string }) | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/agents?search=${encodeURIComponent(q)}`);
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(""); }, [load]);

  const filtered = agents.filter((a) =>
    filter === "all" ? true : filter === "ready" ? a.status === "ready" : filter === "ghl" ? a.ghlDeployed : a.status === "error"
  );

  async function handleDelete(agentId: string) {
    if (!confirm("Delete this agent? All conversations will be lost.")) return;
    const res = await fetch(`/api/admin/agents/${agentId}`, { method: "DELETE" });
    if (!res.ok) { setToast("Failed to delete agent"); return; }
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    setToast("Agent deleted");
  }

  function handleTransferDone(agentId: string, toUserId: string) {
    const toUser = users.find((u) => u.id === toUserId);
    setAgents((prev) => prev.map((a) => a.id === agentId && toUser ? { ...a, user: { id: toUser.id, email: toUser.email, planName: toUser.planName } } : a));
    setToast("Agent transferred");
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="text" placeholder="Search by store or user email..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          className="bg-brand-input border border-brand-border text-white text-sm rounded-xl px-4 py-2 w-72 focus:outline-none focus:border-brand-gold placeholder:text-gray-600"
        />
        <button onClick={() => load(search)} className="text-sm bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold px-4 py-2 rounded-xl transition">Search</button>
        <div className="flex gap-1 ml-auto">
          {(["all", "ready", "ghl", "error"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`text-xs px-3 py-1.5 rounded-lg border transition ${filter === f ? "bg-brand-gold border-brand-gold text-[#18110C] font-bold" : "border-brand-border text-gray-400 hover:text-white"}`}>
              {f === "all" ? "All" : f === "ready" ? "Ready" : f === "ghl" ? "GHL Live" : "Error"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">{filtered.length} agents</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="bg-brand-card border border-brand-border rounded-xl h-16 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-16">No agents found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((agent) => {
            const isExpanded = expandedAgent === agent.id;
            return (
              <motion.div key={agent.id} layout className="bg-brand-card border border-brand-border rounded-xl overflow-hidden hover:border-brand-border-lt transition-colors">
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  {/* Store info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{agent.storeName}</p>
                      <StatusBadge status={agent.status} />
                      {agent.ghlDeployed && <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">GHL Live</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {agent.user?.email} · {agent.productCount} products · {agent._count.conversations} chats · {agent.conversions} sales
                      {agent.totalRevenue > 0 && ` · $${agent.totalRevenue.toFixed(2)}`}
                      {" · "}refreshed {timeAgo(agent.lastRefreshedAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button onClick={() => setExpandedAgent(isExpanded ? null : agent.id)} className="text-xs text-gray-400 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1.5 rounded-lg transition">
                      {isExpanded ? "Less" : "Details"}
                    </button>
                    <Link href={`/agents/${agent.id}/edit`} className="text-xs text-brand-gold hover:underline border border-brand-gold/30 hover:border-brand-gold px-2.5 py-1.5 rounded-lg transition" target="_blank">
                      Edit
                    </Link>
                    <Link href={`/agents/${agent.id}/conversations`} className="text-xs text-gray-400 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1.5 rounded-lg transition" target="_blank">
                      Chats ({agent._count.conversations})
                    </Link>
                    <button onClick={() => setTransferAgent({ ...agent, ownerEmail: agent.user?.email ?? "" })} className="text-xs text-gray-400 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1.5 rounded-lg transition">
                      Transfer
                    </button>
                    <button onClick={() => handleDelete(agent.id)} className="text-xs text-red-400 border border-red-700/40 hover:border-red-500 px-2.5 py-1.5 rounded-lg transition">
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="border-t border-brand-border bg-brand-bg/50 overflow-hidden">
                      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><p className="text-gray-500 mb-0.5">Store URL</p><a href={agent.storeUrl} target="_blank" className="text-brand-gold hover:underline truncate block">{agent.storeUrl}</a></div>
                        <div><p className="text-gray-500 mb-0.5">Tone</p><p className="text-white capitalize">{agent.tone}</p></div>
                        <div><p className="text-gray-500 mb-0.5">Created</p><p className="text-white">{fmtDate(agent.createdAt)}</p></div>
                        <div><p className="text-gray-500 mb-0.5">Last Updated</p><p className="text-white">{fmtDate(agent.updatedAt)}</p></div>
                        <div><p className="text-gray-500 mb-0.5">GHL Deployed At</p><p className="text-white">{fmtDate(agent.ghlDeployedAt)}</p></div>
                        <div><p className="text-gray-500 mb-0.5">Last Refreshed</p><p className="text-white">{fmtDate(agent.lastRefreshedAt)}</p></div>
                        <div><p className="text-gray-500 mb-0.5">Owner Plan</p><p className="text-white capitalize">{agent.user?.planName}</p></div>
                        <div><p className="text-gray-500 mb-0.5">Coupons</p><p className="text-white">{agent._count.coupons} total</p></div>
                      </div>
                      {agent.coupons.length > 0 && (
                        <div className="px-4 pb-4">
                          <p className="text-xs text-gray-500 mb-2">Coupons</p>
                          <div className="flex flex-wrap gap-2">
                            {agent.coupons.map((c) => (
                              <div key={c.id} className={`text-xs px-3 py-1.5 rounded-lg border ${c.active ? "border-brand-gold/30 bg-brand-gold/10 text-brand-gold" : "border-brand-border text-gray-500"}`}>
                                {c.code} — {c.discountValue}{c.discountType === "percentage" ? "%" : "$"} off · used {c.usedCount}×
                                {!c.active && " (inactive)"}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {transferAgent && (
          <TransferAgentModal agent={transferAgent} users={users} onClose={() => setTransferAgent(null)} onDone={handleTransferDone} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── USERS TAB ────────────────────────────────────────────────────────────────

function UsersTab({ users, setUsers, setToast }: { users: UserRow[]; setUsers: React.Dispatch<React.SetStateAction<UserRow[]>>; setToast: (m: string) => void }) {
  const [search, setSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordModal, setPasswordModal] = useState<string | null>(null);
  const [transferAgent, setTransferAgent] = useState<(AgentSummary & { ownerEmail: string }) | null>(null);

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()) || u.planName.includes(search.toLowerCase()));

  async function handleBlock(userId: string, blocked: boolean) {
    const res = await fetch(`/api/admin/users/${userId}/block`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked }) });
    if (!res.ok) { setToast("Failed"); return; }
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, blocked } : u));
    setToast(blocked ? "User blocked" : "User unblocked");
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Delete user ${email} and all their agents? Cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (!res.ok) { setToast("Failed to delete"); return; }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setToast("User deleted");
  }

  async function handleDeleteAgent(agentId: string, ownerUserId: string) {
    if (!confirm("Delete this agent? All conversations will be lost.")) return;
    const res = await fetch(`/api/admin/agents/${agentId}`, { method: "DELETE" });
    if (!res.ok) { setToast("Failed"); return; }
    setUsers((prev) => prev.map((u) => u.id === ownerUserId ? { ...u, agents: u.agents.filter((a) => a.id !== agentId) } : u));
    setToast("Agent deleted");
  }

  function handleTransferDone(agentId: string, toUserId: string) {
    setUsers((prev) => {
      let moved: AgentSummary | undefined;
      const next = prev.map((u) => { const a = u.agents.find((a) => a.id === agentId); if (a) { moved = a; return { ...u, agents: u.agents.filter((a) => a.id !== agentId) }; } return u; });
      if (!moved) return next;
      return next.map((u) => u.id === toUserId ? { ...u, agents: [...u.agents, moved!] } : u);
    });
    setToast("Agent transferred");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <input type="text" placeholder="Search by email or plan..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-brand-input border border-brand-border text-white text-sm rounded-xl px-4 py-2 w-64 focus:outline-none focus:border-brand-gold placeholder:text-gray-600" />
        <button onClick={() => setCreateOpen(true)} className="bg-brand-gold hover:bg-brand-gold-lt text-[#18110C] font-bold text-sm px-4 py-2 rounded-xl transition">+ New User</button>
      </div>

      {filtered.length === 0 ? <p className="text-gray-500 text-center py-16">No users found.</p> : (
        <div className="space-y-3">
          {filtered.map((user) => {
            const userRevenue = user.agents.reduce((s, a) => s + (a.totalRevenue ?? 0), 0);
            const userConversions = user.agents.reduce((s, a) => s + (a.conversions ?? 0), 0);
            const totalChats = user.agents.reduce((s, a) => s + (a._count?.conversations ?? 0), 0);
            const isExpanded = expandedUser === user.id;
            return (
              <motion.div key={user.id} layout className="bg-brand-card border border-brand-border rounded-xl overflow-hidden hover:border-brand-border-lt transition-colors">
                <div className="p-5 flex items-center gap-4 flex-wrap">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${user.blocked ? "bg-red-900/30 border border-red-700/40 text-red-400" : "bg-brand-gold/20 border border-brand-gold/30 text-brand-gold"}`}>
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{user.email}</p>
                      {user.blocked && <span className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 px-2 py-0.5 rounded-full">Blocked</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                      Joined {new Date(user.createdAt).toLocaleDateString()} · {user.agents.length} agent{user.agents.length !== 1 ? "s" : ""} · {totalChats} chats
                      {userConversions > 0 && ` · ${userConversions} sales`}
                      {userRevenue > 0 && ` · $${userRevenue.toFixed(2)}`}
                    </p>
                  </div>
                  <PlanBadge plan={user.planName} />
                  <PlanSelector userId={user.id} current={user.planName} onChanged={(plan) => { setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, planName: plan } : u)); setToast("Plan updated"); }} />
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {user.agents.length > 0 && <button onClick={() => setExpandedUser(isExpanded ? null : user.id)} className="text-xs text-gray-500 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1.5 rounded-lg transition">{isExpanded ? "Hide" : `Agents (${user.agents.length})`}</button>}
                    <button onClick={() => setPasswordModal(user.id)} className="text-xs text-gray-400 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1.5 rounded-lg transition">Password</button>
                    <button onClick={() => handleBlock(user.id, !user.blocked)} className={`text-xs border px-2.5 py-1.5 rounded-lg transition ${user.blocked ? "text-emerald-400 border-emerald-700/40 hover:border-emerald-500" : "text-yellow-400 border-yellow-700/40 hover:border-yellow-500"}`}>{user.blocked ? "Unblock" : "Block"}</button>
                    <button onClick={() => handleDeleteUser(user.id, user.email)} className="text-xs text-red-400 border border-red-700/40 hover:border-red-500 px-2.5 py-1.5 rounded-lg transition">Delete</button>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && user.agents.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="border-t border-brand-border bg-brand-bg/50 overflow-hidden">
                      <div className="p-4 space-y-2">
                        {user.agents.map((agent) => (
                          <div key={agent.id} className="flex items-center gap-3 bg-brand-card border border-brand-border rounded-lg px-4 py-2.5 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{agent.storeName}</p>
                              <p className="text-xs text-gray-500">{agent._count.conversations} chats · {agent.conversions} sales{agent.totalRevenue > 0 && ` · $${agent.totalRevenue.toFixed(2)}`} · refreshed {timeAgo(agent.lastRefreshedAt)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {agent.ghlDeployed && <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">GHL Live</span>}
                              <StatusBadge status={agent.status} />
                              <Link href={`/agents/${agent.id}/edit`} className="text-xs text-brand-gold hover:underline border border-brand-gold/30 px-2.5 py-1 rounded-lg" target="_blank">Edit</Link>
                              <Link href={`/agents/${agent.id}/conversations`} className="text-xs text-gray-400 hover:text-white border border-brand-border px-2.5 py-1 rounded-lg" target="_blank">Chats</Link>
                              <button onClick={() => setTransferAgent({ ...agent, ownerEmail: user.email })} className="text-xs text-gray-400 hover:text-white border border-brand-border hover:border-brand-border-lt px-2.5 py-1 rounded-lg transition">Transfer</button>
                              <button onClick={() => handleDeleteAgent(agent.id, user.id)} className="text-xs text-red-400 border border-red-700/40 hover:border-red-500 px-2.5 py-1 rounded-lg transition">Delete</button>
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

      <AnimatePresence>
        {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={(u) => { setUsers((prev) => [u as UserRow, ...prev]); setToast("User created"); }} />}
        {passwordModal && <ChangePasswordModal userId={passwordModal} onClose={() => setPasswordModal(null)} onDone={() => setToast("Password changed")} />}
        {transferAgent && <TransferAgentModal agent={transferAgent} users={users} onClose={() => setTransferAgent(null)} onDone={handleTransferDone} />}
      </AnimatePresence>
    </div>
  );
}

// ─── SALES TAB ────────────────────────────────────────────────────────────────

type SalesFilter = "all" | "converted" | "checkout";

function SalesTab({ setToast }: { setToast: (m: string) => void }) {
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SalesFilter>("all");

  const load = useCallback(async (f: SalesFilter) => {
    setLoading(true);
    const res = await fetch(`/api/admin/sales?filter=${f}`);
    const data = await res.json();
    setRows(data.conversations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  function exportCsv() {
    const headers = ["Customer", "Product", "Agent", "User", "Status", "Revenue", "Date"];
    const csvRows = rows.map((r) => [
      r.visitorName,
      r.productName ?? "",
      r.agent.storeName,
      r.agent.user.email,
      r.convertedAt ? "Shopify Sale" : r.checkoutClickedAt ? "Checkout Clicked" : "No conversion",
      r.shopifyOrderTotal ? `${r.agent.currency}${r.shopifyOrderTotal}` : "",
      fmtDate(r.convertedAt ?? r.checkoutClickedAt ?? r.createdAt),
    ].map((v) => `"${v}"`).join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `sales-${filter}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    setToast("CSV exported");
  }

  const totalRevenue = rows.reduce((s, r) => s + (r.shopifyOrderTotal ? parseFloat(r.shopifyOrderTotal) : 0), 0);
  const converted = rows.filter((r) => r.convertedAt).length;
  const clicked = rows.filter((r) => r.checkoutClickedAt).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(["all", "converted", "checkout"] as SalesFilter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-sm px-4 py-2 rounded-xl border transition font-medium ${filter === f ? "bg-brand-gold border-brand-gold text-[#18110C]" : "border-brand-border text-gray-400 hover:text-white hover:border-brand-border-lt"}`}>
            {f === "all" ? "All Chats" : f === "converted" ? "Shopify Sales" : "Checkout Clicked"}
          </button>
        ))}
        <button onClick={exportCsv} disabled={rows.length === 0} className="ml-auto text-sm border border-brand-border text-gray-400 hover:text-white hover:border-brand-border-lt px-4 py-2 rounded-xl transition disabled:opacity-40">
          Export CSV
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Total Records", value: rows.length },
          { label: "Checkout Clicks", value: clicked },
          { label: "Revenue", value: `$${totalRevenue.toFixed(2)}` },
        ].map((s) => (
          <div key={s.label} className="bg-brand-card border border-brand-border rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="bg-brand-card border border-brand-border rounded-xl h-16 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-center py-16">No records found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-brand-border">
                {["Customer", "Product", "Agent / User", "Status", "Revenue", "Date", "Chat"].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-brand-card/50 transition">
                  <td className="py-3 pr-4 font-medium">{row.visitorName}</td>
                  <td className="py-3 pr-4 text-gray-400 max-w-[160px] truncate">{row.productName ?? "—"}</td>
                  <td className="py-3 pr-4">
                    <p className="text-xs font-medium truncate max-w-[140px]">{row.agent.storeName}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[140px]">{row.agent.user.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    {row.convertedAt ? <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Shopify Sale</span>
                      : row.checkoutClickedAt ? <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">Checkout Clicked</span>
                      : <span className="text-xs text-gray-600">No conversion</span>}
                  </td>
                  <td className="py-3 pr-4 text-brand-gold font-semibold">{row.shopifyOrderTotal ? `${row.agent.currency}${row.shopifyOrderTotal}` : "—"}</td>
                  <td className="py-3 pr-4 text-xs text-gray-500 whitespace-nowrap">{fmtDate(row.convertedAt ?? row.checkoutClickedAt ?? row.createdAt)}</td>
                  <td className="py-3">
                    <Link href={`/agents/${row.agent.id}/conversations`} className="text-xs text-brand-gold hover:underline" target="_blank">View ({row._count.messages})</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

type Tab = "stats" | "users" | "agents" | "sales";

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<Tab>("stats");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleTap() {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setTerminalOpen((o) => !o);
      return;
    }
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
  }

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const totalRevenue = users.reduce((sum, u) => sum + u.agents.reduce((s, a) => s + (a.totalRevenue ?? 0), 0), 0);
  const totalAgents = users.reduce((sum, u) => sum + u.agents.length, 0);
  const totalConversions = users.reduce((sum, u) => sum + u.agents.reduce((s, a) => s + (a.conversions ?? 0), 0), 0);

  const TABS: { id: Tab; label: string }[] = [
    { id: "stats", label: "Platform Stats" },
    { id: "users", label: "Users & Agents" },
    { id: "agents", label: "All Agents" },
    { id: "sales", label: "Sales Dashboard" },
  ];

  return (
    <div className="min-h-screen bg-brand-bg text-white">
      <header className="border-b border-brand-border bg-brand-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold cursor-default select-none" onClick={handleTitleTap}>SMS2<span className="text-brand-gold">Cart</span></h1>
            <span className="text-xs bg-brand-gold/20 text-brand-gold border border-brand-gold/30 px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
          </div>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-brand-input">← Dashboard</Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Quick stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Users", value: users.length },
            { label: "Total Agents", value: totalAgents },
            { label: "Total Sales", value: totalConversions },
            { label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}` },
          ].map((stat) => (
            <div key={stat.label} className="bg-brand-card border border-brand-border rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-brand-border overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-sm font-medium px-5 py-2.5 border-b-2 transition -mb-px whitespace-nowrap ${tab === t.id ? "border-brand-gold text-brand-gold" : "border-transparent text-gray-500 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && tab !== "stats" ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-brand-card border border-brand-border rounded-xl p-5 h-20 animate-pulse" />)}</div>
        ) : (
          <>
            {tab === "stats" && <StatsTab />}
            {tab === "users" && <UsersTab users={users} setUsers={setUsers} setToast={setToast} />}
            {tab === "agents" && <AgentsTab users={users} setUsers={setUsers} setToast={setToast} />}
            {tab === "sales" && <SalesTab setToast={setToast} />}
          </>
        )}
      </main>

      <AnimatePresence>
        {toast && <Toast message={toast} onDone={() => setToast("")} />}
      </AnimatePresence>

      <AnimatePresence>
        {terminalOpen && <TerminalPanel onClose={() => setTerminalOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
