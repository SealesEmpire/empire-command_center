# Empire Command Center

**Mission control for Seale's Empire LLC.**

A unified knowledge base + task manager + AI-powered organizer that keeps every project (FDDY, B2C Hub Wallet, The Nexus, future ones) in sync. Drop anything in — text, URLs, files, ideas. The bot classifies, deduplicates, files, and surfaces what matters.

---

## What's in here

```
empire-command-center/
├── src/                                  # Next.js 14 frontend (App Router)
│   ├── app/
│   │   ├── page.tsx                      # Root → redirect to /dashboard or /login
│   │   ├── login/page.tsx                # Auth (email/password via Supabase)
│   │   ├── dashboard/page.tsx            # The home page — Drop Zone + Projects + Tasks + Activity
│   │   ├── globals.css                   # Empire dark theme
│   │   └── layout.tsx
│   ├── components/
│   │   ├── NavBar.tsx                    # Top nav
│   │   ├── DropZone.tsx                  # The big paste/drag/URL input
│   │   ├── ProjectStatusCard.tsx         # Per-project dashboard tile
│   │   ├── TodayTasks.tsx                # Today's task list
│   │   └── ActivityFeed.tsx              # Recent activity
│   ├── lib/supabase.ts                   # Supabase client helpers
│   └── types/database.ts                 # TypeScript types
│
├── supabase/
│   ├── migrations/                       # SQL migrations (run in order)
│   │   ├── 20260101000000_initial_schema.sql      # Tables + enums + triggers
│   │   ├── 20260101000001_rls_policies.sql        # Row-level security
│   │   ├── 20260101000002_storage_buckets.sql     # File storage
│   │   └── 20260101000003_business_logic.sql      # RPCs (search, dedup, dashboard)
│   ├── functions/                        # Deno edge functions
│   │   ├── ingest/                       # The Drop Zone backend
│   │   ├── extract-tasks/                # Pull action items from a doc
│   │   ├── daily-report/                 # Generate morning status report
│   │   └── _shared/                      # CORS + AI client
│   └── seed/seed.sql                     # Pre-creates FDDY/HubWallet/Nexus projects
│
├── scripts/deploy.sh                     # One-shot deploy
├── .env.example
└── README.md
```

---

## Architecture

### The data model

| Table                  | What it holds                                                                |
|------------------------|------------------------------------------------------------------------------|
| `organizations`        | Workspaces. One per founder/team.                                            |
| `org_members`          | Who's in each workspace, and what role (owner / admin / contributor / viewer). |
| `projects`             | FDDY, Hub Wallet, Nexus, future projects.                                    |
| `documents`            | Every file/text/URL ingested. Searchable by full-text.                       |
| `knowledge_chunks`     | ~500-word embedded chunks. Powers semantic search and dedup.                 |
| `tasks`                | To-do items. Can be manual, extracted from a document, or inferred by AI.    |
| `decisions`            | Decision log per project — why something was chosen, what alternatives.      |
| `ideas`                | Parking lot. Raw concepts that may become projects later.                    |
| `activity_log`         | Chronological event stream for the dashboard.                                |
| `duplicate_detections` | Pending merge decisions when semantic dedup finds similar content.           |
| `daily_reports`        | Morning briefings, generated daily.                                          |

### The ingestion pipeline

When you drop something into the Drop Zone:

```
   ┌──────────────┐
   │  Drop Zone   │
   └──────┬───────┘
          │ POST /ingest
          ▼
   ┌──────────────────┐    1. SHA-256 hash       ┌─────────────────┐
   │  Edge Function   │ ───── exact dup? ──────▶ │ Reject as dup   │
   │      ingest      │                          └─────────────────┘
   └──────┬───────────┘
          │ 2. Claude classifies
          │    (project, type, tags, summary)
          │
          │ 3. OpenAI embeds the content
          │
          │ 4. pgvector searches existing chunks
          │    (semantic similarity > 0.85?)
          │
          │ 5. Insert document + chunks + embeddings
          │
          │ 6. Log activity
          │
          ▼
   ┌──────────────────┐
   │  Dashboard auto- │
   │  refreshes        │
   └──────────────────┘
```

Two AI providers used:
- **Claude (Anthropic)** for classification, task extraction, summarization, daily reports
- **OpenAI text-embedding-3-small** for the 1536-dim vector embeddings (best price/perf)

You can swap to a single provider later — the AI calls are isolated in `_shared/ai.ts`.

---

## Launch — 15-minute path

### 1. Create a fresh Supabase project

This is **separate** from FDDY's project (`ktmrvjlbtxukdzdkxojf`). The Command Center is its own workspace.

1. Sign in at supabase.com → New Project
2. Name it `empire-command-center`
3. Save the project ref, anon key, and service role key

### 2. Configure env

```bash
cp .env.example .env.local
# Fill in the three Supabase keys
```

### 3. Get API keys

- **Anthropic:** https://console.anthropic.com → API Keys → set as `ANTHROPIC_API_KEY`
- **OpenAI:** https://platform.openai.com/api-keys → set as `OPENAI_API_KEY` (only for embeddings; ~$0.02 per 1M tokens)

### 4. Push everything

```bash
supabase login
supabase link --project-ref YOUR-NEW-REF
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### 5. Run the frontend

```bash
npm install
npm run dev
```

Visit http://localhost:3000 → sign up → land on dashboard.

### 6. Seed your three projects

In Supabase Studio → SQL editor → paste and run `supabase/seed/seed.sql`.

You'll now see FDDY, B2C Hub Wallet, and The Nexus on your dashboard.

### 7. Deploy to Vercel (optional)

```bash
npm install -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

Custom domain: `command.sealesempire.xyz`

---

## How to use it

### Daily workflow

**Morning:** Open the dashboard. The Drop Zone is at the top. Today's tasks below the project grid. Activity feed on the right.

**During the day:** Anything that comes up — a thought, a screenshot, a legal email, a URL — drop it in. The bot files it correctly. Don't think about organization.

**End of day:** Review what got added. Check off completed tasks. Promote any parking-lot ideas you want to act on.

**Weekly:** Generate a daily report (or set up the cron). Use it to brief yourself or share with collaborators.

### Drop Zone modes

- **Paste** — any text. Meeting notes, legal opinions, ideas, code, transcripts.
- **URL** — fetches the page content and ingests it.
- **Drop** — drag a `.txt`, `.md`, or `.csv` file. (Binary file support — PDFs, images with OCR — is Phase 2.)

### Project hints

Use the dropdown at the top of the Drop Zone to override auto-classification when you know which project something belongs to. The bot's confidence score is shown in the activity log — over time you'll see which projects it gets right consistently and which need hints.

### Duplicate detection

When you re-paste something similar to existing content, you'll see a warning at the bottom of the ingestion result. Go to Documents → filter by Duplicates to review. Three options per duplicate:
- **Merge** — combine new info into existing doc
- **Keep both** — they're related but distinct
- **Discard new** — it's fully redundant

---

## Roadmap

### Phase 1 — Shipped (this build)
- ✅ Multi-tenant data model with RLS
- ✅ Drop Zone (paste, URL, simple file drop)
- ✅ AI classification + embedding + dedup
- ✅ Project status dashboard
- ✅ Today's tasks widget
- ✅ Activity feed
- ✅ Auth + basic routing

### Phase 2 — Next 2 weeks
- [ ] PDF text extraction (use `pdf-parse` or Supabase's PDF function)
- [ ] Image OCR for screenshots (Tesseract or Google Vision)
- [ ] Office docs (.docx, .xlsx, .pptx) — use `mammoth` and `xlsx` libraries
- [ ] Voice input (Whisper API for transcription)
- [ ] Full Project View page (overview, tasks, docs, decisions, activity tabs)
- [ ] Task drag-to-reorder + due date editing

### Phase 3 — Month 2
- [ ] Daily report cron (pg_cron triggers `daily-report` at 6 AM org-local)
- [ ] Activity nudges ("Hub Wallet has 14 days no activity — summarize?")
- [ ] Cross-project intelligence ("This Nexus task overlaps with FDDY decision X")
- [ ] Idea-to-project promotion workflow
- [ ] Search across all content (semantic + keyword hybrid)

### Phase 4 — Month 3
- [ ] Team invitations (the multi-tenant infrastructure already supports this)
- [ ] Shareable read-only project views (for investors/clients)
- [ ] Email digest option (daily report sent to your inbox)
- [ ] Mobile PWA polish (already responsive, just needs install prompt + offline)

---

## Cost estimate

For solo use at typical volume (50-100 documents per month):

| Service                  | Cost                           |
|--------------------------|--------------------------------|
| Supabase (Free tier)     | $0 — covers up to 500MB DB    |
| Supabase (Pro if needed) | $25/mo — 8GB DB, daily backups|
| Anthropic Claude API     | ~$5-15/mo at this volume       |
| OpenAI embeddings        | ~$1-3/mo (very cheap)          |
| Vercel hosting           | $0 (Hobby tier free)           |
| **Total**                | **$6-18/mo solo, $31-43/mo with Pro Supabase** |

Scales linearly with volume. At 1,000 docs/month, expect ~$50-80 in AI costs.

---

## Security notes

- All tables have RLS enabled — users only see their own org's data
- Service role key is **only** used in edge functions, never exposed to browser
- Edge functions verify JWT before any operation
- File storage uses per-org folders with RLS enforcement
- Webhook auth pattern (HMAC-SHA256) ready for cross-app integration with FDDY/Hub Wallet/Nexus

---

## Connecting to your other apps

The Empire Ingress webhook pattern is already set up. To have FDDY, the Hub Wallet, or The Nexus push events into the Command Center automatically:

1. Add an `applications` row in the Command Center's DB (or build a UI for it)
2. Use the same HMAC-SHA256 pattern from your existing `empire-ingress` function
3. Events flow into `telemetry_events` and can trigger automatic activity_log entries

(I haven't built the receiver function yet — it's identical to the one you already have in FDDY. If you want me to add it, say the word.)

---

## Support

Seale's Empire LLC — jesse.seale.ceo@sealesempire.xyz
