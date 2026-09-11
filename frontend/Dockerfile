# Sadbhavna budgeting frontend (Next.js).
#
# NEXT_PUBLIC_API_URL is compiled INTO the browser bundle at build time —
# setting it at runtime does nothing. That is why it is a build arg here
# and why the GitHub Actions workflow passes the production value.
FROM node:20-alpine
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

EXPOSE 3000

CMD ["npm", "start"]
