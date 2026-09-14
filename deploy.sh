#!/usr/bin/env bash
# Run this ON THE SERVER to deploy the latest images from GHCR.
#   ./deploy.sh
# It pulls the newest images, applies any new migrations, restarts the
# containers, and cleans up old images.
set -euo pipefail

COMPOSE_FILE="docker-compose.deploy.yml"
ENV_FILE=".env.production"

# --env-file is passed to compose itself, not just the containers, so the
# same file works for ${...} substitution and for the container env.
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy .env.production.example and fill it in." >&2
  exit 1
fi

echo "==> Pulling latest images from GHCR..."
compose pull

echo "==> Applying migrations to RDS..."
# Plain SQL, applied in filename order, checksummed. A no-op when the
# schema is already current, so running deploy.sh twice is harmless.
# This fails fast if the VPC/security group does not let this host reach
# RDS, which is better than a backend that starts and 500s on every read.
compose run --rm migrate

echo "==> Starting/restarting containers..."
# --force-recreate: `compose up -d` decides whether to recreate from a
# stored config hash that contains the image REFERENCE (":latest"), not
# the digest it resolves to. So a tag that moved under it does not
# always count as a change — on 14 Sep 2026 the backend tag moved, this
# step printed "Running", and the container carried on with the old
# image. A deploy that reports success and ships nothing is worse than
# one that fails, because the next person debugs the application
# instead of the pipeline.
compose up -d --force-recreate

echo "==> Verifying every container is running the image its tag points at..."
# The check that the step above is honest. It is here, and not in
# somebody's head, because the failure it catches is silent: nothing
# looks wrong, the exit code is zero, and production is on old code.
verify_failed=0
for svc in backend frontend; do
  cid="$(compose ps -q "$svc" || true)"
  if [ -z "$cid" ]; then
    echo "    $svc: NO CONTAINER after up" >&2
    verify_failed=1
    continue
  fi

  # The reference the container was created from, what that reference
  # resolves to NOW, and what the container is actually running. The
  # last two share an ID space, so comparing them is meaningful.
  ref="$(docker inspect --format '{{.Config.Image}}' "$cid")"
  running="$(docker inspect --format '{{.Image}}' "$cid")"

  case "$ref" in
    sha256:*)
      # Pinned by digest: there is no tag that could have moved, so
      # there is nothing to drift. Say so rather than passing silently.
      echo "    $svc: pinned to a digest, nothing to verify"
      continue
      ;;
  esac

  expected="$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null || true)"
  if [ -z "$expected" ]; then
    echo "    $svc: could not resolve $ref locally" >&2
    verify_failed=1
    continue
  fi

  if [ "$expected" = "$running" ]; then
    echo "    $svc: ok (${running#sha256:})"
  else
    echo "    $svc: STALE — $ref points at ${expected#sha256:}" >&2
    echo "             but the container is running ${running#sha256:}" >&2
    verify_failed=1
  fi
done

if [ "$verify_failed" -ne 0 ]; then
  echo >&2
  echo "DEPLOY FAILED: at least one container is not running the image its tag" >&2
  echo "points at. Production may be on old code. Do not treat this as done." >&2
  exit 1
fi

echo "==> Cleaning up old, unused images..."
docker image prune -f

echo "==> Done. Current status:"
compose ps
