# WAN 2.2 RunPod Serverless Worker

Production-grade RunPod serverless worker for [Wan-AI/Wan2.2-TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B).

**Returns a signed/public URL to the generated MP4, not a local path.** Plugs into the Supabase + Next.js orchestrator in [`../web`](../web).

---

## What's in here

```
wan22-runpod-worker/
├── Dockerfile              # CUDA 12.8 + PyTorch 2.8 + WAN 2.2 repo
├── rp_handler.py           # RunPod handler — validation, generation, upload
├── storage.py              # S3-compatible uploader (R2 / S3 / Supabase)
├── test_local.py           # Local validation smoke test
├── scripts/
│   └── download_model.py   # One-time model preload onto network volume
├── .dockerignore
└── README.md
```

---

## Architecture

```
Job → validate → WAN generate.py → MP4 on disk → upload to R2/S3 → return URL
```

| Feature | Basic | This worker |
|---|---|---|
| Output | local Network Volume path | signed/public URL (frontend-consumable) |
| Validation | minimal | size/task/length/range checks |
| Error handling | generic | structured `error_code` for retry logic |
| Healthcheck | none | `{"healthcheck": true}` returns instantly |
| Logging | print | structured logs with job IDs |
| Tracing | none | accepts `project_id` + `scene_id` |
| Negative prompts | no | yes |

---

## Step 1 — Preload model onto a Network Volume

The model is ~15 GB. Don't bake it into the image. Put it on a Network Volume.

1. **Create a RunPod Network Volume** (100 GB is plenty). Note which datacenter — your endpoint must be in the same one.
2. **Spin up a temporary pod** with the volume attached at `/runpod-volume`. Any cheap GPU or CPU pod works. Use the same base image:
   ```
   runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04
   ```
3. **Inside the pod**, install + run the downloader:
   ```bash
   pip install huggingface_hub
   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/wan22-runpod-worker/scripts/download_model.py -o download_model.py
   python download_model.py
   ```
   Wait 5–20 min depending on your pod's bandwidth.
4. **Verify**:
   ```bash
   ls -lh /runpod-volume/models/Wan2.2-TI2V-5B
   ```
5. **Terminate the pod.** The volume persists.

---

## Step 2 — Build & push the image

```bash
cd wan22-runpod-worker

# Docker Hub:
docker build --platform linux/amd64 -t YOUR_USER/wan22-runpod-worker:latest .
docker push YOUR_USER/wan22-runpod-worker:latest
```

The `--platform linux/amd64` matters if you're building on Apple Silicon — RunPod GPUs are x86_64.

---

## Step 3 — Create the Serverless Endpoint

In RunPod console: **Serverless → New Endpoint**.

**Worker config:**
- Container Image: `YOUR_USER/wan22-runpod-worker:latest`
- GPU type: **48 GB minimum** (A6000, L40, A100 40/80, H100)
- Container Disk: 20 GB
- Active workers: 0 (scale to zero when idle)
- Max workers: start with 1, raise as demand grows
- Idle timeout: 5 seconds
- Execution timeout: 1800 seconds (30 min ceiling per job)

**Network Volume:** attach the volume from Step 1 at mount path `/runpod-volume`.

**Environment variables (required):**
```
MODEL_DIR=/runpod-volume/models/Wan2.2-TI2V-5B
OUTPUT_DIR=/runpod-volume/outputs
WAN_REPO_DIR=/app/Wan2.2
WAN_TASK=ti2v-5B
WAN_SIZE=1280*704
WAN_TIMEOUT_SECONDS=1800
```

**Environment variables (storage — strongly recommended).** For Cloudflare R2:
```
S3_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<from R2 API tokens>
S3_SECRET_ACCESS_KEY=<from R2 API tokens>
S3_BUCKET=<your bucket name>
S3_REGION=auto
S3_PUBLIC_BASE_URL=https://pub-XXXXX.r2.dev   # optional, if bucket is public
```

> **Never paste these into chat, code, or screenshots.** Set them only in the RunPod endpoint env vars UI.

---

## Step 4 — Test the endpoint

### Healthcheck (no GPU burn)

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync" \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": {"healthcheck": true}}'
```

Expected:
```json
{ "output": { "status": "ok", "model_dir_exists": true, "wan_repo_exists": true, "storage_configured": true } }
```

### Real generation (async — use this in production)

```bash
curl -X POST "https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run" \
  -H "Authorization: Bearer YOUR_RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "input": { "prompt": "Cinematic aerial push-in toward a black glass headquarters at sunrise", "size": "1280*704", "sample_steps": 30, "seed": 42, "project_id": "proj_demo", "scene_id": "scene_001" } }'
```

---

## Input schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `prompt` | string | **required** | max 4000 chars |
| `negative_prompt` | string | `""` | max 2000 chars |
| `task` | string | `ti2v-5B` | one of `ti2v-5B`, `t2v-A14B`, `i2v-A14B` |
| `size` | string | `1280*704` | see allowed list in `rp_handler.py` |
| `sample_steps` | int | `30` | 1–100 |
| `seed` | int | random | 0–2147483647 |
| `sample_shift` | float | (model default) | optional |
| `sample_guide_scale` | float | (model default) | optional |
| `image` | string | none | path for i2v/ti2v image conditioning |
| `offload_model` | bool | `true` | CPU offload — keep on for memory safety |
| `project_id` | string | none | tracing — included in storage path |
| `scene_id` | string | none | tracing — included in storage path |
| `timeout_seconds` | int | `1800` | 60–7200 |
| `healthcheck` | bool | `false` | if true, skip generation and return status |

## Error codes

| Code | Meaning | Retry? |
|---|---|---|
| `INVALID_INPUT` | Validation failed | No — fix input |
| `MODEL_NOT_FOUND` | Network volume not mounted or model missing | No — fix infra |
| `TIMEOUT` | Generation exceeded `timeout_seconds` | Maybe — fewer steps |
| `SUBPROCESS_ERROR` | Worker crashed launching WAN | Yes — once |
| `GENERATION_FAILED` | WAN exited non-zero | Maybe — check `stderr_tail` |
| `NO_OUTPUT` | WAN claimed success but no file | Yes — once |

The orchestrator in `../web` uses these codes to decide retry vs. surface to user (see `web/lib/runpod.ts`).

---

## Local testing

```bash
cd wan22-runpod-worker
python test_local.py
```

Tests validation paths only — actual generation requires a GPU and the WAN repo inside the Docker image.

---

## Cost notes

- An A100 40GB on RunPod runs roughly $0.50–$0.80/hr active.
- A 6-second clip at 30 steps takes ~3–6 min on an A100 → roughly **$0.05–$0.10/clip**.
- Active workers at 0 + 5-second idle timeout means you only pay when generating.
- Network Volume: ~$0.10/GB/month — the 15 GB model is **~$1.50/month** for storage.

Cost guardrails live in the orchestrator layer (`../web`).
