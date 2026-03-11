# SMS2Cart — Architecture & Code Map

## Getting Started
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## Tech Stack
- Next.js 14+ (App Router), TypeScript
- Tailwind CSS, Framer Motion
- Prisma + SQLite
- OpenAI GPT-4o
- Cheerio + Axios
- JWT (jsonwebtoken + bcryptjs)

## Environment Variables (.env)
- `OPENAI_API_KEY` — OpenAI API key for GPT-4o chat completions
- `DATABASE_URL` — Prisma SQLite path (default: `file:./dev.db`)
- `NEXTAUTH_SECRET` — JWT signing secret
- `NEXTAUTH_URL` — App base URL (default: `http://localhost:3000`)

## Project Structure
```
sms2cart/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register/route.ts
│   │   │   ├── login/route.ts
│   │   │   └── session/route.ts
│   │   ├── agents/
│   │   │   ├── route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       ├── scrape/route.ts
│   │   │       ├── scrape-status/route.ts
│   │   │       ├── deploy-ghl/route.ts       (Phase 2 stub)
│   │   │       ├── ghl-status/route.ts       (Phase 2 stub)
│   │   │       ├── export-snapshot/route.ts  (Phase 2 stub)
│   │   │       └── undeploy-ghl/route.ts     (Phase 2 stub)
│   │   ├── demo/
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       ├── start/route.ts
│   │   │       └── chat/route.ts
│   │   └── settings/
│   │       └── ghl/route.ts                  (Phase 2 stub)
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   ├── settings/page.tsx
│   │   └── agents/
│   │       ├── new/page.tsx
│   │       └── [id]/edit/page.tsx
│   ├── demo/
│   │   └── [id]/page.tsx
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── scraper.ts
│   ├── knowledge-base.ts
│   ├── system-prompt.ts
│   ├── auth.ts
│   └── prisma.ts
├── middleware.ts
├── prisma/
│   └── schema.prisma
├── .env
├── .env.example
└── README.md
```

## Feature-to-Code Map

### Authentication
- Files: `lib/auth.ts`, `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/session/route.ts`, `middleware.ts`
- Key functions: `hashPassword` (line 10), `verifyPassword` (line 14), `signToken` (line 24), `verifyToken` (line 28), `getSessionUser` (line 38), `unauthorized` (line 54)
- Auth: JWT stored in HTTP-only cookie named `token`, 7-day expiry
- Protected paths: `/dashboard`, `/settings`, `/agents` (see `middleware.ts` line 8)

### Shopify Scraping Engine
- Files: `lib/scraper.ts`
- Key functions: `scrapeShopifyStore` (line 113), `scrapeProducts` (line 48), `scrapePolicies` (line 87), `scrapeStoreMeta` (line 96), `quickProductCount` (line 137)
- Types: `ScrapedProduct`, `ScrapedPolicies`, `ScrapedStore` (lines 8-33)

### Knowledge Base Builder
- Files: `lib/knowledge-base.ts`
- Key functions: `buildKnowledgeBase` (line 103), `analyzeWithAI` (line 21), `buildQuickKnowledgeBase` (line 75)
- Types: `KnowledgeBaseResult` (lines 8-16)

### System Prompt Builder
- Files: `lib/system-prompt.ts`
- Key functions: `buildSystemPrompt` (line 20), `buildOpeningMessage` (line 63), `generateDefaultBotName` (line 87)
- Constants: `DEFAULT_OPENING_MESSAGE_TEMPLATE` (line 81)

### Agent CRUD
- Files: `app/api/agents/route.ts`, `app/api/agents/[id]/route.ts`
- Key functions: `GET` (line 15), `POST` (line 36 — triggers scrapeShopifyStore + buildKnowledgeBase), `PUT` (line 27), `DELETE` (line 65)
- Re-scrape: `app/api/agents/[id]/scrape/route.ts:8`

### Demo Chat Interface
- Files: `app/demo/[id]/page.tsx`
- Key components: `DemoPage` (line 325), `LandingScreen` (line 144), `ChatScreen` (line 222), `PhoneFrame` (line 99), `MessageBubble` (line 62), `TypingIndicator` (line 44), `StoreFavicon` (line 30)
- Streaming: SSE from `/api/demo/[id]/chat`, tokens appended in real-time
- Mobile vs desktop: full-screen on mobile, phone frame mockup on desktop (line 99)

### Demo Chat API (OpenAI Integration)
- Files: `app/api/demo/[id]/chat/route.ts`
- Key functions: `POST` (line 8) — SSE streaming, 50-message rate limit (line 12)
- Rate limit: `MAX_MESSAGES_PER_CONVERSATION = 50` (line 12)

### Admin UI Pages
- `/login` — `app/(auth)/login/page.tsx` — dark-themed auth, login/register toggle
- `/dashboard` — `app/(dashboard)/dashboard/page.tsx` — agent card grid, copy demo link, Phase 2 GHL button (greyed out)
- `/settings` — `app/(dashboard)/settings/page.tsx` — OpenAI key + greyed-out GHL section
- `/agents/new` — `app/(dashboard)/agents/new/page.tsx` — 4-step wizard: StepUrl (line 18), StepScanning (line 100), StepConfigure (line 137), StepSuccess (line 246)
- `/agents/[id]/edit` — `app/(dashboard)/agents/[id]/edit/page.tsx` — edit form + re-scan + delete modal

### Phase 2 Placeholders (GHL)
- Files: `app/api/agents/[id]/deploy-ghl/route.ts`, `app/api/agents/[id]/ghl-status/route.ts`, `app/api/agents/[id]/export-snapshot/route.ts`, `app/api/agents/[id]/undeploy-ghl/route.ts`, `app/api/settings/ghl/route.ts`
- Status: placeholder, returns 501 `{ message: "Coming in Phase 2" }`

## API Endpoints
| Method | Route | Purpose | File:Line |
|--------|-------|---------|-----------|
| POST | /api/auth/register | Register user | `app/api/auth/register/route.ts:6` |
| POST | /api/auth/login | Login, returns JWT cookie | `app/api/auth/login/route.ts:6` |
| GET | /api/auth/session | Get current user | `app/api/auth/session/route.ts:6` |
| DELETE | /api/auth/session | Logout (clear cookie) | `app/api/auth/session/route.ts:24` |
| PUT | /api/settings/openai | Save OpenAI API key | `app/api/settings/openai/route.ts:6` |
| GET | /api/agents | List user's agents | `app/api/agents/route.ts:15` |
| POST | /api/agents | Create agent (triggers scrape+AI) | `app/api/agents/route.ts:36` |
| GET | /api/agents/[id] | Get agent details | `app/api/agents/[id]/route.ts:8` |
| PUT | /api/agents/[id] | Update agent config | `app/api/agents/[id]/route.ts:27` |
| DELETE | /api/agents/[id] | Delete agent | `app/api/agents/[id]/route.ts:65` |
| POST | /api/agents/[id]/scrape | Re-scrape store | `app/api/agents/[id]/scrape/route.ts:8` |
| GET | /api/agents/[id]/scrape-status | Scrape progress polling | `app/api/agents/[id]/scrape-status/route.ts:8` |
| GET | /api/demo/[id] | Public agent data (no auth) | `app/api/demo/[id]/route.ts:8` |
| POST | /api/demo/[id]/start | Start demo, get opening message | `app/api/demo/[id]/start/route.ts:8` |
| POST | /api/demo/[id]/chat | Chat with AI bot (SSE streaming) | `app/api/demo/[id]/chat/route.ts:8` |
| PUT | /api/settings/ghl | Save GHL credentials | 501 Phase 2 |
| POST | /api/agents/[id]/deploy-ghl | Deploy to GHL | 501 Phase 2 |
| GET | /api/agents/[id]/ghl-status | GHL deploy status | 501 Phase 2 |
| POST | /api/agents/[id]/export-snapshot | Export GHL snapshot | 501 Phase 2 |
| DELETE | /api/agents/[id]/undeploy-ghl | Undeploy from GHL | 501 Phase 2 |

## Database Schema
- Defined in: `prisma/schema.prisma`
- Prisma singleton client: `lib/prisma.ts`
- Models:
  - `User` — lines 14-24
  - `Agent` — lines 26-51 (includes Phase 2 GHL fields: ghlAgentId, ghlWorkflowId, ghlDeployed, ghlDeployedAt)
  - `Conversation` — lines 53-60
  - `Message` — lines 62-69

## How to Update Common Things
- **Change chatbot personality/prompt** → `lib/system-prompt.ts`
- **Change opening message template** → `lib/system-prompt.ts`
- **Update scraping logic** → `lib/scraper.ts`
- **Modify demo chat UI styling** → `app/demo/[id]/page.tsx`
- **Change phone frame design** → `app/demo/[id]/page.tsx` (PhoneFrame component)
- **Add new API endpoint** → `app/api/`, follow pattern in `app/api/agents/route.ts`
- **Change auth method** → `lib/auth.ts`, `middleware.ts`
- **Update AI model (e.g., GPT-4o to GPT-4o-mini)** → `lib/knowledge-base.ts`, `app/api/demo/[id]/chat/route.ts`
- **Change database** → `prisma/schema.prisma`, update `DATABASE_URL` in `.env`
- **Add GHL integration (Phase 2)** → placeholder routes in `app/api/agents/[id]/deploy-ghl/`, DB fields already in schema (`ghlAgentId`, `ghlWorkflowId`, `ghlDeployed`, `ghlDeployedAt`)

## Phase 1 vs Phase 2
### Phase 1 (Current — Built):
- User auth, agent CRUD, Shopify scraping, knowledge base, demo chat, shareable links

### Phase 2 (Planned — Placeholder):
- GHL API integration (create Conversation AI bot)
- GHL knowledge base upload
- GHL Snapshot generation (abandoned cart workflow + SMS trigger)
- GHL deployment status tracking
- Placeholder routes: `app/api/agents/[id]/deploy-ghl/`, `app/api/agents/[id]/ghl-status/`, `app/api/agents/[id]/export-snapshot/`, `app/api/agents/[id]/undeploy-ghl/`, `app/api/settings/ghl/`
- DB fields ready: `ghlAgentId`, `ghlWorkflowId`, `ghlDeployed`, `ghlDeployedAt` in Agent model
- UI element: "Export to GHL" button greyed out in dashboard
