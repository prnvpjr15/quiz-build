# --- Stage 1: build the React frontend -------------------------------------
# Runs in its own stage so Vite, Tailwind, and the client's dev dependencies
# never reach the runtime image. Only the compiled bundle is carried forward.
FROM node:24-alpine AS client

WORKDIR /app/client

# Manifest first so the dependency layer is cached independently of source.
COPY client/package*.json ./
RUN npm ci

COPY client/ ./

# vite.config.js writes to ../public, which resolves to /app/public here —
# the same layout as the repository.
RUN npm run build

# --- Stage 2: runtime ------------------------------------------------------
FROM node:24-alpine

WORKDIR /app

# Copied before the source so the dependency layer stays cached across code
# changes — only a manifest change reinstalls.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# The frontend is a build artefact, not source: it is produced above rather
# than committed, so the image can never ship a stale checked-in bundle.
COPY --from=client /app/public ./public

# SQLite file lives here. Created ahead of the USER switch so the unprivileged
# runtime user can write to it; mount a volume here to survive redeploys.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV DB_PATH=/app/data/quizzes.db
EXPOSE 3000

# Drop from root to the unprivileged user the base image already provides.
USER node

CMD ["node", "src/index.js"]
