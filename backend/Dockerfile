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

COPY --from=build /app/dist ./dist
# src/db/migrate.ts resolves the migrations dir as ../../migrations from
# dist/db, so it must sit next to dist/, not inside it.
COPY migrations ./migrations

EXPOSE 4000

CMD ["node", "dist/main.js"]
