# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Family Hub kiosk.
#
# 1. `deps`  — install every dep (incl. dev) with the toolchain
#              needed to compile better-sqlite3's native binding.
# 2. `build` — run the SvelteKit production build, which produces
#              ./build via adapter-node.
# 3. `prod`  — `pnpm prune --prod` removes dev deps from the tree
#              while keeping the already-compiled native module
#              for better-sqlite3, so we don't pay for a second
#              compile here.
# 4. runtime — minimal node:24-alpine image with just the build
#              output, pruned node_modules, drizzle migrations,
#              and a standalone migrate.mjs entrypoint runner.
#              Runs as non-root with tini handling signals.

ARG NODE_VERSION=24-alpine

# ---------- 1. deps -------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
	&& corepack enable
COPY package.json pnpm-lock.yaml ./
# .npmrc is optional — only copy if present so the build doesn't
# fail on repos that don't ship one.
COPY .npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile

# ---------- 2. build ------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---------- 3. prod deps --------------------------------------------
FROM node:${NODE_VERSION} AS prod
WORKDIR /app
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
# Prune dev deps in place — better-sqlite3's compiled .node binary
# stays put. A clean re-install here would force another native
# compile and a second copy of the toolchain.
RUN pnpm prune --prod

# ---------- 4. runtime ----------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0

# tini reaps zombie processes and forwards signals to the node
# process — the entrypoint script uses `exec` so signals reach
# node, but tini covers the case where the script grows extra
# children later (db backups, etc.).
RUN apk add --no-cache tini \
	&& addgroup -S app -g 1001 \
	&& adduser -S app -u 1001 -G app

COPY --from=build --chown=app:app /app/build ./build
COPY --from=prod  --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --chown=app:app docker/migrate.mjs ./migrate.mjs
COPY --chown=app:app docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER app

EXPOSE 3000

# Same shape as the docker-compose healthcheck: /login is a public
# route, so a 2xx response confirms the server is up and responsive
# without exercising any authenticated path.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:${PORT}/login" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["node", "build/index.js"]
