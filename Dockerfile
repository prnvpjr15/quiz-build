FROM node:24-alpine

WORKDIR /app

# Copied before the source so the dependency layer stays cached across code
# changes — only a manifest change reinstalls.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

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
