# NanoClaw Agent Container
# Runs Google Gemini 2.5 API in isolated Linux VM

FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace /app

# Create entrypoint script
RUN printf '#!/bin/bash\nset -e\n# Source env from mounted /workspace/env-dir/env if exists\n[ -f /workspace/env-dir/env ] && export $(cat /workspace/env-dir/env | xargs)\n# Run the agent\ncat > /tmp/input.json\nnode /app/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set working directory to group workspace for context
WORKDIR /workspace/group

# Switch to node user
USER node

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
