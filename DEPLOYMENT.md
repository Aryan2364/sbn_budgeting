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

   This app is new and goes on the migrated server, which is already
   live and serving the other sites. There is nothing to migrate here —
   no old container, no old certificate, no data.

   DNS already resolves `sbn.rgbindia.com` to Cloudflare, and today the
   host returns **HTTP 525** — Cloudflare reaching an origin that has no
   certificate for this name. That is the expected symptom of the site
   block not existing yet.

   525 is worth reading precisely: it means Cloudflare **reached** the
   origin and the TLS handshake failed. An unreachable origin gives 521
   or 522. So DNS is already correct — the name resolves to the server
   that is running Caddy — and the only thing missing is a site block
   for this hostname. No DNS change is needed. It also shows Cloudflare
   is in Full mode, since a Flexible origin would not attempt TLS at
   all, so the certificate Caddy issues on reload is what clears it.

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

One database, one schema per module, plus one schema the modules share
(since migration 0009, 30 Sep 2026; plan `complain/plan-2026-09-30-1500.md`):

| Schema | Holds |
|---|---|
| `budgeting` | projects, sites, site_budgets, cost_heads, expenses, the variance views, and `schema_migrations` |
| `shared` | users, locations, designations, user_module_access, user_locations |
| `complaints` | complaints, complaint_categories, complaint_photos, complaint_events, notifications |

Foreign keys cross schemas freely (`budgeting.sites.manager_id` points at
`shared.users`). The app names every table unqualified, and the
connection's `search_path` is how it finds them:

```
options=-c search_path=budgeting,complaints,shared,public
```

**All three schemas must be on the path.** Without `shared`, `users` is
not found and nobody can sign in.

**`budgeting` stays first.** Migrations 0001–0008 created their tables
unqualified, so they landed in the first schema on the path, and
`migrate.js` creates `schema_migrations` there too. From 0009 on, each
migration places its own tables with `set local search_path = …` at the
top, which lasts only for that migration's transaction. A new migration
**must** do the same:

- a budget table: `set local search_path = budgeting, shared, public;`
- a shared table: `set local search_path = shared, budgeting, public;`
- a complaints table: `set local search_path = complaints, shared, budgeting, public;`
- a new module gets its own schema: `create schema if not exists <module>;`
  followed by `set local search_path = <module>, shared, public;`

The split was rehearsed on 30 Sep 2026 against a copy of the dev database
reshaped like production (tables in `budgeting`, an empty `shared`).
0009 moved `users` and `site_locations` (renamed `locations`) into
`shared` in place: ids, indexes and every foreign key followed, and the
variance views needed no rebuild. Budget reads, variance reports, and a
full complaint (raise with a photo → start → resolve → approve, with
notifications) all passed on it.

**Deploying 0009 for the first time**: change `DATABASE_URL` in
`.env.production` to the new `search_path` **before** running
`./deploy.sh`. The migrate container reads the same file, and the API has
to find `shared.users` from its very first request.

### Complaint photos

Photos are objects, not rows. When the R2 credentials are set in
`.env.production` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`; see `.env.production.example`), the backend
stores them in the Cloudflare R2 bucket **`sadbhavna`**, one folder per
complaint:

```
sadbhavna/                  the bucket
└── complaints/             the module (R2_PREFIX, default "complaints/")
    └── 2026/               year the complaint was raised (India time)
        └── C-000123/       the complaint's reference, as the app shows it
            ├── raised-1.jpg      photos added when it was raised
            ├── raised-2.jpg
            ├── resolved-1.jpg    photos added when it was resolved
            └── resolved-2.png    numbering continues after a send-back
```

The extension is the photo's real type (`jpg`, `png` or `webp`), read
from its bytes, not from the name the phone sent. The database row
carries the same key (`complaint_photos.storage_key`, e.g.
`complaints/2026/C-000123/raised-1.jpg`). The bucket stays private: the
API streams each photo to a signed-in user who may see the complaint
(`Cache-Control: private`). It never hands out a public or presigned URL.

Photos stored before this layout (dev and test data only) keep their old
keys, `complaints/<yyyy>/<mm>/<uuid>.<ext>`, and still open: every photo
is read by the key its row carries. Nothing needs moving.

- **One bucket prefix per database.** References repeat between
  databases (every database has a `C-000001`), so two databases pointed
  at the same bucket and `R2_PREFIX` would overwrite each other's
  photos. A staging or dev copy must use its own bucket or its own
  `R2_PREFIX` (e.g. `staging/complaints/`), never production's.
- **Which store is live**: the backend's startup log prints one line,
  `Complaint photos: Cloudflare R2, bucket "sadbhavna", prefix
  "complaints/"…` or `Complaint photos: local disk at /app/uploads`
  (`docker compose logs backend | grep "Complaint photos"`). Setting some
  but not all three credentials stops the API at startup with a message
  naming the missing one.
- **Confirming R2 works**: raise a complaint with a photo, then look in
  the bucket (Cloudflare dashboard → R2 → `sadbhavna` →
  `complaints/<year>/<reference>/`, e.g. `complaints/2026/C-000123/`)
  for `raised-1.jpg`.
- **Backups**: R2 photos are **not** in RDS, so RDS backups do not cover
  them. R2 stores each object redundantly, which protects against disk
  loss but not against deletion. If you need deletion protection, copy
  the bucket on a schedule (e.g. `rclone sync` to a second bucket or
  provider). Do not add an R2 lifecycle rule that expires objects under
  `complaints/`: the rows would outlive their photos.
- **The `sbn_uploads` volume** (`UPLOAD_DIR`, `/app/uploads`) is now the
  fallback and legacy store. Without R2 credentials, photos are written
  there in the same folder layout (`/app/uploads/complaints/2026/C-000123/raised-1.jpg`).
  With R2 on, it is only read: a photo not found in the
  bucket is served from the volume if the file is there, which covers
  photos raised before R2 was switched on. Otherwise the user sees "That
  photo is no longer available." To move legacy photos into R2, copy the
  volume's `complaints/` tree into the bucket with the same keys (e.g.
  `rclone copy /path/to/volume/complaints r2:sadbhavna/complaints`). The
  database needs no change. Until then, keep backing up the volume
  (`docker run --rm -v sbn_uploads:/d -v "$PWD":/b alpine tar czf
  /b/uploads-$(date +%F).tgz -C /d .`).
- **When R2 is unreachable**: raising or resolving with photos fails
  with "The photos could not be saved. Try again." and writes nothing.
  Viewing a photo fails with "The photo could not be loaded. Try again
  in a moment." Every R2 call has a deadline (5 s to connect, 20 s for a
  response, 30 s overall for an upload or delete), so a hung R2 cannot
  hold a request open.

For a psql shell from the app server:

```bash
psql "host=database-1.cxoqkkq469da.ap-south-1.rds.amazonaws.com port=5432 \
      dbname=sadbhavna_prod user=postgres sslmode=verify-full \
      sslrootcert=./global-bundle.pem"
```

## Resetting to empty, for handover

**Production currently holds TEST data.** Before the client enters
their first real record the database has to be empty, and doing it
afterwards means picking through rows deciding which are real — which
is not a judgement anybody can make reliably a month later.

**This procedure is also the only test of something otherwise never
tested: that a deployment works from nothing.** Every deploy so far has
landed on a database that already had a schema. A new client is exactly
this path.

**It was rehearsed on 14 Sep 2026** against a throwaway
`budgeting_rehearsal` schema on the same instance, and **found three
faults in its own first draft**. Every one of them would have surfaced
on handover day. The commands below are the corrected ones; the faults
are named because each is a trap the next person would otherwise fall
into.

### Two things about this environment that break the obvious commands

**1. `.env.production` cannot be sourced by bash.** `DATABASE_URL`
contains an unquoted `&`, so `set -a; . ./.env.production` silently
leaves it EMPTY — and `psql "$DATABASE_URL"` then quietly tries a local
socket and fails with a message about `/var/run/postgresql` that looks
like a different problem entirely. Read it with `grep` instead:

```bash
DB="$(grep -m1 '^DATABASE_URL=' .env.production | cut -d= -f2-)"
```

**2. The URL's `sslrootcert` is a path INSIDE the container**
(`/app/certs/rds-global-bundle.pem`). Host `psql` cannot see it. The
host has its own copy, so redirect it for host-side commands:

```bash
DBH="$(printf '%s' "$DB" | sed 's#/app/certs/rds-global-bundle.pem#/home/ubuntu/rds-global-bundle.pem#')"
```

Use `$DBH` for anything run with the host's `psql`, and `$DB` for
anything run inside a container. The backend image has **no psql** —
container-side queries go through `node -e` with `pg`.

### What gets destroyed

Everything in the `budgeting`, `shared` and `complaints` schemas:
projects, sites, budgets, expenses, cost heads, `schema_migrations` itself
and the `variance` and `variance_cell` views; every person, location and
designation; and every complaint and notification. **There is no undo.** RDS
automated backups are on with 7-day retention, so a point-in-time
restore is the fallback — confirm the window covers the moment before
you start.

### The steps

On the server, from `/home/ubuntu/budget-tracking`, with `$DB` and
`$DBH` set as above.

**1. Confirm the target.** The one command worth double-checking,
because everything after it is destructive:

```bash
psql "$DBH" -At -c 'select current_database(), current_schema()'
```

Expect `sadbhavna_prod` and `budgeting`.

**2. Set the admin password BEFORE you start.** This is the fault that
would have bitten hardest: **`SEED_ADMIN_PASSWORD` is currently empty in
`.env.production`**, because it was cleared after the first seed — which
step 7 below tells you to do. With it empty the seed prints

```
first admin: skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one)
```

and carries on with exit code 0. **That line is the only warning, it
scrolls past in a deploy log, and the result is an empty system nobody
can sign in to.** Set a value now:

```bash
$EDITOR .env.production      # SEED_ADMIN_PASSWORD=<a real one>
```

**3. Stop the app** so nothing writes while the schema is going:

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml down
```

**4. Drop and recreate the schemas, empty.** Since 0009 the data lives in
three schemas, and all three go together. Dropping only `budgeting` would
leave every person in `shared.users` and every complaint behind, and the
re-run of 0001 would then create a second `users` table that 0009 cannot
move into `shared`. `shared` is recreated empty because it existed before
this app used it. `complaints` is not recreated, because 0010 creates it.
Complaint photos are not in the database: empty the R2 bucket's
`complaints/` prefix (Cloudflare dashboard → R2 → `sadbhavna`), and the
`sbn_uploads` volume (`docker volume rm sbn_uploads` with the app
stopped), or the photos outlive their rows. This is not optional: the
reference numbers restart at `C-000001`, so the first new complaint's
photos would land in the old `C-000001` folder beside the test photos.


```bash
psql "$DBH" -c 'drop schema if exists complaints cascade; drop schema if exists shared cascade; drop schema budgeting cascade; create schema budgeting; create schema shared;'
```

**5. Re-run every migration from nothing:**

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml   run --rm migrate
```

**Expect `5 migration(s) applied`, not "nothing to apply".** If it says
nothing to apply, step 4 did not take and you are about to seed on top
of the old data.

**6. Seed the 19 cost heads and the first admin:**

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml   run --rm seed
```

**Read both lines it prints.** Expect `cost heads: 19 seeded, 19 in
table` **and** `first admin: <email> created`. Anything saying
`skipped` means step 2 was missed.

**7. Start the app:**

```bash
./deploy.sh
```

**8. Change the admin password off the seeded one.** Sign in and change
it in Settings → People. **The seeded password sits in a file on the
server**, so it is a shared secret from the moment it exists. Then blank
`SEED_ADMIN_PASSWORD` in `.env.production` again — and note that doing
so is what makes step 2 necessary next time. The two instructions are a
loop on purpose; the alternative is leaving a usable password on disk.

### Verify, do not assume

```bash
psql "$DBH" -At -c 'select version, applied_at from budgeting.schema_migrations order by version'
psql "$DBH" -At -F'|' -c "select 'cost_heads',count(*) from budgeting.cost_heads
  union all select 'users',count(*) from shared.users
  union all select 'projects',count(*) from budgeting.projects
  union all select 'sites',count(*) from budgeting.sites
  union all select 'expenses',count(*) from budgeting.expenses
  union all select 'site_budgets',count(*) from budgeting.site_budgets"
psql "$DBH" -At -c "select table_name from information_schema.views where table_schema='budgeting' order by 1"
```

**From the rehearsal, this is exactly what a correct fresh install
looks like:**

```
schema_migrations  5
cost_heads        19
users              1        <- role admin, can_login true, password_hash set
projects           0
sites              0
expenses           0
site_budgets       0
views              variance, variance_cell
```

Then load the site. The dashboard should show its "nothing yet" state
offering to create the first project — not an error, and not a row of
zeroes.

### Two things about the current data that a reset removes

Both are **data-entry errors in the test data, not code defects.** The
variance maths was proved exact on 14 Sep — every cell equals
`per_tree_paise` × `planned_trees`, and all four roll-up grains agree to
the paise. Recorded here because someone comparing production against
section 2.1 of the plan will otherwise report them as bugs:

- **`Miscellenous` carries no budget.** Section 2.1 gives it 5 per year.
  That is the entire discrepancy between section 2.1's per-tree total of
  3,432 and production's 3,412 — 5 × 4 = 20 — and why each year column
  reads 613 rather than 618.
- **The per-tree amounts for cost heads 2 to 6 are rotated by one
  position.** Production reads Tree bore 100, Tree cage 450, Nameplate
  50, Sapling 150, Sapling transport 25; section 2.1 says 450, 50, 150,
  25, 100. **The same six values, shifted one place.** Because it is a
  rotation, every total is unchanged — which is precisely why no
  arithmetic check catches it and why it looks like a code fault when
  somebody finally notices a cost head with the wrong rate. It is an
  off-by-one made during entry or import.

Production also has **21 cost heads, not 19** — `Accident expense` and
`Tools and tackles` were added through Settings. A reset returns the
list to the seeded 19, so re-add those two afterwards if the client
still wants them.

## Ports

| Service  | Container | Host   |
|----------|-----------|--------|
| frontend | 3000      | 3400   |
| backend  | 4000      | 4400   |

Caddy is the only thing that should be reachable from outside; 3400 and
4400 stay closed in the security group. Cloudflare proxies the domain,
so the origin only ever needs 80 and 443 open — 80 included, because
that is how Caddy answers the ACME challenge.
| db       | — | RDS `sadbhavna_prod`, schemas `budgeting`, `shared`, `complaints`, ap-south-1 |

## Changing the domain

`NEXT_PUBLIC_API_URL` is baked into the JavaScript the browser downloads,
so a new domain is not a restart — it is a rebuild. Change it in **both**
`.github/workflows/deploy-images.yml` (the `build-args`) and
`docker-compose.deploy.yml` (`CORS_ORIGIN`), push, and redeploy.
