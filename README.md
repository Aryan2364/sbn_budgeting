# Sadbhavna — budget & expense tracking

Site-wise budgets against actual expenses, with variance computed in SQL
so there is exactly one definition of it. Money is bigint paise end to
end — in the database, in JSON, and in the browser. Nothing adds two
amounts together in JavaScript.

## Layout

```
backend/    NestJS + PostgreSQL API. Plain SQL migrations.
frontend/   Next.js app. Talks to the API over HTTP; imports nothing from it.
AGENTS.md   The design and build rules. Read this before changing anything.
plan.md     The specification.
```

## Running it locally

```bash
# backend
cd backend
cp .env.example .env        # DATABASE_URL, JWT_SECRET
npm install
npm run migrate
npm run seed
npm run start:dev           # http://localhost:4000/api

# frontend
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

The frontend reads `NEXT_PUBLIC_API_URL` and falls back to
`http://localhost:4100/api`, so set it to match the port the API is
actually on.

## Deploying

Push to `main`. GitHub Actions builds both images and pushes them to
GHCR; the server runs `./deploy.sh`. See [DEPLOYMENT.md](DEPLOYMENT.md).
