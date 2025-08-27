# Claude Worker - Individual Claude CLI instance
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-cli || true

# Create working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json .

# Install dependencies
RUN npm install

# Copy application files
COPY worker.js .

# Create Claude configuration directory for each account
RUN mkdir -p /app/.claude

# Expose dynamic port based on WORKER_PORT env
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.WORKER_PORT || '4001') + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run worker
CMD ["node", "worker.js"]