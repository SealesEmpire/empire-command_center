"""
One-time script to preload WAN 2.2 model weights onto a RunPod Network Volume.

Usage:
  Attach your Network Volume to a temporary RunPod pod (any GPU/CPU pod is fine),
  then from inside that pod:

    python /app/scripts/download_model.py

Env vars (override defaults):
  WAN_HF_REPO_ID   default: Wan-AI/Wan2.2-TI2V-5B
  MODEL_DIR        default: /runpod-volume/models/Wan2.2-TI2V-5B
  HF_TOKEN         optional, only if the model is gated
"""

import os
import sys
from huggingface_hub import snapshot_download


def main() -> int:
    repo_id = os.getenv("WAN_HF_REPO_ID", "Wan-AI/Wan2.2-TI2V-5B")
    local_dir = os.getenv("MODEL_DIR", "/runpod-volume/models/Wan2.2-TI2V-5B")
    token = os.getenv("HF_TOKEN") or None

    print(f"→ Downloading {repo_id}")
    print(f"→ Destination: {local_dir}")

    os.makedirs(local_dir, exist_ok=True)

    path = snapshot_download(
        repo_id=repo_id,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
        token=token,
        # Resume on partial downloads, parallelize for speed
        max_workers=8,
    )

    print(f"✓ Downloaded {repo_id} to {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
