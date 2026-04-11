"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  visitorName: string;
  productName: string | null;
  ghlContactId: string | null;
  createdAt: string;
  messages: Message[];
  _count: { messages: number };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Password gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/chats-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.ok) {
      sessionStorage.setItem("chats_unlocked", "1");
      onUnlocked();
    } else {
      setError("Incorrect password");
      setPassword("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-700 flex items-center justify-center text-3xl mx-auto mb-4">
            🔒
          </div>
          <h2 className="text-xl font-bold text-white">Restricted Access</h2>
          <p className="text-gray-500 text-sm mt-1">Enter the password to view conversations</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Password"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? "Checking..." : "Unlock"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ConversationsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const agentId = params.id;

  const [unlocked, setUnlocked] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [agentName, setAgentName] = useState("");

  // Check sessionStorage on mount
  useEffect(() => {
    if (sessionStorage.getItem("chats_unlocked") === "1") {
      setUnlocked(true);
    }
    setCheckingSession(false);
  }, []);

  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/conversations`);
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setConversations(data.conversations ?? []);
    setLoadingList(false);
  }, [agentId, router]);

  useEffect(() => {
    if (!unlocked) return;
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((d) => setAgentName(d.agent?.storeName ?? "Agent"))
      .catch(() => {});
    fetchList();
  }, [agentId, fetchList, unlocked]);

  async function openThread(conv: Conversation) {
    setLoadingThread(true);
    setSelected(null);
    const res = await fetch(`/api/agents/${agentId}/conversations/${conv.id}`);
    const data = await res.json();
    setSelected(data.conversation ?? conv);
    setLoadingThread(false);
  }

  const lastMessage = (conv: Conversation) => conv.messages?.[0];

  // While checking sessionStorage, render nothing to avoid flash
  if (checkingSession) return null;

  // Show password gate if not unlocked
  if (!unlocked) {
    return <PasswordGate onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">
            ← Dashboard
          </Link>
          <span className="text-gray-600">/</span>
          <Link
            href={`/agents/${agentId}/edit`}
            className="text-gray-400 hover:text-white transition text-sm"
          >
            {agentName || "Agent"}
          </Link>
          <span className="text-gray-600">/</span>
          <h1 className="text-sm font-semibold">Conversations</h1>
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-6 py-6 gap-5">
        {/* ── Conversation list ─────────────────────────────────────────── */}
        <div className="w-80 shrink-0 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>

          {loadingList ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-20" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-sm">No conversations yet.</p>
              <p className="text-xs mt-1 text-gray-600">
                They appear here when customers chat with the demo.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-140px)] pr-1">
              {conversations.map((conv) => {
                const last = lastMessage(conv);
                const isActive = selected?.id === conv.id;
                return (
                  <motion.button
                    key={conv.id}
                    onClick={() => openThread(conv)}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full text-left bg-gray-900 border rounded-xl p-4 transition-all ${
                      isActive
                        ? "border-indigo-500/50 bg-indigo-600/5"
                        : "border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold truncate max-w-[140px]">
                        {conv.visitorName}
                      </p>
                      <span className="text-xs text-gray-500 shrink-0">
                        {timeAgo(conv.createdAt)}
                      </span>
                    </div>
                    {conv.productName && (
                      <p className="text-xs text-indigo-400 mb-1 truncate">
                        re: {conv.productName}
                      </p>
                    )}
                    {last && (
                      <p className="text-xs text-gray-500 truncate">
                        {last.role === "assistant" ? "Bot: " : ""}
                        {last.content}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-600">
                        {conv._count.messages} message{conv._count.messages !== 1 ? "s" : ""}
                      </span>
                      {conv.ghlContactId && (
                        <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          SMS
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Thread view ───────────────────────────────────────────────── */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl flex flex-col overflow-hidden">
          {loadingThread ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-gray-500 text-sm animate-pulse">Loading...</div>
            </div>
          ) : !selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
              <p className="text-4xl mb-3">👈</p>
              <p className="text-sm">Select a conversation to view the thread</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selected.visitorName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(selected.createdAt).toLocaleString()}
                    {selected.productName ? ` · re: ${selected.productName}` : ""}
                    {selected.ghlContactId ? " · SMS via GHL" : " · Web demo"}
                  </p>
                </div>
                <span className="text-xs text-gray-600">
                  {selected.messages.length} messages
                </span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <AnimatePresence initial={false}>
                  {selected.messages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-br-md"
                            : "bg-gray-800 text-gray-200 rounded-bl-md"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.role === "user" ? "text-indigo-300" : "text-gray-500"
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
