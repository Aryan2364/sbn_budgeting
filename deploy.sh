#!/usr/bin/env bash
# Run this ON THE SERVER to deploy the latest images from GHCR.
#   ./deploy.sh
# It pulls the newest images, applies any new migrations, restarts the
# containers, and cleans up old images.
set -euo pipefail

COMPOSE_FILE="docker-compose.deploy.yml"
ENV_FILE=".env.production"

# --env-file is passed to compose itself, not just the containers: the
# db service's POSTGRES_* values are ${...} substitutions in the compose
# file, and those are resolved by compose before any container exists.
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy .env.production.example and fill it in." >&2
  exit 1
fi

echo "==> Pulling latest images from GHCR..."
compose pull

echo "==> Starting the database..."
compose up -d db

echo "==> Applying migrations..."
# Plain SQL, applied in filename order, checksummed. A no-op when the
# schema is already current, so running deploy.sh twice is harmless.
compose run --rm migrate

echo "==> Starting/restarting containers..."
compose up -d

echo "==> Cleaning up old, unused images..."
docker image prune -f

echo "==> Done. Current status:"
compose ps
