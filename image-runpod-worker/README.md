# Image RunPod Worker (bot #2)

Image generation + editing worker. Same **job contract** and storage flow as the
[video worker](../wan22-runpod-worker) — text in, asset URL out, structured
`error_code` on failure — so the orchestrator drives both bots the same way.

## Tasks

| `task` | Needs | Does |
|---|---|---|
| `txt2img` | `prompt` | text → image |
| `img2img` | `prompt` + `image` | re-imagine an input image (`strength` 0–1) |
| `inpaint` | `prompt` + `image` + `mask` | edit masked region |
| `faceswap` | `source_image` + `target_image` | swap the source face onto the target |

`image` / `mask` / `*_image` accept an **http(s) URL, a `data:` URI, or a path**.

## Input schema

| Field | Type | Default | Notes |
|---|---|---|---|
| `task` | string | `txt2img` | one of the four above |
| `prompt` | string | required (except faceswap) | max 4000 |
| `negative_prompt` | string | `""` | max 2000 |
| `width` / `height` | int | `1024` | rounded to ×8, 256–1536 |
| `steps` | int | `30` | 1–100 |
| `guidance_scale` | float | `7.0` | 0–20 |
| `num_images` | int | `1` | 1–4 |
| `seed` | int | random | 0–2147483647 |
| `strength` | float | `0.7` | img2img/inpaint only, 0–1 |
| `image` / `mask` | string | — | url / data URI / path |
| `source_image` / `target_image` | string | — | faceswap only |
| `project_id` / `scene_id` / `trace_id` | string | none | tracing → storage path |
| `healthcheck` | bool | `false` | skip work, return status |

## Output

```jsonc
{
  "status": "completed",
  "task": "txt2img",
  "media_type": "image/png",
  "url": "https://.../images/projects/<id>/txt2img/<uuid>_0.png",  // first image
  "object_key": "images/projects/<id>/txt2img/<uuid>_0.png",
  "outputs": [ { "object_key": "...", "url": "...", "url_type": "public", "size_bytes": 1234 } ],
  "metadata": { "seed": 7, "num_images": 1, "elapsed_seconds": 4.1, "trace_id": "..." }
}
```

Error codes match the video worker: `INVALID_INPUT`, `GENERATION_FAILED`,
`NO_OUTPUT`, `SUBPROCESS_ERROR`.

## Deploy (mirrors the video worker)

1. **Preload the model** onto the Network Volume from a temp pod:
   ```bash
   pip install huggingface_hub
   MODEL_DIR=/runpod-volume/models/sdxl python download_model.py
   # optional: WITH_FACESWAP=1 to fetch InsightFace detection models
   ```
   For `faceswap`, also place `inswapper_128.onnx` at
   `/runpod-volume/models/insightface/inswapper_128.onnx`.
2. **Build & push** (private GHCR): `./build.sh v1` — or let CI do it (the
   workflow builds every worker, see [`.github/workflows/build-worker.yml`](../.github/workflows/build-worker.yml)).
3. **Create a Serverless Endpoint** — 24 GB GPU is plenty for SDXL (A5000/L4/A6000).
   Attach the volume at `/runpod-volume`, set the **same `S3_*` env vars** as the
   video worker plus:
   ```
   MODEL_DIR=/runpod-volume/models/sdxl
   MODEL_ID=stabilityai/stable-diffusion-xl-base-1.0
   OUTPUT_DIR=/runpod-volume/outputs/images
   IMAGE_FORMAT=png
   ```
   Add the GHCR pull credential (private image), same as the video worker.

## Local test (no GPU)

```bash
MODEL_DIR=/tmp python test_local.py   # validation paths only
```
