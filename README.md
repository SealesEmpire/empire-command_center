# Empire Command Center

Scene-based AI video generation platform. Write a prompt per scene, generate
clips on a serverless GPU, approve the take you like, and assemble the approved
clips into a final MP4 — all from one dashboard.

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Dashboard  │────▶│  Next.js Orchestrator │────▶│  RunPod (WAN 2.2)   │
│  (web/)     │◀────│  + state machine      │◀────│  serverless GPU     │
└─────────────┘     └──────────┬───────────┘     └──────────┬──────────┘
                               │                            │ upload mp4
                    ┌──────────▼───────────┐     ┌──────────▼──────────┐
                    │  Supabase (Postgres) │     │  R2 / S3 storage    │
                    │  projects/scenes/... │     │  clips + final mp4  │
                    └──────────────────────┘     └─────────────────────┘
```

## Repo layout

```
empire-command_center/
├── wan22-runpod-worker/     # GPU execution layer — RunPod serverless worker
├── supabase/migrations/     # Postgres schema (projects/scenes/jobs/assets)
├── web/                     # Next.js orchestrator API + dashboard + ffmpeg assembler
└── README.md                # you are here
```

## How it works

1. **Project** → a video. **Scenes** → ordered shots, each with its own prompt.
2. **Generate** a scene → the orchestrator creates a `job`, submits it to the
   RunPod endpoint, and tracks the lifecycle. RunPod runs WAN 2.2, uploads the
   MP4 to R2/S3, and returns an `object_key`.
3. The dashboard **polls** the job; on success the clip becomes an `asset` (a
   "take"). Regenerate to get more takes.
4. **Approve** the take you want per scene.
5. **Assemble** → the orchestrator downloads every approved clip in scene order,
   concatenates them with ffmpeg, uploads the final MP4, and links it on the
   project.

### State machine & retries

`web/lib/orchestrator.ts` owns the reconciliation. `syncJob()` maps RunPod
status → our `job_status`, persists clips, and on a *retryable* failure
(`SUBPROCESS_ERROR`, `NO_OUTPUT`, `GENERATION_FAILED`, `TIMEOUT`) auto-retries up
to `MAX_GENERATION_ATTEMPTS`. `INVALID_INPUT` / `MODEL_NOT_FOUND` fail fast.

---

# Deployment runbook

You'll wire up four things: **storage → model → RunPod endpoint → Supabase → web app.**

## 1. Storage bucket (Cloudflare R2 recommended)

1. Create an R2 bucket (e.g. `empire-clips`).
2. Create an R2 API token (Object Read & Write). Note the Access Key ID + Secret.
3. Your S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. (Optional) Enable public access to get a `https://pub-XXXX.r2.dev` base URL —
   set it as `S3_PUBLIC_BASE_URL` everywhere. Otherwise the app uses signed URLs.

## 2. Preload the WAN 2.2 model

Follow [`wan22-runpod-worker/README.md`](wan22-runpod-worker/README.md) **Step 1**:
create a RunPod Network Volume, attach it to a temp pod, run
`scripts/download_model.py`. ~15 GB, one time.

## 3. Build & deploy the RunPod worker

`wan22-runpod-worker/README.md` Steps 2–4:
- `docker build --platform linux/amd64 -t YOU/wan22-runpod-worker:latest . && docker push …`
- Create a **Serverless Endpoint** (48 GB+ GPU), attach the volume at
  `/runpod-volume`, set the env vars (incl. the **same** `S3_*` creds from step 1).
- Test with the healthcheck curl. Confirm `model_dir_exists` and
  `storage_configured` are both `true`.
- Note your **endpoint ID** and create a **RunPod API key**.

## 4. Supabase

1. Create a Supabase project. Grab the **Project URL** and the **service_role**
   key (Settings → API).
2. Apply the schema:
   ```bash
   # with the Supabase CLI, linked to your project:
   supabase db push
   # — or — paste supabase/migrations/0001_init.sql into the SQL editor.
   ```
   The schema enables RLS with no public policies; the server uses the
   service-role key (which bypasses RLS). Add user-scoped policies later if you
   add multi-tenant auth.

## 5. Web app (orchestrator + dashboard)

```bash
cd web
cp .env.example .env.local   # fill every value (see below)
npm install
npm run dev                  # http://localhost:3000
```

`.env.local` values:

| Var | From |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server only) |
| `RUNPOD_API_KEY` | RunPod API key |
| `RUNPOD_ENDPOINT_ID` | RunPod serverless endpoint ID |
| `S3_ENDPOINT_URL` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | step 1 (same as worker) |
| `S3_REGION` | `auto` for R2 |
| `S3_PUBLIC_BASE_URL` | optional, if bucket is public |
| `MAX_GENERATION_ATTEMPTS` | retry cap, default 3 |

### Deploy the web app

**Vercel** (fastest): import `web/`, add the env vars, deploy. ⚠️ Final-video
**assembly runs ffmpeg in `/api/projects/[id]/assemble`** with `maxDuration=300`.
That needs a Vercel plan allowing extended function duration, and very long
videos may still exceed limits. For heavy assembly, deploy the web app to a
long-lived Node host instead (**Railway / Render / Fly.io** — `npm run build`
then `npm start`), where ffmpeg has no time ceiling.

---

## Verifying end to end

1. Open the dashboard → **create a project**.
2. **Add a scene** with a prompt → **Generate**. Watch the pill go
   `generating → generated` as polling reconciles the RunPod job.
3. **Approve** a take. Repeat for a couple of scenes.
4. **Assemble final video** → the stitched MP4 appears on the project with a
   download link.

If a scene fails, the card shows the worker's `error_code` + message; retryable
errors auto-retry up to the cap.

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` and all `S3_*` secrets are **server-only** — they
  live in `web/lib/*` behind API routes and are never sent to the browser.
- Storage credentials are shared between the worker (uploads) and the web app
  (downloads for assembly + re-signing URLs). Scope the token to the one bucket.
- There is no end-user auth yet — this is a single-operator command center.
  Add Supabase Auth + RLS policies before exposing it publicly.

## What's next

- End-user auth (Supabase Auth) + per-user RLS policies
- Cost guardrails (per-project GPU spend caps) in the orchestrator
- Audio track / music bed in the assembler
- Image conditioning (i2v) upload flow in the dashboard
