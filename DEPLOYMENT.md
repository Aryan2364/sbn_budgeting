# Deployment

Nothing is built on the server. GitHub Actions builds both images and
pushes them to GHCR; the server only pulls and restarts. That is the
whole idea — a 2GB box cannot run `next build`, and a deploy that builds
is a deploy that can fail halfway.

```
push to main ──▶ Actions: build & push ──▶ ghcr.io/aryan2364/sbn-backend:latest
                                       └▶ ghcr.io/aryan2364/sbn-frontend:latest
                                                        │
                                   server: ./deploy.sh ─┘  (pull → migrate → up -d)
                                                        │
                                         Amazon RDS ◀───┘  (private, same VPC)
```

## One-time server setup

1. Install Docker with the compose plugin.

2. Create a deploy directory and copy three files into it from this repo:

   ```
   docker-compose.deploy.yml
   deploy.sh
   .env.production.example
   ```

3. Fill in the environment:

   ```bash
   cp .env.production.example .env.production
   $EDITOR .env.production        # DB password, JWT_SECRET, first admin
   chmod 600 .env.production
   ```

4. Confirm this host can reach RDS. The endpoint resolves to a **private**
   VPC address (`172.31.48.74`), so it is only reachable from inside the
   VPC — the app server must sit in the same VPC and its security group
   must be allowed inbound on 5432 by the RDS security group.

   ```bash
   psql "host=database-1.cxoqkkq469da.ap-south-1.rds.amazonaws.com          port=5432 dbname=postgres user=postgres          sslmode=verify-full sslrootcert=./global-bundle.pem"
   ```

   The database `sadbhavna_prod` and the schemas `budgeting` and `shared`
   already exist. The app's tables go in **`budgeting`** — the migrations
   create everything unqualified, and the `options=-c search_path=...`
   parameter in `DATABASE_URL` decides where unqualified means. Verified:
   all 7 tables, both views, and `schema_migrations` land in `budgeting`
   and `public` is left untouched.

   The *tables* are not created here. `deploy.sh` applies the migrations.

5. Log in to GHCR. The images are private unless you make the packages
   public, so the server needs a classic personal access token with the
   `read:packages` scope:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u Aryan2364 --password-stdin
   ```

6. Deploy, then create the 19 cost heads and the first admin:

   ```bash
   ./deploy.sh
   docker compose --env-file .env.production -f docker-compose.deploy.yml \
     run --rm seed
   ```

   The seed creates no admin account unless `SEED_ADMIN_EMAIL` and
   `SEED_ADMIN_PASSWORD` are both set. Blank the password out of the file
   once it has run.

7. Put the domain in front of the two containers with Caddy. Caddy is
   already running on this box (it serves `v2e.rgbindia.com`), so this
   is a new site block, not a new install — copy `Caddyfile.sbn` from
   this repo into the server's Caddyfile, then:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   Caddy obtains the certificate itself on the first request. There is
   no certbot step.

   Two things the block gets right that are easy to get wrong:

   - `/api/*` is forwarded **without** stripping the prefix. NestJS sets
     a global prefix of `api` (`backend/src/main.ts`), so the real route
     is `/api/auth/login`. `handle_path` or `uri strip_prefix` would
     remove it and 404 every API call.
   - The named matcher comes before the catch-all `reverse_proxy`,
     matching the shape of the existing v2e block, which routes
     `/socket.io/*` the same way.

   Note this differs from v2e deliberately. v2e's frontend rewrites
   `/api` itself through a baked-in `BACKEND_URL`, so its Caddy block
   needs no API route. This frontend calls `https://sbn.rgbindia.com/api`
   straight from the browser, so Caddy has to do the routing.

   Ports follow the convention already in that file — frontend `3X00`,
   backend `4X00`. hcrm holds 30xx, life/lbd 31xx and 41xx, gbd-webinar
   32xx, v2e 33xx and 43xx; sbn takes **3400** and **4400**, which are
   free.

   This app is new: `sbn.rgbindia.com` never ran on the old server (the
   archived Caddyfile has nine sites and none of them is this one), so it
   goes on the **new** box as part of the 2026-09-11 migration. There is
   nothing here to migrate — no old container, no old certificate, no
   database to carry over beyond the empty schemas already created on
   RDS. Add the block to the new server's Caddyfile from the start
   rather than appending it later.

   DNS already resolves `sbn.rgbindia.com` to Cloudflare, and today the
   host returns **HTTP 525** — Cloudflare reaching an origin that has no
   certificate for this name. That is the expected symptom of the site
   block not existing yet, and it also tells us Cloudflare's SSL mode is
   already Full (a Flexible origin would not attempt TLS at all), so the
   certificate Caddy provisions is what clears it.

   **Check where that record points before reloading Caddy.** A DNS
   record exists, but the Cloudflare dashboard is the only place that
   says which origin IP is behind it. If it still points at the old
   server, adding the block to the new one changes nothing and the 525
   persists — the record has to be repointed at the new box, at which
   point Caddy issues the certificate within about a minute.

## Every deploy after that

```bash
./deploy.sh
```

It pulls the new images, applies any new migrations, restarts the
containers, and prunes the old images. Running it twice is harmless —
migrations are checksummed and a second run is a no-op.

## The database

Amazon RDS, `database-1.cxoqkkq469da.ap-south-1.rds.amazonaws.com`, in
ap-south-1. Nothing about the database lives in Docker — no container,
no volume. Backups and point-in-time recovery are RDS's job; check that
a retention window is actually set on the instance.

**TLS is not optional and the trust chain travels in the URL.**
`backend/src/db/pool.ts` builds its pool from `DATABASE_URL` alone and
passes no `ssl` option, so the mode and CA path are query parameters:

```
?sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem
```

`pg-connection-string` reads that file at connect time. The backend
image bakes Amazon's global bundle at exactly that path (see
`backend/Dockerfile`), so nothing needs mounting. `verify-full` also
checks the hostname, so `DATABASE_URL` must name the RDS endpoint as
AWS spells it — an IP or a CNAME of your own will fail the handshake.

### Schemas

The database is shared, so this app keeps to one schema. Every migration
creates its objects unqualified and `search_path` decides where that is:

```
options=-c search_path=budgeting,shared,public
```

`budgeting` is first, so that is where tables are created — including
`schema_migrations`, the checksum ledger `migrate.js` maintains, and
`users`. `shared` and `public` are on the path for reading only; nothing
here writes to them.

`shared` is scaffolding for a later cross-app table and is deliberately
empty. It is not a home for anything this app owns — `users` stays in
`budgeting` with the rest of the schema. Reordering that list would scatter the schema across two places
on the next migration, and the damage would not be visible until
something queried the wrong one.

For a psql shell from the app server:

```bash
psql "host=database-1.cxoqkkq469da.ap-south-1.rds.amazonaws.com port=5432 \
      dbname=sadbhavna_prod user=postgres sslmode=verify-full \
      sslrootcert=./global-bundle.pem"
```

## Ports

| Service  | Container | Host   |
|----------|-----------|--------|
| frontend | 3000      | 3400   |
| backend  | 4000      | 4400   |

Caddy is the only thing that should be reachable from outside; 3400 and
4400 stay closed in the security group. Cloudflare proxies the domain,
so the origin only ever needs 80 and 443 open — 80 included, because
that is how Caddy answers the ACME challenge.
| db       | — | RDS `sadbhavna_prod`, schema `budgeting`, ap-south-1 |

## Changing the domain

`NEXT_PUBLIC_API_URL` is baked into the JavaScript the browser downloads,
so a new domain is not a restart — it is a rebuild. Change it in **both**
`.github/workflows/deploy-images.yml` (the `build-args`) and
`docker-compose.deploy.yml` (`CORS_ORIGIN`), push, and redeploy.
