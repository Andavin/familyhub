# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ && corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ && corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
RUN corepack enable

# better-sqlite3 needs its native binary; copy node_modules from build stage
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/lib/server/migrate.ts ./src/lib/server/migrate.ts
COPY --from=build /app/src/lib/server/db.ts ./src/lib/server/db.ts
COPY --from=build /app/src/lib/server/schema.ts ./src/lib/server/schema.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "build/index.js"]
