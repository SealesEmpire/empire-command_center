#!/usr/bin/env bash
set -euo pipefail

# Build & push the image worker (bot #2) as linux/amd64.
# See ../wan22-runpod-worker/build.sh for the auth notes — identical flow.

cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/sealesempire/image-runpod-worker}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
PUSH="${PUSH:-true}"
IMAGE="$(echo "$IMAGE" | tr '[:upper:]' '[:lower:]')"

echo "→ Image: $IMAGE"
echo "→ Tags:  $TAG + latest"
echo "→ Push:  $PUSH"

args=(--platform linux/amd64 -t "$IMAGE:$TAG" -t "$IMAGE:latest")
if [ "$PUSH" = "true" ]; then args+=(--push); else args+=(--load); fi

docker buildx build "${args[@]}" .
echo "✓ Done: $IMAGE:$TAG"
