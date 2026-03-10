"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  storeName: string;
  storeUrl: string;
  storeLogo: string | null;
  botName: string;
  openingMessageTemplate: string;
  currency: string;
  productCount: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  responseTime?: number; // seconds bot took to respond — only on assistant messages
}

// ─── FOLLOW-UP TIMING ─────────────────────────────────────────────────────────
// Delays after last bot message before sending an unprompted follow-up
const FOLLOWUP_DELAYS = [
  15 * 60 * 1000,        // #1 — 15 minutes
  2 * 60 * 60 * 1000,   // #2 — 2 hours
  24 * 60 * 60 * 1000,  // #3 — 24 hours
];

// ─── CONVERSATION END DETECTION ───────────────────────────────────────────────
// If the user says any of these, the conversation is over — no more follow-ups.
const CONV_DONE_RE =
  /\b(thanks|thank you|thank u|thx|ty|great thanks|perfect thanks|sounds good|got it|all good|awesome thanks|cool thanks|nice thanks|appreciate it|appreciate that|cheers|that.?s all|that is all|that.?s helpful|that helps|makes sense|no thanks|not interested|maybe later|all set|i.?m good|im good|we.?re good|done|bye|goodbye|talk later|ttyl|ok great|okay great|no worries|you.?re welcome|np|no problem|got what i need|that.?s perfect|perfect)\b/i;

function isConversationEnding(text: string): boolean {
  return CONV_DONE_RE.test(text.toLowerCase());
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StoreFavicon({ url, name }: { url: string; name: string }) {
  const [imgError, setImgError] = useState(false);
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];

  if (!imgError) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={name}
        className="w-full h-full object-contain rounded-full"
        onError={() => setImgError(true)}
      />
    );
  }
  return <span className="text-white font-bold text-lg">{name.charAt(0).toUpperCase()}</span>;
}

// ─── TYPING INDICATOR ────────────────────────────────────────────────────────

function TypingIndicator({ avatarInitial }: { avatarInitial: string }) {
  return (
    <div className="flex items-end gap-2 mb-2">
      <div className="w-7 h-7 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center overflow-hidden mb-4">
        <span className="text-gray-600 text-xs font-bold">{avatarInitial}</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-gray-400 rounded-full"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LINK RENDERER ───────────────────────────────────────────────────────────
// Turns plain-text URLs inside a message into tappable anchor tags.

function renderWithLinks(text: string, isUser: boolean) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const url = match[0].replace(/[.,!?]+$/, ""); // strip trailing punctuation
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline underline-offset-2 break-all ${
          isUser ? "text-blue-100 hover:text-white" : "text-indigo-600 hover:text-indigo-800"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── MESSAGE BUBBLE ──────────────────────────────────────────────────────────

function MessageBubble({ message, avatarInitial }: { message: Message; avatarInitial: string }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`flex items-end gap-2 mb-1 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center overflow-hidden mb-4">
          <span className="text-gray-600 text-xs font-bold">{avatarInitial}</span>
        </div>
      )}
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed break-words ${
            isUser
              ? "bg-[#007AFF] text-white rounded-br-sm"
              : "bg-gray-100 text-gray-900 rounded-bl-sm"
          }`}
        >
          {renderWithLinks(message.content, isUser)}
        </div>
        <span className="text-[10px] text-gray-400 mt-1 px-1 flex items-center gap-1.5">
          {formatTime(message.timestamp)}
          {!isUser && message.responseTime !== undefined && (
            <span className="text-gray-400">· ⏱ {message.responseTime}s</span>
          )}
        </span>
      </div>
    </motion.div>
  );
}

// ─── PHONE FRAME (desktop only) ───────────────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden md:flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div
        className="relative bg-white shadow-2xl"
        style={{ width: 390, height: 844, borderRadius: 50, border: "8px solid #1a1a1a", overflow: "hidden" }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-[#1a1a1a] rounded-b-3xl z-20 flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-gray-700 rounded-full" />
          <div className="w-12 h-3 bg-gray-800 rounded-full" />
        </div>
        {/* Status bar */}
        <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-8 pt-1 z-10">
          <span className="text-xs font-semibold text-gray-900">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5 items-end h-3">
              {[3, 5, 7, 9].map((h) => (
                <div key={h} className="w-1 bg-gray-900 rounded-sm" style={{ height: h }} />
              ))}
            </div>
            <span className="text-xs font-semibold ml-1">100%</span>
          </div>
        </div>
        <div className="absolute inset-0 pt-12 flex flex-col">{children}</div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-900 rounded-full z-20" />
      </div>
    </div>
  );
}

// ─── LANDING SCREEN ──────────────────────────────────────────────────────────

function LandingScreen({ agent, onStart }: { agent: AgentInfo; onStart: (name: string) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    onStart(name.trim());
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-indigo-100 border-4 border-indigo-200 flex items-center justify-center mb-4 overflow-hidden"
      >
        <StoreFavicon url={agent.storeUrl} name={agent.storeName} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{agent.storeName}</h1>
        <p className="text-indigo-600 font-semibold text-sm mb-4">AI Cart Recovery Demo</p>
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 mb-6 text-sm text-indigo-700 font-medium">
          70% of carts are abandoned — AI recovers them
        </div>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Experience how AI sends personalised SMS messages to bring customers back to their carts.
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        onSubmit={handleStart}
        className="w-full max-w-xs space-y-3"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your first name"
          className="w-full border-2 border-gray-200 rounded-2xl px-5 py-3.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-400 transition text-center text-lg"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl transition-colors text-lg"
        >
          {loading ? "Starting..." : "Start Demo →"}
        </button>
      </motion.form>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-xs text-gray-400 mt-8"
      >
        Powered by CartCloser AI
      </motion.p>
    </div>
  );
}

// ─── CHAT SCREEN ─────────────────────────────────────────────────────────────

function ChatScreen({
  agent,
  messages,
  onSend,
  isTyping,
  streamingContent,
  responseTimer,
}: {
  agent: AgentInfo;
  messages: Message[];
  onSend: (text: string) => void;
  isTyping: boolean;
  streamingContent: string;
  responseTimer: number;
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = isTyping || !!streamingContent;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, streamingContent]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  }

  const avatarInitial = agent.botName.charAt(0).toUpperCase();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden flex-shrink-0">
          <StoreFavicon url={agent.storeUrl} name={agent.storeName} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{agent.storeName}</p>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${busy ? "bg-yellow-400" : "bg-green-500"}`} />
            <span className="text-xs text-gray-500">{busy ? "Typing..." : "Online"}</span>
          </div>
        </div>
      </div>

      {/* Messages — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-white min-h-0">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} avatarInitial={avatarInitial} />
        ))}

        {/* Streaming bubble */}
        {streamingContent && (
          <motion.div
            className="flex items-end gap-2 mb-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-7 h-7 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center mb-4">
              <span className="text-gray-600 text-xs font-bold">{avatarInitial}</span>
            </div>
            <div className="max-w-[78%]">
              <div className="bg-gray-100 text-gray-900 px-4 py-2.5 rounded-2xl rounded-bl-sm text-[14px] leading-relaxed break-words">
                {renderWithLinks(streamingContent, false)}
                <span className="inline-block w-0.5 h-4 bg-gray-500 ml-0.5 animate-pulse align-middle" />
              </div>
            </div>
          </motion.div>
        )}

        {isTyping && !streamingContent && (
          <>
            <TypingIndicator avatarInitial={avatarInitial} />
            {responseTimer > 0 && (
              <p className="text-[10px] text-gray-400 text-center mb-1">
                ⏱ {responseTimer}s
              </p>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input — pinned to bottom, above keyboard on iOS */}
      <div
        className="flex-shrink-0 bg-white border-t border-gray-100 px-3 py-2"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              input.trim() ? "bg-[#007AFF] text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
        <p className="text-center text-[10px] text-gray-300 mt-1">Powered by CartCloser AI</p>
      </div>
    </div>
  );
}

// ─── SSE STREAM READER ────────────────────────────────────────────────────────

async function readSseStream(
  response: Response,
  onDelta: (partial: string) => void,
  onDone: (full: string) => void
) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.delta) {
          full += parsed.delta;
          onDelta(full);
        }
        if (parsed.done) {
          onDone(full);
        }
      } catch {}
    }
  }
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [featuredProduct, setFeaturedProduct] = useState("");
  const [loadError, setLoadError] = useState("");
  const [started, setStarted] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [responseTimer, setResponseTimer] = useState(0); // seconds since message sent
  const responseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Follow-up state
  const followupCountRef = useRef(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBusyRef = useRef(false);
  const conversationIdRef = useRef("");
  const conversationDoneRef = useRef(false); // set true when user signals they're done
  const messageQueueRef = useRef<string[]>([]); // FIFO queue of messages to process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processMessageRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Load agent
  useEffect(() => {
    fetch(`/api/demo/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setLoadError(d.error); return; }
        setAgent(d.agent);
        setFeaturedProduct(d.featuredProduct ?? "");
      })
      .catch(() => setLoadError("Failed to load demo"));
  }, [id]);

  // ── Schedule follow-up timer ───────────────────────────────────────────────
  const scheduleFollowup = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (followupCountRef.current >= FOLLOWUP_DELAYS.length) return;
    if (conversationDoneRef.current) return; // conversation is over — no more nudges

    const delay = FOLLOWUP_DELAYS[followupCountRef.current];
    inactivityTimerRef.current = setTimeout(async () => {
      if (isBusyRef.current) return;
      followupCountRef.current += 1;

      const convId = conversationIdRef.current;
      if (!convId) return;

      isBusyRef.current = true;
      setIsTyping(true);
      setStreamingContent("");

      try {
        const res = await fetch(`/api/demo/${id}/followup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convId, followupNumber: followupCountRef.current }),
        });
        if (!res.ok) { setIsTyping(false); isBusyRef.current = false; return; }

        await readSseStream(
          res,
          (partial) => {
            setIsTyping(false);
            setStreamingContent(partial);
          },
          (full) => {
            setStreamingContent("");
            // Skip empty follow-ups (server returned done with no content)
            if (full.trim()) {
              setMessages((prev) => [
                ...prev,
                { id: `fu-${Date.now()}`, role: "assistant", content: full, timestamp: new Date() },
              ]);
            }
            isBusyRef.current = false;
            // Only chain next follow-up if conversation is still active
            if (!conversationDoneRef.current) {
              scheduleFollowup();
            }
          }
        );
      } catch {
        setIsTyping(false);
        setStreamingContent("");
        isBusyRef.current = false;
      }
    }, delay);
  }, [id]);

  useEffect(() => {
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); };
  }, []);

  // ── Start conversation ─────────────────────────────────────────────────────
  async function handleStart(visitorName: string) {
    const res = await fetch(`/api/demo/${id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorName }),
    });
    const data = await res.json();
    if (!res.ok) return;

    setConversationId(data.conversationId);
    setStarted(true);

    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsTyping(false);
    setMessages([
      {
        id: "opening",
        role: "assistant",
        content: data.openingMessage,
        timestamp: new Date(),
      },
    ]);

    scheduleFollowup();
  }

  // ── Process a single message via the chat API ──────────────────────────────
  const processMessage = useCallback(
    async (text: string) => {
      setStreamingContent("");
      isBusyRef.current = true;

      // Start response timer from the moment the user sends
      const startTime = Date.now();
      setResponseTimer(0);
      if (responseTimerRef.current) clearInterval(responseTimerRef.current);
      responseTimerRef.current = setInterval(() => {
        setResponseTimer(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      // Fire the request immediately (server has 7-15s delay anyway)
      // but wait 1-4s before showing "Typing..." — simulates reading before replying.
      const fetchPromise = fetch(`/api/demo/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationIdRef.current, message: text }),
      });
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 3000));
      setIsTyping(true);

      // Stop the timer and return final elapsed seconds
      const stopTimer = (): number => {
        if (responseTimerRef.current) clearInterval(responseTimerRef.current);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setResponseTimer(0); // clear the live counter — time now lives on the message bubble
        return elapsed;
      };

      // After a response completes, drain the queue or schedule a follow-up
      const finish = () => {
        isBusyRef.current = false;
        const next = messageQueueRef.current.shift();
        if (next) {
          processMessageRef.current(next);
        } else if (!conversationDoneRef.current) {
          scheduleFollowup();
        }
      };

      try {
        const res = await fetchPromise;

        if (!res.ok) {
          const err = await res.json();
          setIsTyping(false);
          stopTimer();
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              content: err.error ?? "Something went wrong.",
              timestamp: new Date(),
            },
          ]);
          finish();
          return;
        }

        await readSseStream(
          res,
          (partial) => {
            setIsTyping(false);
            setStreamingContent(partial);
          },
          (full) => {
            const elapsed = stopTimer();
            setStreamingContent("");
            setMessages((prev) => [
              ...prev,
              { id: `a-${Date.now()}`, role: "assistant", content: full, timestamp: new Date(), responseTime: elapsed },
            ]);
            finish();
          }
        );
      } catch {
        setIsTyping(false);
        setStreamingContent("");
        stopTimer();
        finish();
      }
    },
    [id, scheduleFollowup]
  );

  // Keep ref in sync so queued messages can always call the latest version
  useEffect(() => { processMessageRef.current = processMessage; }, [processMessage]);

  // ── Send user message ──────────────────────────────────────────────────────
  const handleSend = useCallback(
    (text: string) => {
      // Cancel any pending follow-up — user is active
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

      // If they're saying they're done (thanks/bye/got it etc.), mark conversation over
      if (isConversationEnding(text)) {
        conversationDoneRef.current = true;
      }

      // Always add user message to chat immediately — even if bot is mid-response
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: text, timestamp: new Date() },
      ]);

      if (isBusyRef.current) {
        // Bot is busy — queue this for after current response, message already visible
        messageQueueRef.current.push(text);
        return;
      }

      processMessageRef.current(text);
    },
    []
  );

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-5xl mb-4">😕</p>
          <p className="text-gray-600 text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const chatContent = (
    <AnimatePresence mode="wait">
      {!started ? (
        <motion.div
          key="landing"
          className="flex-1 flex flex-col min-h-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
        >
          <LandingScreen agent={agent} onStart={handleStart} />
        </motion.div>
      ) : (
        <motion.div
          key="chat"
          className="flex-1 flex flex-col min-h-0"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ChatScreen
            agent={agent}
            messages={messages}
            onSend={handleSend}
            isTyping={isTyping}
            streamingContent={streamingContent}
            responseTimer={responseTimer}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* Mobile — full dynamic viewport height, no overflow */}
      <div
        className="md:hidden flex flex-col bg-white"
        style={{ height: "100dvh" }}
      >
        {chatContent}
      </div>

      {/* Desktop — phone frame mockup */}
      <PhoneFrame>
        <div className="flex flex-col h-full">{chatContent}</div>
      </PhoneFrame>
    </>
  );
}
