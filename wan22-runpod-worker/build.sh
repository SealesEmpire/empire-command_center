#!/usr/bin/env bash
set -euo pipefail

# Build & push the WAN 2.2 RunPod worker image as linux/amd64 (RunPod GPUs are
# x86_64 — this matters on Apple Silicon).
#
# Usage:
#   ./build.sh                 # tag = git short SHA, also pushes :latest
#   ./build.sh v3              # explicit tag, also pushes :latest
#   PUSH=false ./build.sh      # local build only (no push)
#   IMAGE=ghcr.io/you/name ./build.sh
#
# Auth (one time): log in to your private registry first, e.g. GHCR:
#   echo "$GITHUB_PAT" | docker login ghcr.io -u YOUR_GH_USER --password-stdin
# The PAT (classic) needs the write:packages scope.

cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/sealesempire/wan22-runpod-worker}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
PUSH="${PUSH:-true}"

# Registry image paths must be lowercase.
IMAGE="$(echo "$IMAGE" | tr '[:upper:]' '[:lower:]')"

echo "→ Image: $IMAGE"
echo "→ Tags:  $TAG + latest"
echo "→ Push:  $PUSH"

args=(--platform linux/amd64 -t "$IMAGE:$TAG" -t "$IMAGE:latest")
if [ "$PUSH" = "true" ]; then args+=(--push); else args+=(--load); fi

docker buildx build "${args[@]}" .

echo "✓ Done: $IMAGE:$TAG"
echo "  Use this in the RunPod endpoint's Container Image field: $IMAGE:$TAG"
