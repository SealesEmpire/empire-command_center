"""
Preload the image model(s) onto a RunPod Network Volume.

Usage (inside a temp pod with the volume mounted at /runpod-volume):
    python /app/scripts/download_model.py

Env vars (override defaults):
  IMAGE_MODEL_ID   default: stabilityai/stable-diffusion-xl-base-1.0
  MODEL_DIR        default: /runpod-volume/models/sdxl
  HF_TOKEN         optional, for gated models
  WITH_FACESWAP    "1" to also fetch InsightFace buffalo_l + inswapper model
"""

import os
import sys
from huggingface_hub import snapshot_download


def main() -> int:
    repo_id = os.getenv("IMAGE_MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0")
    local_dir = os.getenv("MODEL_DIR", "/runpod-volume/models/sdxl")
    token = os.getenv("HF_TOKEN") or None

    print(f"→ Downloading {repo_id}")
    print(f"→ Destination: {local_dir}")
    os.makedirs(local_dir, exist_ok=True)
    path = snapshot_download(
        repo_id=repo_id,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
        token=token,
        max_workers=8,
    )
    print(f"✓ Downloaded {repo_id} to {path}")

    if os.getenv("WITH_FACESWAP") == "1":
        print("→ Fetching InsightFace models for faceswap")
        try:
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(name="buffalo_l")
            app.prepare(ctx_id=-1, det_size=(640, 640))
            print(
                "✓ buffalo_l ready. Place inswapper_128.onnx at "
                "/runpod-volume/models/insightface/inswapper_128.onnx"
            )
        except Exception as e:
            print(f"! InsightFace preload skipped: {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
