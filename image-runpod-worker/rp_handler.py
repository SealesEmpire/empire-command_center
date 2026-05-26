"""
RunPod Serverless handler for image generation/editing — "bot #2".

Same job contract as the WAN video worker:
  input  → validate → run task → upload to S3/R2 → return URL(s) + metadata
  output → { status, outputs:[{object_key,url,...}], url, media_type, error_code }

Tasks (chosen via `task`):
  txt2img   — text → image
  img2img   — image + prompt → image
  inpaint   — image + mask + prompt → edited image
  faceswap  — swap source face onto target image (InsightFace)

Environment variables (set on the RunPod endpoint):
  Required-ish:
    MODEL_DIR           — preloaded diffusers model dir on the network volume
    MODEL_ID            — fallback Hub id (default SDXL base)
    OUTPUT_DIR          — temp output dir
  Storage (strongly recommended) — same S3_* vars as the video worker.
  Defaults:
    IMAGE_TASK          — default "txt2img"
    IMAGE_FORMAT        — "png" (default) or "jpg"
"""

import base64  # noqa: F401  (kept for parity; pipelines does the decoding)
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import runpod

from storage import StorageUploader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("image-worker")

MODEL_DIR = Path(os.getenv("MODEL_DIR", "/runpod-volume/models/sdxl"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/runpod-volume/outputs/images"))
DEFAULT_TASK = os.getenv("IMAGE_TASK", "txt2img")
IMAGE_FORMAT = os.getenv("IMAGE_FORMAT", "png").lower()

ALLOWED_TASKS = {"txt2img", "img2img", "inpaint", "faceswap"}
MAX_PROMPT_LENGTH = 4000
MAX_NEGATIVE_PROMPT_LENGTH = 2000
MIN_DIM, MAX_DIM = 256, 1536
MIN_STEPS, MAX_STEPS = 1, 100
MAX_IMAGES = 4

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


def _safe_float(value, default, minimum=None, maximum=None):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _round8(n: int) -> int:
    return max(MIN_DIM, min(MAX_DIM, (n // 8) * 8))


def _validate_input(job_input: Dict[str, Any]) -> Dict[str, Any]:
    task = str(job_input.get("task", DEFAULT_TASK))
    if task not in ALLOWED_TASKS:
        raise ValueError(f"task must be one of {sorted(ALLOWED_TASKS)}")

    params: Dict[str, Any] = {
        "task": task,
        "project_id": job_input.get("project_id"),
        "scene_id": job_input.get("scene_id"),
        "trace_id": job_input.get("trace_id"),
    }

    # Face swap is prompt-free; everything else needs a prompt.
    if task == "faceswap":
        if not job_input.get("source_image") or not job_input.get("target_image"):
            raise ValueError("faceswap requires source_image and target_image")
        params["source_image"] = job_input["source_image"]
        params["target_image"] = job_input["target_image"]
        return params

    prompt = job_input.get("prompt")
    if not prompt or not isinstance(prompt, str):
        raise ValueError("Missing required field: prompt (string)")
    if len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError(f"prompt exceeds max length {MAX_PROMPT_LENGTH}")

    negative_prompt = job_input.get("negative_prompt", "") or ""
    if not isinstance(negative_prompt, str):
        raise ValueError("negative_prompt must be a string")
    if len(negative_prompt) > MAX_NEGATIVE_PROMPT_LENGTH:
        raise ValueError(f"negative_prompt exceeds max length {MAX_NEGATIVE_PROMPT_LENGTH}")

    params.update(
        {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "width": _round8(_safe_int(job_input.get("width"), 1024)),
            "height": _round8(_safe_int(job_input.get("height"), 1024)),
            "steps": _safe_int(job_input.get("steps"), 30, MIN_STEPS, MAX_STEPS),
            "guidance_scale": _safe_float(
                job_input.get("guidance_scale"), 7.0, 0.0, 20.0
            ),
            "num_images": _safe_int(job_input.get("num_images"), 1, 1, MAX_IMAGES),
            "seed": (
                None
                if job_input.get("seed") in (None, "")
                else _safe_int(job_input.get("seed"), 0, 0, 2147483647)
            ),
        }
    )

    if task in ("img2img", "inpaint"):
        if not job_input.get("image"):
            raise ValueError(f"{task} requires an 'image' (url, data URI, or path)")
        params["image"] = job_input["image"]
        params["strength"] = _safe_float(job_input.get("strength"), 0.7, 0.0, 1.0)
    if task == "inpaint":
        if not job_input.get("mask"):
            raise ValueError("inpaint requires a 'mask' image")
        params["mask"] = job_input["mask"]

    return params


def _object_key(params: Dict[str, Any], output_id: str, idx: int) -> str:
    project_id = params.get("project_id") or "adhoc"
    ext = "jpg" if IMAGE_FORMAT in ("jpg", "jpeg") else "png"
    return f"images/projects/{project_id}/{params['task']}/{output_id}_{idx}.{ext}"


def handler(job: Dict[str, Any]) -> Dict[str, Any]:
    job_id = job.get("id", "unknown")
    job_input = job.get("input") or {}

    if job_input.get("healthcheck") is True:
        return {
            "status": "ok",
            "worker": "image",
            "model_dir": str(MODEL_DIR),
            "model_dir_exists": MODEL_DIR.exists(),
            "tasks": sorted(ALLOWED_TASKS),
            "storage_configured": _uploader.config.is_configured,
        }

    try:
        params = _validate_input(job_input)
    except ValueError as e:
        log.warning("Job %s validation failed: %s", job_id, e)
        return {"status": "failed", "error_code": "INVALID_INPUT", "error": str(e)}

    # Heavy imports happen here so validation stays GPU-free.
    try:
        from pipelines import DISPATCH
    except Exception as e:  # pragma: no cover - import-time infra failure
        log.exception("Job %s failed importing pipelines", job_id)
        return {"status": "failed", "error_code": "SUBPROCESS_ERROR", "error": str(e)}

    output_id = str(uuid.uuid4())
    started_at = time.time()
    log.info("Job %s running task=%s", job_id, params["task"])

    try:
        images = DISPATCH[params["task"]](params)
    except ValueError as e:
        return {"status": "failed", "error_code": "INVALID_INPUT", "error": str(e)}
    except Exception as e:
        log.exception("Job %s generation failed", job_id)
        return {"status": "failed", "error_code": "GENERATION_FAILED", "error": str(e)}

    if not images:
        return {
            "status": "failed",
            "error_code": "NO_OUTPUT",
            "error": "Pipeline returned no images.",
        }

    elapsed = time.time() - started_at
    fmt = "JPEG" if IMAGE_FORMAT in ("jpg", "jpeg") else "PNG"
    content_type = "image/jpeg" if fmt == "JPEG" else "image/png"

    outputs = []
    local_paths = []
    for idx, img in enumerate(images):
        local = OUTPUT_DIR / f"{output_id}_{idx}.{IMAGE_FORMAT}"
        img.save(local, format=fmt)
        local_paths.append(str(local))

        if _uploader.config.is_configured:
            key = _object_key(params, output_id, idx)
            try:
                info = _uploader.upload(local, key, content_type=content_type)
                outputs.append(
                    {
                        "object_key": info["object_key"],
                        "url": info["url"],
                        "url_type": info["url_type"],
                        "size_bytes": info["size_bytes"],
                    }
                )
                try:
                    local.unlink()
                except OSError:
                    pass
            except Exception as e:
                log.exception("Job %s upload failed", job_id)
                outputs.append({"local_path": str(local), "upload_error": str(e)})

    metadata = {
        "output_id": output_id,
        "task": params["task"],
        "num_images": len(images),
        "seed": params.get("seed"),
        "project_id": params.get("project_id"),
        "scene_id": params.get("scene_id"),
        "trace_id": params.get("trace_id"),
        "elapsed_seconds": round(elapsed, 2),
    }

    response: Dict[str, Any] = {
        "status": "completed",
        "task": params["task"],
        "media_type": content_type,
        "outputs": outputs,
        "metadata": metadata,
    }

    first_with_url = next((o for o in outputs if "url" in o), None)
    if first_with_url:
        response["url"] = first_with_url["url"]
        response["object_key"] = first_with_url["object_key"]
    elif not _uploader.config.is_configured:
        response["local_paths"] = local_paths
        log.warning("Job %s storage not configured — returning local paths", job_id)

    log.info("Job %s completed task=%s in %.1fs", job_id, params["task"], elapsed)
    return response


if __name__ == "__main__":
    log.info("Starting image worker")
    log.info("MODEL_DIR=%s exists=%s", MODEL_DIR, MODEL_DIR.exists())
    log.info("Storage configured: %s", _uploader.config.is_configured)
    runpod.serverless.start({"handler": handler})
