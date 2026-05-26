# Audio RunPod Worker (bot #3)

Audio generation worker — music and voiceover. Same **job contract** and storage
flow as the [video](../wan22-runpod-worker) and [image](../image-runpod-worker)
workers, so the orchestrator drives all three the same way.

## Tasks

| `task` | Needs | Does | Model |
|---|---|---|---|
| `music` | `prompt`, `duration` (1–60s) | text → music | MusicGen (`facebook/musicgen-small`) |
| `tts` | `text`, optional `voice_preset` | text → voiceover | Bark (`suno/bark-small`) |

## Output

```jsonc
{
  "status": "completed",
  "task": "music",
  "media_type": "audio/wav",
  "url": "https://.../audio/projects/<id>/music/<uuid>.wav",
  "object_key": "audio/projects/<id>/music/<uuid>.wav",
  "metadata": { "sample_rate": 32000, "elapsed_seconds": 7.2 }
}
```

Error codes match the other workers: `INVALID_INPUT`, `GENERATION_FAILED`,
`SUBPROCESS_ERROR`.

## Deploy (mirrors the other workers)

1. **Preload models** from a temp pod: `python download_model.py` (MusicGen + Bark).
2. **Build & push** (private GHCR): `./build.sh v1` — or let CI do it (matrix in
   [`.github/workflows/build-worker.yml`](../.github/workflows/build-worker.yml)).
3. **Create a Serverless Endpoint** — 16–24 GB GPU is plenty. Attach the volume at
   `/runpod-volume`, set the **same `S3_*` env vars** as the other workers, plus
   optionally `MUSICGEN_MODEL` / `BARK_MODEL`. Add the GHCR pull credential.

The orchestrator reaches this endpoint via `RUNPOD_AUDIO_ENDPOINT_ID` in `web`.

## Local test (no GPU)

```bash
python test_local.py   # validation paths only
```
