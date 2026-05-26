# First Launch — going live

Everything is built. This is the click-by-click path to a working system that
generates a real video you can watch. Do the steps **in order**; each ends with
a "✅ you'll know it worked when…" check so you're never guessing.

Time: ~1–2 hours, most of it model downloads. You can stop after **Step 6** and
have working video generation; images/audio (Steps 7–8) can come later.

> Tip: do **Step 9 first in your head** — decide a dollar cap (e.g. $20) so test
> runs can't run away. You'll set it in the app once it's up.

---

## What you already have (done)

- ✅ **Supabase** — project **"The Empire Videos"**, all tables live
  (`https://woqhgehtjnscbkqpmhdp.supabase.co`).
- ✅ **All code** — three GPU workers, the orchestrator, dashboard, Manager bot.
- ✅ **CI** — workers build to private GHCR automatically.

What's left is wiring accounts to the running app.

---

## Step 1 — Cloudflare R2 (storage)  ·  ~10 min

Where every clip, image, audio file, and final video is stored.

1. Cloudflare dashboard → **R2** → create a bucket, e.g. `empire-media`.
2. **R2 → Manage API Tokens** → create a token with **Object Read & Write**.
   Note the **Access Key ID** and **Secret Access Key**.
3. Your S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   (Account ID is on the R2 overview page).
4. (Optional) Enable public access on the bucket to get a `https://pub-XXXX.r2.dev`
   URL — simplest for playback. Otherwise the app uses time-limited signed URLs.

✅ **Worked when:** you have endpoint URL + access key + secret + bucket name written down.

---

## Step 2 — RunPod account + API key  ·  ~5 min

1. Create a [RunPod](https://runpod.io) account, add a little credit.
2. **Settings → API Keys** → create one. This is `RUNPOD_API_KEY`.
3. **Settings → Container Registry Auth → Add** (needed to pull the private images):
   - Registry: `ghcr.io`
   - Username: your GitHub username
   - Password: a GitHub PAT (classic) with **`read:packages`**

✅ **Worked when:** you have a RunPod API key and a GHCR credential saved in RunPod.

---

## Step 3 — Network Volume + preload the video model  ·  ~20–40 min

1. RunPod → **Storage → Network Volume** → create one (100 GB), note the **datacenter**.
2. Spin up a temporary pod (any cheap GPU) with the volume mounted at `/runpod-volume`,
   base image `runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04`.
3. In the pod:
   ```bash
   pip install huggingface_hub
   MODEL_DIR=/runpod-volume/models/Wan2.2-TI2V-5B python -c "from huggingface_hub import snapshot_download; snapshot_download('Wan-AI/Wan2.2-TI2V-5B', local_dir='/runpod-volume/models/Wan2.2-TI2V-5B')"
   ```
   (~15 GB.) Then **terminate the pod** — the volume persists.

Full detail: [`wan22-runpod-worker/README.md`](wan22-runpod-worker/README.md) Step 1.

✅ **Worked when:** `ls /runpod-volume/models/Wan2.2-TI2V-5B` shows files.

---

## Step 4 — Build the worker images  ·  hands-off

Easiest: let CI do it. The images build automatically; you can also trigger a
build from **GitHub → Actions → "Build workers" → Run workflow**. They land at:

```
ghcr.io/sealesempire/wan22-runpod-worker:latest
ghcr.io/sealesempire/image-runpod-worker:latest
ghcr.io/sealesempire/audio-runpod-worker:latest
```

(Or locally: `make video-build TAG=v1`, etc.)

✅ **Worked when:** the packages show up under your GitHub profile → Packages (private).

---

## Step 5 — Create the video Serverless Endpoint  ·  ~10 min

RunPod → **Serverless → New Endpoint**:

- Container Image: `ghcr.io/sealesempire/wan22-runpod-worker:latest` + select your GHCR credential
- GPU: **48 GB+** (A6000/L40/A100); Active workers **0**; Idle timeout 5s; Exec timeout 1800s
- Attach the **Network Volume** from Step 3 at `/runpod-volume`
- **Env vars:**
  ```
  MODEL_DIR=/runpod-volume/models/Wan2.2-TI2V-5B
  OUTPUT_DIR=/runpod-volume/outputs
  WAN_REPO_DIR=/app/Wan2.2
  WAN_TASK=ti2v-5B
  WAN_SIZE=1280*704
  S3_ENDPOINT_URL=...        # from Step 1
  S3_ACCESS_KEY_ID=...
  S3_SECRET_ACCESS_KEY=...
  S3_BUCKET=empire-media
  S3_REGION=auto
  S3_PUBLIC_BASE_URL=...     # optional, if bucket is public
  ```
- Note the **endpoint ID** → this is `RUNPOD_ENDPOINT_ID`.

Test it (no GPU burn): the healthcheck curl in
[`wan22-runpod-worker/README.md`](wan22-runpod-worker/README.md) Step 4 should
return `model_dir_exists: true` and `storage_configured: true`.

✅ **Worked when:** the healthcheck returns both `true`.

---

## Step 6 — Deploy the web app  ·  ~15 min

Get the **Supabase service_role key**: Supabase → The Empire Videos →
**Project Settings → API → service_role** (secret). And an **Anthropic API key**
from [console.anthropic.com](https://console.anthropic.com).

**Vercel (fastest):** import the repo, set **Root Directory = `web`**, add the
env vars below, deploy.

```
NEXT_PUBLIC_SUPABASE_URL=https://woqhgehtjnscbkqpmhdp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...      # service_role secret
ANTHROPIC_API_KEY=...
RUNPOD_API_KEY=...
RUNPOD_ENDPOINT_ID=...             # from Step 5
S3_ENDPOINT_URL=...                # same R2 creds as the worker
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=empire-media
S3_REGION=auto
S3_PUBLIC_BASE_URL=...             # optional
```

> ⚠️ **Final-video assembly runs ffmpeg.** On Vercel it needs a plan allowing
> extended function duration, and long videos may exceed limits. For heavy
> assembly, deploy `web` to a long-lived Node host instead (**Railway / Render /
> Fly.io**: `npm install && npm run build && npm start`) where ffmpeg has no
> time ceiling. Start on Vercel; move if assembly times out.

✅ **Worked when:** the site loads, `/` shows the Projects page with the P&L card.

---

## Step 7 — Image endpoint (optional, enables image bot)  ·  later

Repeat Steps 3–5 for images:
- Preload SDXL: `MODEL_DIR=/runpod-volume/models/sdxl python image-runpod-worker/scripts/download_model.py`
- Endpoint image `ghcr.io/sealesempire/image-runpod-worker:latest`, 24 GB GPU, same `S3_*` vars + `MODEL_DIR=/runpod-volume/models/sdxl`
- Add `RUNPOD_IMAGE_ENDPOINT_ID=...` to the web app env and redeploy.

Detail: [`image-runpod-worker/README.md`](image-runpod-worker/README.md).

## Step 8 — Audio endpoint (optional, enables music/voiceover)  ·  later

- Preload: `python audio-runpod-worker/scripts/download_model.py`
- Endpoint image `ghcr.io/sealesempire/audio-runpod-worker:latest`, 16–24 GB GPU, same `S3_*` vars
- Add `RUNPOD_AUDIO_ENDPOINT_ID=...` to the web app env and redeploy.

Detail: [`audio-runpod-worker/README.md`](audio-runpod-worker/README.md).

---

## Step 9 — First run 🎬

1. **Set a spend cap.** On the home page P&L card, set "Cap $/mo" to e.g. `20`.
2. Go to **Manager bot** (top nav). Type or 🎤 say:
   > *"Create a project called Test, add one 5-second cinematic scene of a sunrise over a city, generate it."*
3. Watch the scene go `generating → generated` (a few minutes — RunPod cold start
   the first time). Then: *"approve the take and assemble the final video."*
4. Open the project from the dashboard → play the **Final video**.
5. Try: *"write a launch campaign for this project"* → check the **Campaigns** page.

✅ **Worked when:** you can play a generated MP4 and see cost appear in the P&L.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Healthcheck `model_dir_exists: false` | Volume not mounted, or model preloaded to a different path than `MODEL_DIR`. |
| Healthcheck `storage_configured: false` | An `S3_*` env var is missing on the **endpoint**. |
| Worker won't start, image pull error | RunPod is missing the GHCR credential (Step 2.3), or it's not selected on the endpoint. |
| Web app 500s on every action | `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_URL` missing/wrong. |
| "Monthly budget cap reached" | Working as intended — raise the cap on the P&L card. |
| Assembly times out | Move `web` off Vercel to Railway/Render/Fly (see Step 6 note). |
| Generation 404 / submit failed | `RUNPOD_ENDPOINT_ID` or `RUNPOD_API_KEY` wrong. |

---

## Security reminders

- `SUPABASE_SERVICE_ROLE_KEY` and all `S3_*` secrets are **server-only** — set them
  in the host's env, never commit them.
- Keep the worker images **private** and the RunPod GHCR credential scoped to `read:packages`.
- There's no end-user auth yet — keep the deployed URL private (Vercel password
  protection) until you add Supabase Auth.
