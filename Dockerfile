# ─────────────────────────────────────────────────────
# Friday AI Runtime — Multi-stage Docker build
#
# Build:   docker build -t friday-runtime .
# Run:     docker run -e ANTHROPIC_API_KEY=sk-... friday-runtime
# ─────────────────────────────────────────────────────

# Stage 1: Install dependencies
FROM node:20-slim AS deps

WORKDIR /app

# Copy package manifests
COPY package.json ./
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/cli/package.json ./packages/cli/

# Install production dependencies only
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || true
RUN cd packages/runtime && npm install --omit=dev --ignore-scripts 2>/dev/null || true

# Stage 2: Runtime image
FROM node:20-slim AS runtime

WORKDIR /app

# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/runtime/node_modules ./packages/runtime/node_modules

# Copy source
COPY packages/runtime/ ./packages/runtime/
COPY packages/cli/ ./packages/cli/

# Create workspace directory
RUN mkdir -p /workspace /root/.friday

# Environment
ENV NODE_ENV=production
ENV FRIDAY_CONFIG_DIR=/root/.friday
ENV FRIDAY_WORKSPACE=/workspace

# The runtime server listens on this port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8787/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Default: start the HTTP/WebSocket server
CMD ["node", "packages/runtime/server.js"]
