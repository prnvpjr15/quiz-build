FROM node:24-alpine

WORKDIR /app

# Copied before the source so the dependency layer stays cached across code
# changes — only a manifest change reinstalls.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

# Drop from root to the unprivileged user the base image already provides.
USER node

CMD ["node", "src/index.js"]
