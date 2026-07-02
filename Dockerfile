# --- API: Fastify + better-sqlite3 ---
FROM node:22-bookworm-slim AS api
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --omit=dev
COPY server/src server/src
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server/src/index.js"]

# --- Сборка клиента ---
FROM node:22-bookworm-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
RUN npm ci -w client
COPY client client
RUN npm run build -w client

# --- Web: Caddy (HTTPS + статика + прокси /api) ---
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=client-build /app/client/dist /srv
