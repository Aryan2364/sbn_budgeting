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

7. Point nginx at the two containers. The frontend must be served at the
   domain root and the API at `/api`, because
   `NEXT_PUBLIC_API_URL=https://sbn.rgbindia.com/api` is compiled into
   the browser bundle:

   ```nginx
   server {
     server_name sbn.rgbindia.com;

     location /api/ { proxy_pass http://127.0.0.1:4400/api/; }
     location /     { proxy_pass http://127.0.0.1:3400; }

     proxy_set_header Host              $host;
     proxy_set_header X-Real-IP         $remote_addr;
     proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

   Then `certbot --nginx -d sbn.rgbindia.com`.

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
| db       | — | RDS `sadbhavna_prod`, schema `budgeting`, ap-south-1 |

## Changing the domain

`NEXT_PUBLIC_API_URL` is baked into the JavaScript the browser downloads,
so a new domain is not a restart — it is a rebuild. Change it in **both**
`.github/workflows/deploy-images.yml` (the `build-args`) and
`docker-compose.deploy.yml` (`CORS_ORIGIN`), push, and redeploy.
