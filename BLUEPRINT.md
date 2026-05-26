# Empire Command Center — Blueprint

A living roadmap from "video generator" to a **self-sustaining, multi-modal AI
operations platform** you drive by voice. This document is the map: what exists,
what the target looks like, and exactly what's needed to get there.

---

## 1. The vision in one paragraph

You speak to a **manager bot**. It understands intent, breaks the request into
tasks, and dispatches **specialist bots** (video, image, audio, code, social,
trading) to do the work in parallel. Everything they produce flows back through
one orchestrator, is tracked in one database, and is stored in one bucket. Over
time the system earns more than it costs to run — through content products,
client work, campaigns, and (carefully) trading — making it **self-sustaining**.

---

## 2. Where we are today (foundation — DONE)

| Layer | Status | Where |
|---|---|---|
| GPU job pattern (validate → job → asset URL → `error_code`) | ✅ | `wan22-runpod-worker/` |
| **Bot #1 — Video** (WAN 2.2) | ✅ | `wan22-runpod-worker/` |
| **Bot #2 — Image** (txt2img/img2img/inpaint/faceswap) | ✅ | `image-runpod-worker/` |
| Orchestrator API + retry/state machine | ✅ | `web/lib/orchestrator.ts`, `web/app/api/**` |
| Dashboard (scene workflow, edit/reorder/generate-all) | ✅ | `web/app`, `web/components` |
| Postgres schema (projects/scenes/jobs/assets) | ✅ | `supabase/migrations/0001_init.sql` |
| Storage (R2/S3) | ✅ | `web/lib/storage.ts`, worker `storage.py` |
| FFmpeg assembler | ✅ | `web/lib/assembler.ts` |
| Private CI image builds (matrix, all bots) | ✅ | `.github/workflows/build-worker.yml` |

**This is the template.** Every new capability is the same shape — the hard
architectural work is already done.

---

## 3. Target architecture

```
  🎙️ Voice in ─► STT ─► ┌───────────────────┐ ─► TTS ─► 🔊 Voice out
                        │   MANAGER BOT      │
                        │   (Claude Opus)    │  plans, routes, narrates
                        └─────────┬─────────┘
                                  │ tool calls → orchestrator API
                ┌─────────────────┼─────────────────────────────┐
                ▼                 ▼              ▼                ▼
            Specialist bots (uniform job contract, scale-to-zero)
        ┌──────────┬──────────┬──────────┬──────────┬──────────┐
        │  Video   │  Image   │  Audio   │  Build   │  Social  │  Trading
        └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘
             └──────────┴──────────┴──────────┴──────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             ▼                    ▼                     ▼
        Supabase (jobs/         R2/S3 (assets)     Observability
        assets/ledger)                              (logs, cost, traces)
```

---

## 4. The bot roster + recommended providers

**Rule: group by modality, not micro-task.** Each bot is one endpoint that
handles its sub-tasks via a `task` param (exactly like the image bot does
`txt2img|img2img|inpaint|faceswap`). Target: **1 manager + ~6 specialists.**

| Bot | Sub-tasks | Recommended provider(s) | Build path |
|---|---|---|---|
| **Manager** | intent, planning, routing, dialogue | **Claude Opus** (plan) + **Haiku** (cheap steps) | Anthropic API + tool use, hosted in `web/` |
| **Video** ✅ | t2v, i2v | WAN 2.2 on **RunPod** | done |
| **Image** ✅ | txt2img, img2img, inpaint, faceswap, (upscale next) | SDXL/**Flux** + InsightFace on **RunPod** | done |
| **Audio** | music, voiceover (TTS), transcription (STT) | **Suno**/Stable Audio · **ElevenLabs** · Whisper | new worker, mostly API-wrapping |
| **Build** | apps, sites, landing pages | **Claude** (codegen) → deploy via **Vercel/Cloudflare** | agent + deploy MCP (already connected) |
| **Social** | post copy, scheduling, campaigns | Claude + platform APIs (X, IG, TikTok, LinkedIn) | new worker + OAuth |
| **Trading/Growth** | market data, signals, referral campaigns | Exchange APIs (Crypto.com market data already connected) | new worker — **paper-trade first** |

---

## 5. The standardized bot contract (the keystone)

Every bot **must** accept and return this shape. Conforming bots are
plug-and-play for the manager and the orchestrator.

```jsonc
// REQUEST
{ "task": "txt2img", "params": { ... }, "project_id": "...", "trace_id": "..." }

// RESPONSE (success)
{ "status": "completed", "outputs": [ { "object_key": "...", "url": "..." } ],
  "url": "...", "media_type": "image/png", "metadata": { ... } }

// RESPONSE (failure)
{ "status": "failed", "error_code": "GENERATION_FAILED", "error": "..." }
```

Shared `error_code` vocabulary: `INVALID_INPUT`, `MODEL_NOT_FOUND`,
`GENERATION_FAILED`, `TIMEOUT`, `NO_OUTPUT`, `SUBPROCESS_ERROR`. The video and
image bots already comply.

**What's needed to formalize this:**
- [ ] Extract a tiny shared `worker_contract.py` (validation helpers + response
      builders) so new Python bots don't reinvent it.
- [ ] Add a `worker_type` column to `jobs`/`assets` so one schema tracks all bots.
- [ ] Generalize `web/lib/runpod.ts` to a registry: `worker_type → endpoint_id`.

---

## 6. Data model evolution

Current tables assume video scenes. To go multi-modal:

- [ ] **`jobs.worker_type`** + **`assets.media_type`** (image/video/audio/...).
- [ ] **`workers`** table: `id, type, runpod_endpoint_id, default_params, enabled`.
- [ ] **`ledger`** table: every job writes estimated + actual cost; every revenue
      event writes income. This is the spine of "self-sustaining."
- [ ] **`tasks`/`runs`** table for the manager: a parent record that fans out to
      many `jobs` across bots (e.g. "make a promo" → 1 script + 3 images + 1 video
      + 1 voiceover + 1 assemble).
- [ ] Auth: Supabase Auth + per-user RLS before any public exposure.

---

## 7. Manager bot + voice

The manager is a **Claude agent with tools**, where the tools are the
orchestrator endpoints (`create job`, `get job`, `assemble`, `list assets`, …).

**What's needed:**
- [ ] `web/app/api/agent/route.ts` — Claude API call with tool definitions that
      map 1:1 to orchestrator actions; a loop that runs tools until the task is done.
- [ ] System prompt encoding the bot roster, cost ceilings, and approval rules.
- [ ] **Voice front-end:** mic → STT (Whisper/Deepgram) → agent → TTS
      (ElevenLabs/Cartesia) → speaker. Start text-only, add voice as a wrapper.
- [ ] Streaming UI so you see the manager's plan + each bot's progress live.
- [ ] **Human-in-the-loop gate** for irreversible actions (posting, spending, trading).

---

## 8. Self-sustaining economics

Two halves: **control cost**, **generate revenue**, **measure both in the ledger**.

**Cost control (build into the orchestrator):**
- [ ] Per-job cost estimate before submit; per-project + global **spend caps**.
- [ ] Scale-to-zero on every endpoint (already the default) — pay only on use.
- [ ] Model tiering: Haiku for routing/cheap steps, Opus only for hard planning.
- [ ] Cache/reuse assets; dedupe identical prompts.

**Revenue engines (each maps to bots you're already building):**
- Content products — faceless channels, stock clips, ad creatives (Video+Image+Audio).
- Done-for-you client work — sites/apps/campaigns (Build+Social).
- Subscriptions — expose the dashboard as a product once auth + billing exist.
- Affiliate/referral campaigns (Social+Growth).
- Trading — **only** after paper-trading proves an edge, with hard caps.

**What's needed:** Stripe (billing), the `ledger` table, and a simple
**P&L view** in the dashboard: revenue − GPU/API spend = runway.

---

## 9. Infrastructure & ops

| Concern | Recommendation |
|---|---|
| Web app hosting | Vercel for the app; **long-lived Node host (Railway/Render/Fly)** for ffmpeg assembly + the agent loop |
| GPU | RunPod serverless, one endpoint per bot, scale-to-zero |
| DB + Auth | Supabase |
| Storage | Cloudflare R2 (no egress fees) |
| Secrets | host env vars only — never in repo; rotate the shared `S3_*` token periodically |
| Observability | structured logs + `trace_id` end-to-end; a job/cost dashboard |
| Queue/concurrency | RunPod handles queueing; add a global concurrency cap in the orchestrator |

---

## 10. Security, compliance, risk (plan, don't skip)

- **Auth before exposure** — today it's single-operator; add Supabase Auth + RLS.
- **Faceswap / likeness** — consent + usage policy; high legal/ethical exposure.
- **Social automation** — use official APIs; keep approve-before-publish to avoid bans/ToS violations.
- **Trading** — real-money risk. Paper-trade first; hard spend caps; human confirm on live orders; never auto-withdraw.
- **Content provenance** — consider watermarking/labeling AI media.
- **Key hygiene** — scope the storage token to one bucket; least-privilege everywhere.

---

## 11. Phased roadmap

> Each phase ends with something usable. Don't start a phase until the prior one runs.

**Phase 0 — Operationalize the foundation (now)**
- [ ] Deploy: R2 + preloaded models + both RunPod endpoints + Supabase + web app.
- [ ] Real end-to-end run: prompt → clip → approve → assemble.
- *Needed:* accounts/keys (RunPod, Supabase, Cloudflare), `web/.env.local` filled.

**Phase 1 — Multi-modal core**
- [ ] `worker_type` registry + schema columns; wire the **Image bot** into the dashboard.
- [ ] Image-in-the-flow: generate stills, use one as i2v seed for video.
- *Needed:* schema migration `0002_multimodal.sql`, orchestrator registry, UI tab.

**Phase 2 — Audio + finished content**
- [ ] **Audio bot** (voiceover + music). Assembler lays audio over the video.
- *Needed:* ElevenLabs + Suno/Stable Audio keys, new worker, assembler audio track.

**Phase 3 — Manager bot + voice**
- [ ] Agent route with tools = orchestrator; text chat first, then voice wrapper.
- *Needed:* Anthropic API key, STT/TTS providers, approval-gate UI.

**Phase 4 — Money layer**
- [ ] `ledger` + cost caps + Stripe billing + P&L view.
- *Needed:* Stripe account, ledger migration, cost-estimate functions per bot.

**Phase 5 — Build + Social bots**
- [ ] Codegen→deploy bot (Vercel/Cloudflare MCP already wired); social bot with OAuth + approval gate.

**Phase 6 — Growth + Trading**
- [ ] Referral/affiliate campaigns; **paper-trading** bot with strict guardrails before any live capital.

---

## 12. Immediate next actions

1. **Deploy Phase 0** end-to-end and confirm a real generation.
2. **Schema `0002`**: add `worker_type` + `media_type` + `workers` + `ledger`.
3. **Wire the Image bot** into the orchestrator + a dashboard tab.
4. Then start the **Manager bot** (text first).

_Pick the next item and I'll build it._
