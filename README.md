# Empire Command Center

An AI media production platform you run by conversation. Describe what you want —
in text or by voice — and a **Manager bot** plans the work and drives a fleet of
specialist GPU bots to produce it: cinematic **video**, **images** (and face
swaps), **music & voiceover**, a stitched-and-scored **final film**, and
ready-to-publish **social campaigns** — while tracking spend, revenue, and a
budget cap the whole time.

It's a content **factory + distribution + money layer** in one dashboard, built
around a single repeatable pattern so new capabilities slot in cleanly.

```
        🎙️ talk or type
              │
      ┌───────▼─────────┐   plans, routes, narrates (and speaks back)
      │   MANAGER BOT   │   Claude Opus 4.7 · tools = orchestrator actions
      └───────┬─────────┘
              │ creates jobs
   ┌──────────┼───────────────────────────┐
   ▼          ▼            ▼               ▼
 Video      Image        Audio          Social
 (WAN 2.2)  (SDXL +      (MusicGen      (per-platform
            faceswap)    + Bark)         campaign copy)
   └──────────┴────────────┴───── RunPod serverless GPUs ──┘
              │ assets (mp4 / png / wav)
   ┌──────────▼───────────┐     ┌──────────────────────┐
   │  Supabase (Postgres) │     │   R2 / S3 storage     │
   │  projects · scenes · │     │   clips · images ·    │
   │  jobs · assets ·     │     │   audio · final mp4   │
   │  ledger · budget ·   │     └──────────────────────┘
   │  social · settings   │
   └──────────────────────┘
```

---

## What it does

| Capability | What it is |
|---|---|
| 🎬 **Video** (bot #1) | Scene-based generation on WAN 2.2. Each scene is a prompt; generate multiple takes, approve one, assemble approved takes into a final MP4. |
| 🖼️ **Image** (bot #2) | Text→image, image→image, inpaint, and **face swap** (SDXL + InsightFace). Stills, thumbnails, concept art, edits. |
| 🔊 **Audio** (bot #3) | **Music** (MusicGen) and **voiceover** (Bark). The assembler muxes a track over the finished video. |
| 📣 **Social** | Per-platform campaign copy + hashtags (X, IG, TikTok, YouTube, LinkedIn), saved to a library with copy-to-clipboard. |
| 🤖 **Manager bot** | A Claude Opus 4.7 agent whose tools are the orchestrator's actions. Operate the whole platform by chat or **voice** (browser STT/TTS). |
| 🧠 **Knowledge** | Teach the Manager your brand voice / rules from a dashboard page — no redeploy. |
| 💰 **Money layer** | Every generation's cost is tracked; log revenue; see **Profit & Loss** everywhere; set a **monthly spend cap** that blocks runaway GPU spend. |

Everything is drivable from one conversation:
> *"Make a project, write 3 cinematic scenes for a sunrise city film, generate them,
> approve the best takes, score it with upbeat 20-second music, assemble it, then
> write a launch campaign for X, Instagram, and TikTok."*

---

## How the video pipeline works

1. **Project** → a video. **Scenes** → ordered shots, each with its own prompt.
2. **Generate** a scene → the orchestrator creates a `job`, submits it to the
   RunPod endpoint, tracks the lifecycle. RunPod runs the model, uploads the
   result to R2/S3, returns an `object_key`.
3. The dashboard **polls**; on success the clip becomes an `asset` (a "take").
   Regenerate for more takes.
4. **Approve** the take you want per scene.
5. **Assemble** → download approved clips in order, concatenate (and optionally
   mux audio) with ffmpeg, upload the final MP4, link it on the project.

Image and audio bots follow the **same job contract** (`validate → job → asset
URL → structured error_code`), so the orchestrator and Manager drive all of them
the same way. State reconciliation + retries live in `web/lib/orchestrator.ts`:
retryable failures auto-retry up to `MAX_GENERATION_ATTEMPTS` (and respect the
budget cap); validation/infra errors fail fast.

---

## Repo layout

```
empire-command_center/
├── wan22-runpod-worker/     # bot #1 — video (WAN 2.2) on RunPod
├── image-runpod-worker/     # bot #2 — image gen/edit/faceswap (SDXL)
├── audio-runpod-worker/     # bot #3 — music + voiceover (MusicGen / Bark)
├── supabase/migrations/     # schema: projects/scenes/jobs/assets/ledger/budget/social/settings
├── web/                     # Next.js orchestrator API + dashboard + Manager agent + ffmpeg assembler
├── .github/workflows/       # CI: matrix build of all worker images → private GHCR
├── BLUEPRINT.md             # full long-term roadmap & architecture
├── LAUNCH.md                # ← click-by-click first-launch checklist
└── README.md                # you are here
```

**Dashboard pages** (`web/app`): Projects (`/`), project scene board, **Manager
bot** (`/manager`) + Knowledge (`/manager/settings`), and **Campaigns** (`/social`).

## Tech stack

- **Frontend/API:** Next.js 15 (App Router), React 19, TypeScript
- **Agent:** Anthropic SDK, Claude Opus 4.7 (tool use + adaptive thinking)
- **DB/Auth:** Supabase (Postgres, RLS-ready)
- **Storage:** Cloudflare R2 / any S3-compatible
- **GPU:** RunPod serverless (scale-to-zero), one endpoint per bot
- **Workers:** Python + the model stacks (WAN 2.2, diffusers/SDXL, audiocraft/transformers)
- **Assembly:** ffmpeg (bundled via `ffmpeg-static`)

## Getting started

- **Run it live:** follow **[LAUNCH.md](LAUNCH.md)** — storage → model → RunPod
  endpoint → web app → first generated video, with a checkpoint at every step.
- **Local dev:** `cd web && cp .env.example .env.local` (fill values) →
  `npm install && npm run dev`. Common tasks via `make` (`make help`).

> **Security:** `SUPABASE_SERVICE_ROLE_KEY` and all `S3_*` secrets are
> server-only (behind API routes, never sent to the browser). There's no
> end-user auth yet — this is a single-operator command center; keep the
> deployed URL private until Supabase Auth + RLS policies are added.

---

# Add-on — Roadmap (what's left)

Built so far: video + image + audio bots, the Manager (text **and** voice),
editable knowledge, the multi-modal schema, the cost/revenue **ledger** + P&L,
the **monthly spend cap**, and the **social/campaign** layer. See
[BLUEPRINT.md](BLUEPRINT.md) for the full picture. Remaining:

### Near-term
- [ ] **End-user auth** — Supabase Auth + per-user RLS policies before any public exposure.
- [ ] **Stripe billing** — turn revenue tracking into real invoicing / subscriptions.
- [ ] **Image & audio in the dashboard UI** — generate them from the dashboard (not just the Manager); a media gallery view.
- [ ] **Per-project spend caps** + per-job pre-estimate (today's cap is platform-wide, monthly).
- [ ] **Streaming Manager replies** (token-by-token) + an **approval gate** for irreversible actions (assemble, spend, post).

### New bots
- [ ] **Build bot** — codegen → deploy sites/apps/landing pages (the Vercel & Cloudflare MCPs are already available).
- [ ] **Social auto-posting** — platform OAuth + scheduler so campaigns publish themselves (currently copy-to-clipboard only; ToS-sensitive, human-approved).
- [ ] **Trading / Growth bot** — market-data signals and referral-link campaigns. **Paper-trade first**, hard spend caps, human confirm before any live order.

### Platform hardening
- [ ] **Worker registry** — move RunPod endpoint IDs from env into a `workers` table the orchestrator reads.
- [ ] **Higher-quality voice** — swap browser STT/TTS for Deepgram + ElevenLabs behind the same hook.
- [ ] **Cross-session memory + knowledge base (RAG)** for the Manager.
- [ ] **Observability** — structured logs + `trace_id` end-to-end, a job/cost dashboard.
- [ ] **Real RunPod billing** — replace estimated costs with billed actuals.

_Pick any item and it can be built next._
