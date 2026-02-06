# NanoClaw - Official Docker Image
# Optimized for Hugging Face Spaces and containerized environments
# Uses Google Gemini 2.5 API

FROM node:22-slim

# Install system dependencies
# python3, make, g++ are required for building native modules like better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript (Main App)
RUN npm run build

# Build TypeScript (Agent Runner - Gemini version)
RUN cd container/agent-runner && npm install && npm run build

# Create required directories for data persistence
RUN mkdir -p data groups store logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7860
ENV FEISHU_WEBHOOK_PORT=7860

# Expose the port used by Hugging Face Spaces
EXPOSE 7860

# Start the Feishu bot by default
CMD ["npm", "run", "start:feishu"]
