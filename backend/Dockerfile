# Sadbhavna budgeting API (NestJS + PostgreSQL).
#
# Two stages so the shipped image carries no TypeScript compiler and no
# dev dependencies — only the compiled dist/, the runtime deps, and the
# plain-SQL migrations.
#
# The migrate and seed scripts live in this same image on purpose: they
# are run against the database by deploy.sh with `docker compose run`,
# so the schema is applied by exactly the code that was built, never by
# a copy of the repo someone happened to have on the box.

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Amazon's RDS CA bundle. RDS requires TLS and src/db/pool.ts passes no ssl
# options of its own, so the trust chain has to arrive through DATABASE_URL:
#   ...?sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem
# Fetched at build time so a CA rotation is picked up by the next build.
RUN apk add --no-cache ca-certificates \
 && mkdir -p /app/certs \
 && wget -qO /app/certs/rds-global-bundle.pem \
      https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && grep -q "BEGIN CERTIFICATE" /app/certs/rds-global-bundle.pem

COPY --from=build /app/dist ./dist
# src/db/migrate.ts resolves the migrations dir as ../../migrations from
# dist/db, so it must sit next to dist/, not inside it.
COPY migrations ./migrations

EXPOSE 4000

CMD ["node", "dist/main.js"]
