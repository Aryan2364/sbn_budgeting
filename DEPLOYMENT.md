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

4. Log in to GHCR. The images are private unless you make the packages
   public, so the server needs a classic personal access token with the
   `read:packages` scope:

   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u Aryan2364 --password-stdin
   ```

5. Deploy, then create the 19 cost heads and the first admin:

   ```bash
   ./deploy.sh
   docker compose --env-file .env.production -f docker-compose.deploy.yml \
     run --rm seed
   ```

   The seed creates no admin account unless `SEED_ADMIN_EMAIL` and
   `SEED_ADMIN_PASSWORD` are both set. Blank the password out of the file
   once it has run.

6. Point nginx at the two containers. The frontend must be served at the
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

Postgres runs as a compose service and its data lives in the named
volume `sbn_pgdata`, not in the container. Recreating the container is
safe. `docker compose down -v` is the one command that destroys the
data.

The port is deliberately not published to the host. For a shell:

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml \
  exec db psql -U sadbhavna sadbhavna
```

Backup:

```bash
docker compose --env-file .env.production -f docker-compose.deploy.yml \
  exec -T db pg_dump -U sadbhavna sadbhavna | gzip > sbn-$(date +%F).sql.gz
```

## Ports

| Service  | Container | Host   |
|----------|-----------|--------|
| frontend | 3000      | 3400   |
| backend  | 4000      | 4400   |
| db       | 5432      | *(not published)* |

## Changing the domain

`NEXT_PUBLIC_API_URL` is baked into the JavaScript the browser downloads,
so a new domain is not a restart — it is a rebuild. Change it in **both**
`.github/workflows/deploy-images.yml` (the `build-args`) and
`docker-compose.deploy.yml` (`CORS_ORIGIN`), push, and redeploy.
