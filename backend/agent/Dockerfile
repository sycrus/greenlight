# Build context: monorepo root (set in docker-compose.yml)

FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# ── Install deps ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/agent/package.json ./backend/agent/
RUN pnpm install --frozen-lockfile --filter @gen-ux/agent

# ── Build + deploy ────────────────────────────────────────────────────────────
FROM base AS build
# Workspace root files (needed by pnpm deploy)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/agent/node_modules ./backend/agent/node_modules
# Source
COPY tsconfig.base.json ./
COPY backend/agent ./backend/agent
# Compile TypeScript
WORKDIR /app/backend/agent
RUN pnpm build
# Create a standalone node_modules (no symlinks) for the runner image
WORKDIR /app
RUN pnpm --filter @gen-ux/agent deploy --prod /standalone

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Standalone node_modules from pnpm deploy (no symlinks, no dev deps)
COPY --from=build /standalone/node_modules ./node_modules
# Compiled JS
COPY --from=build /app/backend/agent/dist ./dist
EXPOSE 8000
CMD ["node", "dist/server.js"]
