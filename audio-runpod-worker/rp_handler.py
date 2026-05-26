"""
RunPod Serverless handler for audio generation — "bot #3".

Same job contract as the video/image workers:
  input → validate → run task → upload to S3/R2 → return URL + metadata
  output → { status, task, media_type, url, object_key, outputs, metadata }

Tasks:
  music — text → music (MusicGen)
  tts   — text → voiceover (Bark)

Env:
  MODEL_DIR / OUTPUT_DIR, MUSICGEN_MODEL, BARK_MODEL, plus the shared S3_* vars.
"""

import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict

import runpod

from storage import StorageUploader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("audio-worker")

OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/runpod-volume/outputs/audio"))
DEFAULT_TASK = os.getenv("AUDIO_TASK", "music")

ALLOWED_TASKS = {"music", "tts"}
MAX_PROMPT_LENGTH = 2000
MAX_TTS_LENGTH = 1000
MIN_DURATION, MAX_DURATION = 1, 60

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
_uploader = StorageUploader()


def _safe_int(value, default, minimum=None, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _validate_input(job_input: Dict[str, Any]) -> Dict[str, Any]:
    task = str(job_input.get("task", DEFAULT_TASK))
    if task not in ALLOWED_TASKS:
        raise ValueError(f"task must be one of {sorted(ALLOWED_TASKS)}")

    params: Dict[str, Any] = {
        "task": task,
        "project_id": job_input.get("project_id"),
        "trace_id": job_input.get("trace_id"),
    }

    if task == "music":
        prompt = job_input.get("prompt")
        if not prompt or not isinstance(prompt, str):
            raise ValueError("music requires a prompt (string)")
        if len(prompt) > MAX_PROMPT_LENGTH:
            raise ValueError(f"prompt exceeds {MAX_PROMPT_LENGTH}")
        params["prompt"] = prompt
        params["duration"] = _safe_int(
            job_input.get("duration"), 10, MIN_DURATION, MAX_DURATION
        )
    else:  # tts
        text = job_input.get("text")
        if not text or not isinstance(text, str):
            raise ValueError("tts requires text (string)")
        if len(text) > MAX_TTS_LENGTH:
            raise ValueError(f"text exceeds {MAX_TTS_LENGTH}")
        params["text"] = text
        if job_input.get("voice_preset"):
            params["voice_preset"] = str(job_input["voice_preset"])

    return params


def _object_key(params: Dict[str, Any], output_id: str) -> str:
    project_id = params.get("project_id") or "adhoc"
    return f"audio/projects/{project_id}/{params['task']}/{output_id}.wav"


def handler(job: Dict[str, Any]) -> Dict[str, Any]:
    job_id = job.get("id", "unknown")
    job_input = job.get("input") or {}

    if job_input.get("healthcheck") is True:
        return {
            "status": "ok",
            "worker": "audio",
            "tasks": sorted(ALLOWED_TASKS),
            "storage_configured": _uploader.config.is_configured,
        }

    try:
        params = _validate_input(job_input)
    except ValueError as e:
        log.warning("Job %s validation failed: %s", job_id, e)
        return {"status": "failed", "error_code": "INVALID_INPUT", "error": str(e)}

    try:
        from pipelines import DISPATCH
        import soundfile as sf
    except Exception as e:  # pragma: no cover
        log.exception("Job %s import failed", job_id)
        return {"status": "failed", "error_code": "SUBPROCESS_ERROR", "error": str(e)}

    output_id = str(uuid.uuid4())
    started_at = time.time()
    log.info("Job %s running task=%s", job_id, params["task"])

    try:
        samples, sample_rate = DISPATCH[params["task"]](params)
    except ValueError as e:
        return {"status": "failed", "error_code": "INVALID_INPUT", "error": str(e)}
    except Exception as e:
        log.exception("Job %s generation failed", job_id)
        return {"status": "failed", "error_code": "GENERATION_FAILED", "error": str(e)}

    local = OUTPUT_DIR / f"{output_id}.wav"
    sf.write(str(local), samples, sample_rate)
    elapsed = time.time() - started_at

    metadata = {
        "output_id": output_id,
        "task": params["task"],
        "sample_rate": sample_rate,
        "project_id": params.get("project_id"),
        "trace_id": params.get("trace_id"),
        "elapsed_seconds": round(elapsed, 2),
    }

    response: Dict[str, Any] = {
        "status": "completed",
        "task": params["task"],
        "media_type": "audio/wav",
        "metadata": metadata,
    }

    if _uploader.config.is_configured:
        key = _object_key(params, output_id)
        try:
            info = _uploader.upload(local, key, content_type="audio/wav")
            response["url"] = info["url"]
            response["object_key"] = info["object_key"]
            response["url_type"] = info["url_type"]
            response["size_bytes"] = info["size_bytes"]
            response["outputs"] = [
                {
                    "object_key": info["object_key"],
                    "url": info["url"],
                    "size_bytes": info["size_bytes"],
                }
            ]
            try:
                local.unlink()
            except OSError:
                pass
        except Exception as e:
            log.exception("Job %s upload failed", job_id)
            response["local_path"] = str(local)
            response["upload_error"] = str(e)
    else:
        response["local_path"] = str(local)
        log.warning("Job %s storage not configured", job_id)

    log.info("Job %s completed task=%s in %.1fs", job_id, params["task"], elapsed)
    return response


if __name__ == "__main__":
    log.info("Starting audio worker")
    log.info("Storage configured: %s", _uploader.config.is_configured)
    runpod.serverless.start({"handler": handler})
