# Tamam · تمام: production image.
#   docker compose up -d        (see docker-compose.yml)
# Data (the SQLite database) and uploads live in volumes at /app/data and /app/storage.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts* ./
RUN npm ci --no-audit --no-fund
COPY . .
# Build against an empty, migrated database (pages that read settings at build time need the tables), then drop it.
RUN mkdir -p data storage && npx prisma generate && DATABASE_URL=file:./data/build.db npx prisma migrate deploy \
    && DATABASE_URL=file:./data/build.db APP_SECRET=build-time-only-secret-not-used-at-runtime npm run build \
    && rm -rf data/build.db* .next/cache

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:./data/tamam.db \
    STORAGE_DIR=./storage \
    CHROMIUM_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1
# Chromium makes the PDFs; the Noto fonts give it Arabic letter shapes.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-ui-core fonts-noto-color-emoji ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN mkdir -p /app/data /app/storage && chmod +x /app/docker/entrypoint.sh
VOLUME ["/app/data", "/app/storage"]
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
