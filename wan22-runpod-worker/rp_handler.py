"""
RunPod Serverless handler for WAN 2.2 video generation.

Flow:
  1. Validate input
  2. Run WAN 2.2 generate.py as subprocess
  3. Stream progress back to RunPod
  4. Upload result to S3-compatible storage (R2 recommended)
  5. Return URL + metadata

Environment variables (set on RunPod endpoint):
  Required:
    MODEL_DIR           — path to model weights on network volume
    OUTPUT_DIR          — path for temporary generation outputs
    WAN_REPO_DIR        — path to cloned Wan2.2 repo (inside container)
  Optional (storage — strongly recommended for production):
    S3_ENDPOINT_URL
    S3_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY
    S3_BUCKET
    S3_REGION           — default "auto"
    S3_PUBLIC_BASE_URL  — if set, returns public URL instead of signed
    S3_SIGNED_URL_TTL   — seconds, default 604800 (7 days)
  Optional (generation defaults):
    WAN_TASK            — default "ti2v-5B"
    WAN_SIZE            — default "1280*704"
    WAN_TIMEOUT_SECONDS — default 1800
"""

import json
import logging
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

import runpod

from storage import StorageUploader

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("wan22-worker")

# ── Config ─────────────────────────────────────────────────────────────────
WAN_REPO_DIR = Path(os.getenv("WAN_REPO_DIR", "/app/Wan2.2"))
MODEL_DIR = Path(os.getenv("MODEL_DIR", "/runpod-volume/models/Wan2.2-TI2V-5B"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/runpod-volume/outputs"))

DEFAULT_TASK = os.getenv("WAN_TASK", "ti2v-5B")
DEFAULT_SIZE = os.getenv("WAN_SIZE", "1280*704")
DEFAULT_TIMEOUT_SECONDS = int(os.getenv("WAN_TIMEOUT_SECONDS", "1800"))

# Validation limits — prevents accidental burn of GPU credits
MAX_PROMPT_LENGTH = 4000
MAX_NEGATIVE_PROMPT_LENGTH = 2000
MIN_STEPS = 1
MAX_STEPS = 100
ALLOWED_SIZES = {"1280*704", "704*1280", "960*960", "832*480", "480*832"}
ALLOWED_TASKS = {"ti2v-5B", "t2v-A14B", "i2v-A14B"}

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Initialize storage uploader once (lazy-connects on first use)
_uploader = StorageUploader()


# ── Helpers ────────────────────────────────────────────────────────────────
def _safe_int(
    value: Any, default: int, minimum: Optional[int] = None, maximum: Optional[int] = None
) -> int:
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
    """Validate and normalize input. Raises ValueError on bad input."""
    prompt = job_input.get("prompt")
    if not prompt or not isinstance(prompt, str):
        raise ValueError("Missing required field: prompt (string)")
    if len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError(f"prompt exceeds max length {MAX_PROMPT_LENGTH}")

    negative_prompt = job_input.get("negative_prompt", "")
    if negative_prompt and not isinstance(negative_prompt, str):
        raise ValueError("negative_prompt must be a string")
    if len(negative_prompt) > MAX_NEGATIVE_PROMPT_LENGTH:
        raise ValueError(f"negative_prompt exceeds max length {MAX_NEGATIVE_PROMPT_LENGTH}")

    task = str(job_input.get("task", DEFAULT_TASK))
    if task not in ALLOWED_TASKS:
        raise ValueError(f"task must be one of {sorted(ALLOWED_TASKS)}")

    size = str(job_input.get("size", DEFAULT_SIZE))
    if size not in ALLOWED_SIZES:
        raise ValueError(f"size must be one of {sorted(ALLOWED_SIZES)}")

    sample_steps = _safe_int(
        job_input.get("sample_steps"), 30, minimum=MIN_STEPS, maximum=MAX_STEPS
    )

    seed_val = job_input.get("seed")
    if seed_val is None:
        seed = int(time.time() * 1000) % 2147483647
    else:
        seed = _safe_int(seed_val, 0, minimum=0, maximum=2147483647)

    return {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "task": task,
        "size": size,
        "sample_steps": sample_steps,
        "seed": seed,
        "sample_shift": job_input.get("sample_shift"),
        "sample_guide_scale": job_input.get("sample_guide_scale"),
        "image": job_input.get("image"),
        "offload_model": bool(job_input.get("offload_model", True)),
        # Optional caller-supplied identifiers — useful for tracing
        "project_id": job_input.get("project_id"),
        "scene_id": job_input.get("scene_id"),
    }


def _build_command(params: Dict[str, Any], output_path: Path) -> list:
    cmd = [
        "python",
        "generate.py",
        "--task", params["task"],
        "--size", params["size"],
        "--ckpt_dir", str(MODEL_DIR),
        "--prompt", params["prompt"],
        "--save_file", str(output_path),
        "--sample_steps", str(params["sample_steps"]),
        "--base_seed", str(params["seed"]),
        "--offload_model", "True" if params["offload_model"] else "False",
        "--convert_model_dtype",
        "--t5_cpu",
    ]
    if params["negative_prompt"]:
        cmd.extend(["--negative_prompt", params["negative_prompt"]])
    if params["sample_shift"] is not None:
        cmd.extend(["--sample_shift", str(params["sample_shift"])])
    if params["sample_guide_scale"] is not None:
        cmd.extend(["--sample_guide_scale", str(params["sample_guide_scale"])])
    if params["image"]:
        cmd.extend(["--image", str(params["image"])])
    return cmd


def _make_object_key(params: Dict[str, Any], output_id: str) -> str:
    """Build a sensible storage path. Honors project_id/scene_id if provided."""
    project_id = params.get("project_id") or "adhoc"
    scene_id = params.get("scene_id")
    if scene_id:
        return f"projects/{project_id}/scenes/{scene_id}/attempts/{output_id}.mp4"
    return f"projects/{project_id}/clips/{output_id}.mp4"


# ── Handler ────────────────────────────────────────────────────────────────
def handler(job: Dict[str, Any]) -> Dict[str, Any]:
    job_id = job.get("id", "unknown")
    job_input = job.get("input") or {}

    # Health check shortcut — no GPU work
    if job_input.get("healthcheck") is True:
        return {
            "status": "ok",
            "model_dir_exists": MODEL_DIR.exists(),
            "model_dir": str(MODEL_DIR),
            "wan_repo_exists": WAN_REPO_DIR.exists(),
            "storage_configured": _uploader.config.is_configured,
        }

    log.info("Job %s starting", job_id)

    if not MODEL_DIR.exists():
        return {
            "status": "failed",
            "error_code": "MODEL_NOT_FOUND",
            "error": f"Model directory does not exist: {MODEL_DIR}",
            "fix": "Attach a RunPod Network Volume and preload Wan2.2 model weights.",
        }

    # Validate input
    try:
        params = _validate_input(job_input)
    except ValueError as e:
        log.warning("Job %s validation failed: %s", job_id, e)
        return {"status": "failed", "error_code": "INVALID_INPUT", "error": str(e)}

    output_id = str(uuid.uuid4())
    output_path = OUTPUT_DIR / f"{output_id}.mp4"
    timeout_seconds = _safe_int(
        job_input.get("timeout_seconds"), DEFAULT_TIMEOUT_SECONDS, minimum=60, maximum=7200
    )

    cmd = _build_command(params, output_path)
    log.info("Job %s running WAN generate (timeout=%ds)", job_id, timeout_seconds)

    started_at = time.time()
    try:
        result = subprocess.run(
            cmd,
            cwd=str(WAN_REPO_DIR),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        log.error("Job %s timed out after %ds", job_id, timeout_seconds)
        return {
            "status": "failed",
            "error_code": "TIMEOUT",
            "error": f"WAN generation timed out after {timeout_seconds}s",
            "timeout_seconds": timeout_seconds,
        }
    except Exception as e:
        log.exception("Job %s subprocess crashed", job_id)
        return {"status": "failed", "error_code": "SUBPROCESS_ERROR", "error": str(e)}

    elapsed = time.time() - started_at

    if result.returncode != 0:
        log.error("Job %s WAN exited with code %s", job_id, result.returncode)
        return {
            "status": "failed",
            "error_code": "GENERATION_FAILED",
            "error": "WAN generation process exited non-zero.",
            "returncode": result.returncode,
            "stderr_tail": result.stderr[-6000:],
            "stdout_tail": result.stdout[-3000:],
            "elapsed_seconds": elapsed,
        }

    if not output_path.exists():
        log.error("Job %s no output file at %s", job_id, output_path)
        return {
            "status": "failed",
            "error_code": "NO_OUTPUT",
            "error": "WAN reported success but output file is missing.",
            "expected_output_path": str(output_path),
            "stdout_tail": result.stdout[-3000:],
        }

    # Upload to storage if configured
    upload_info = None
    if _uploader.config.is_configured:
        object_key = _make_object_key(params, output_id)
        try:
            upload_info = _uploader.upload(output_path, object_key)
            log.info("Job %s uploaded to %s", job_id, object_key)
            # Free local space — we have it in storage now
            try:
                output_path.unlink()
            except OSError:
                pass
        except Exception as e:
            log.exception("Job %s upload failed", job_id)
            # Don't fail the whole job — return local path as fallback
            upload_info = {"error": str(e)}
    else:
        log.warning("Job %s storage not configured — returning local path only", job_id)

    metadata = {
        "output_id": output_id,
        "task": params["task"],
        "size": params["size"],
        "sample_steps": params["sample_steps"],
        "seed": params["seed"],
        "project_id": params.get("project_id"),
        "scene_id": params.get("scene_id"),
        "elapsed_seconds": round(elapsed, 2),
    }

    response = {
        "status": "completed",
        "output_id": output_id,
        "metadata": metadata,
    }

    if upload_info and "error" not in upload_info:
        response["video_url"] = upload_info["url"]
        response["url_type"] = upload_info["url_type"]
        response["object_key"] = upload_info["object_key"]
        response["size_bytes"] = upload_info["size_bytes"]
    else:
        response["local_path"] = str(output_path)
        if upload_info:
            response["upload_error"] = upload_info["error"]

    log.info("Job %s completed in %.1fs", job_id, elapsed)
    return response


# ── Entrypoint ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("Starting WAN 2.2 RunPod worker")
    log.info("MODEL_DIR=%s exists=%s", MODEL_DIR, MODEL_DIR.exists())
    log.info("WAN_REPO_DIR=%s exists=%s", WAN_REPO_DIR, WAN_REPO_DIR.exists())
    log.info("Storage configured: %s", _uploader.config.is_configured)
    runpod.serverless.start({"handler": handler})
