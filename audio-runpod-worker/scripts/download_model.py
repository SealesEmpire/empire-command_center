"""
Preload audio models onto a RunPod Network Volume.

Usage (inside a temp pod with the volume mounted at /runpod-volume):
    python /app/scripts/download_model.py

Env vars (override defaults):
  MUSICGEN_MODEL   default: facebook/musicgen-small
  BARK_MODEL       default: suno/bark-small
  HF_TOKEN         optional, for gated models
"""

import os
import sys
from huggingface_hub import snapshot_download


def main() -> int:
    token = os.getenv("HF_TOKEN") or None
    for repo in [
        os.getenv("MUSICGEN_MODEL", "facebook/musicgen-small"),
        os.getenv("BARK_MODEL", "suno/bark-small"),
    ]:
        print(f"→ Downloading {repo}")
        snapshot_download(repo_id=repo, token=token, max_workers=8)
        print(f"✓ {repo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
