# VORTEX Anime streaming backend (the anime-sdk Flutter server).
# Built from source in a first stage, because dist/ is not committed.
FROM node:24-slim AS build
WORKDIR /app
# Full install (tsup/typescript are dev deps) so the SDK can be built.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsup.config.ts ./
COPY src src
RUN npm run build

# Runtime image: production deps only, no toolchain.
FROM node:24-slim
# curl is the SDK's fallback transport for sites that reject Node's fetch.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist dist
COPY examples/flutter-server.mjs examples/flutter-server.mjs
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "examples/flutter-server.mjs"]
