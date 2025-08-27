# Orchestrator - Load Balancer and Queue Manager
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json .

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run orchestrator
CMD ["node", "orchestrator.js"]