# Sadbhavna budgeting frontend (Next.js).
#
# Two stages, for the same reason the backend has two: the shipped image
# carries no source, no dev dependencies, and no build toolchain — only
# the traced standalone server, the static assets, and public/.
#
# NEXT_PUBLIC_API_URL is compiled INTO the browser bundle at build time —
# setting it at runtime does nothing. That is why it is a build arg here
# and why the GitHub Actions workflow passes the production value.

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Baked into the client bundle. The default keeps a local `docker build`
# usable; CI overrides it with the real origin.
ARG NEXT_PUBLIC_API_URL=http://localhost:4100/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# A modest heap so the build fits a small instance. Raise it only if you
# move to a bigger builder — an oversized value has OOM-frozen a 4GB box.
RUN NODE_OPTIONS=--max-old-space-size=3072 npm run build

# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# next.config.ts sets output: "standalone", so .next/standalone holds
# server.js and only the node_modules files the build traced as reachable.
# The other two directories are NOT included in it and must be copied
# alongside, at exactly these paths, or the app serves 404s for every
# stylesheet, chunk and image while the HTML itself still renders.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# The standalone server binds to HOSTNAME, which defaults to localhost.
# Inside a container that means it is unreachable from the published port
# and compose reports a healthy container serving nothing.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
