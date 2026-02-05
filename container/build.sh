#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

# Detect which container runtime to use
if which docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    RUNTIME="docker"
    RUN_CMD="docker build"
    TEST_CMD="docker run -i"
elif which container >/dev/null 2>&1; then
    RUNTIME="container"
    RUN_CMD="container build"
    TEST_CMD="container run -i"
else
    echo "Error: No container runtime found!"
    echo "Please install either Docker or Apple Container"
    exit 1
fi

echo "Using runtime: ${RUNTIME}"

# Build
${RUN_CMD} -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Test with:"
echo "  echo '{\"prompt\":\"What is 2+2?\",\"groupFolder\":\"test\",\"chatJid\":\"test@g.us\",\"isMain\":false}' | ${TEST_CMD} ${IMAGE_NAME}:${TAG}"
