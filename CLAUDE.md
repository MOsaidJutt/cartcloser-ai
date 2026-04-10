# CLAUDE.md — SMS2Cart (CartCloser AI)

> Full context: `C:\Users\Hamza Khan\Desktop\Upwork\01 - Nicholas Gaulton\PROJECT_MEMORY.md`
> Read that file first if starting a new session — it has everything.

---

## What This Project Is

**SMS2Cart** recovers abandoned Shopify carts via AI-powered SMS conversations.
GHL (GoHighLevel) handles SMS delivery. SMS2Cart provides the AI brain.

**Flow:** Shopify abandoned cart → GHL workflow sends opening SMS → customer replies → GHL routes reply to our webhook → AI generates response using store knowledge base → we POST reply back to GHL → GHL sends it as SMS.

---

## Commands

```bash
npm run dev        # Start dev server at http://localhost:3000
npm run build      # Production build
npm run start      # Start production server
npx prisma generate    # Regenerate Prisma types after schema changes
npx prisma db push     # Apply schema changes to DB (no migration files)
```

---

## Required Environment Variables (`.env.local`)

```bash
DATABASE_URL=postgresql://...neon.tech/...   # Neon PostgreSQL
NEXTAUTH_SECRET=<32+ char string>            # JWT signing key
OPENAI_API_KEY=sk-...                        # Fallback (users can supply their own)
NEXT_PUBLIC_APP_URL=https://sms2cart.com     # Used to generate GHL webhook URLs
CRON_SECRET=<random string>                  # Protects /api/cron/refresh
```

---

## Stack

- **Next.js 16** App Router + TypeScript 5
- **Prisma 7** + **Neon PostgreSQL** (serverless) — `lib/prisma.ts`
- **OpenAI GPT-4o-mini** — chat + KB analysis
- **JWT** auth (bcryptjs passwords, cookie-based sessions, 7-day expiry)
- **TailwindCSS 4** + framer-motion
- No Stripe, no S3, no Redis, no NextAuth

---

## Project Structure (key files only)

```
app/api/
  agents/              ← CRUD + SSE build stream (POST creates agent)
  agents/[id]/
    route.ts           ← GET/PUT/DELETE
    knowledge-base/    ← GET sections, PATCH (update-section/fetch-page/append-section)
    deploy-ghl/        ← POST — generate webhook secret, mark deployed
    undeploy-ghl/      ← DELETE
    ghl-status/        ← GET
    export-snapshot/   ← POST — download GHL workflow JSON
    scrape/            ← POST — re-scrape store + rebuild KB
    coupons/           ← GET/POST/PATCH
    conversations/     ← GET list + [convId] thread
  auth/                ← register, login, session
  settings/ghl/        ← GET/PUT/DELETE GHL credentials (+ exports deobfuscate/getGhlToken)
  settings/openai/     ← PUT save OpenAI key
  webhook/ghl/[agentId]/ ← POST inbound SMS from GHL (HMAC verified)
  cron/refresh/        ← GET daily KB auto-refresh (Authorization: Bearer)
  demo/[id]/           ← Public: chat with streaming + typing delays

lib/
  auth.ts              ← hashPassword, verifyPassword, signToken, verifyToken, getSessionUser
  system-prompt.ts     ← buildSystemPrompt(), AgentConfig interface
  knowledge-base.ts    ← buildKnowledgeBase() — programmatic catalog + AI analysis
  scraper.ts           ← scrapeShopifyStore() — products.json + policies
  crawler.ts           ← crawlShopifyStore() — sitemap + page crawl
  config-guard.ts      ← checkRestrictedTopic() — pre-AI topic block
  prisma.ts            ← PrismaClient singleton (Neon adapter)

proxy.ts               ← Edge middleware (route protection, named proxy.ts not middleware.ts)
vercel.json            ← Cron: /api/cron/refresh at 03:00 UTC daily
prisma/schema.prisma   ← User, Agent, Coupon, Conversation, Message
```

---

## Database Models (summary)

| Model | Key fields |
|---|---|
| `User` | id, email, password, openaiKey, ghlApiToken (obfuscated), ghlLocationId |
| `Agent` | id, userId, storeName, storeUrl, botName, openingMessage, tone, systemPrompt, knowledgeBase, config (JSON), refreshInterval, refreshUnit, nextRefreshAt, ghlDeployed, ghlWebhookSecret, status |
| `Coupon` | id, agentId, code, discountType, discountValue, active |
| `Conversation` | id, agentId, visitorName, productName, ghlContactId |
| `Message` | id, conversationId, role, content |

---

## Critical Gotchas

### `(agent as any).ghlDeployed` pattern everywhere
New schema fields were added without regenerating Prisma types. The DB columns exist, types don't. Run `npx prisma generate` to fix. Don't remove the `as any` casts until types are regenerated.

### GHL token is XOR-obfuscated, not AES-encrypted
`obfuscate()`/`deobfuscate()` use XOR with `NEXTAUTH_SECRET`. Exported from `/app/api/settings/ghl/route.ts`. Import via dynamic import in webhook handler to avoid circular deps. Prefer using `getGhlToken(userId)` helper from same file.

### System prompt is rebuilt on every agent save
`buildSystemPrompt()` is called in every PUT, scrape, KB update, and coupon action. `Agent.systemPrompt` is always the current built version. Webhook uses `agent.systemPrompt` directly.

### KB fetch-page flow (3-step)
1. `PATCH { type: "fetch-page", url }` → returns `{ title, preview }` (not "content")
2. Client shows preview
3. `PATCH { type: "append-section", sectionHeading: title, content: preview }` → saves

### Cron auth (two methods)
- Vercel: sends `Authorization: Bearer ${CRON_SECRET}` header automatically
- Hostinger: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/refresh`
- Query param `?secret=` also accepted as fallback

### Deploy to GHL = webhook URL only
The deploy button does NOT create a bot in GHL via API (GHL has no public API for that). It generates a webhook URL + HMAC secret the user pastes into a GHL Workflow manually. The `export-snapshot` endpoint generates a JSON the user imports into GHL → Settings → Snapshots.

### `proxy.ts` is the middleware
Next.js middleware is in `proxy.ts` (not `middleware.ts`). It exports `config.matcher` so Next.js picks it up. Protects `/dashboard`, `/settings`, `/agents`.

---

## AgentConfig (per-agent JSON stored in `Agent.config`)

```typescript
interface AgentConfig {
  restrictedTopics?: string[];   // topics bot must refuse (guard runs before AI)
  fallbackMessage?: string;      // reply on restricted topic
  primaryProducts?: string[];    // product names to lead with
  disclosureText?: string;       // appended to opening message
  maxMessages?: number;          // default 50
  responseDelayMin?: number;     // seconds (demo chat)
  responseDelayMax?: number;     // seconds (demo chat)
  disableCheckoutLinks?: boolean; // info-only mode
  customInstructions?: string;   // injected into system prompt verbatim
}
```

---

## Phase 2 Status

### Done
- GHL credentials UI + XOR token storage
- Inbound GHL webhook + HMAC signature verification
- GHL reply sender (POST to GHL Conversations API)
- Per-agent config JSON + full CustomisationPanel UI
- Primary products, restricted topics, fallback message UI
- KB auto-refresh scheduler (DB fields + cron + UI)
- GHL deploy/undeploy buttons + "GHL Live" status badge
- GHL Snapshot export (downloads importable workflow JSON)
- Conversations page (list + thread, shows "SMS" badge for GHL)

### Waiting on Nicholas
- GHL API Token + Location ID (for Ozlo Sleep test client)
- Hostinger VPS KVM 2 (Ubuntu 22.04) + SSH access
- Domain `sms2cart.com` DNS control
- Shopify test store URL for live E2E testing

### Hostinger (when VPS is ready)
```bash
# Replace Vercel cron with Linux cron:
echo "0 3 * * * curl -H 'Authorization: Bearer $CRON_SECRET' https://sms2cart.com/api/cron/refresh" | crontab -
# PM2: pm2 start npm --name sms2cart -- start
# Nginx: proxy_pass http://localhost:3000
# SSL: certbot --nginx -d sms2cart.com
```

---

## GHL API Endpoints Used

```
# Send SMS reply back to customer
POST https://services.leadconnectorhq.com/conversations/messages
Headers: Authorization: Bearer {token}, Version: 2021-04-15
Body: { type: "SMS", conversationId, message }

# Validate credentials on connect
GET https://services.leadconnectorhq.com/locations/{locationId}
Headers: Authorization: Bearer {token}, Version: 2021-07-28
```

---

## GitHub
`github.com/MOsaidJutt/cartcloser-ai`
Client: Nicholas Gaulton | Dev: Hamza Khan (Upwork)
