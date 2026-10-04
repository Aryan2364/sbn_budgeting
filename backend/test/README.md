# Backend tests

Test-only code. Nothing in `src/` imports from here, and nothing here
changes how the API behaves in production.

## The database

Every test that needs Postgres reads **`TEST_DATABASE_URL`** and nothing
else. It never reads `DATABASE_URL` or `backend/.env`, and it refuses a
database whose name does not contain `test`.

```bash
export TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/sadbhavna_access_test?options=-c%20search_path%3Dpublic,complaints,shared'
```

The database is created if it is missing. `npm run test:equivalence`
(without `--no-setup`) **drops and recreates it** every run, applies
`migrations/*.sql`, and seeds `test/equivalence/fixtures.ts`. Use a
throwaway local database only.

## Commands

| Command | What it does |
|---|---|
| `npm test` | `node:test` unit tests: the transaction-per-request wrapper, and that every API route has an equivalence case. Skipped when `TEST_DATABASE_URL` is unset. |
| `npm run test:equivalence` | Applies the decision 23 mapping to the fixtures, runs every person x every API route x every sampled record against the real app, and compares with `test/equivalence/baseline.json` (the OLD build's answers, never re-recorded for the switch-over). Every difference must match an intended difference in `equivalence/intended.ts` (plan 6.3.3), and every listed one with a population must appear; counts print per D-number. Since P9 the permission guard decides every route, so D2, D3 and D4 are baseline differences (before P9 they were disagreements in the shadow guard's log). Exit 0 = nothing unplanned. It also reports the statements the query guard (`support/query-guard.ts`) found reading a guarded table with no scope marker. |
| `npm run test:equivalence:record` | Same run, and rewrites `baseline.json`. Only when a change of answers is intended and agreed. |
| `npm run test:equivalence -- --plant` | Self-check: swaps `DELETE /cost-heads/:id`'s `@Can` for `@SignedIn` in memory and proves the comparison catches it. |

Extra flags after `--`: `--only "PATCH /api/expenses/:id"`, `--out run.json`,
`--ignore digest`, `--no-setup` (run against a database as it is, e.g. a
production-shaped restore; the people and records are then sampled from
that data).

## How it works

- `support/test-env.ts` sets the environment before the app loads and
  moves the working directory away from `backend/`, so `.env` (and any R2
  credentials in it) is never read. Photos go to a scratch folder.
- `support/app.ts` boots `AppModule` in-process exactly as `main.ts`
  configures it (and fails if `main.ts` drifts), and discovers every
  route from Nest's metadata.
- `support/test-tx.ts` runs each HTTP request in one transaction, rolled
  back when the response ends. The app's own transactions become
  savepoints. Write cases therefore run for real and leave nothing behind.
- `equivalence/sampling.ts` picks, per person, up to 3 records in each
  relation class (made by them, named on, on their site, on a team site,
  legacy, none); complaints per status as well.
- `equivalence/cases.ts` has one valid request per route (and variants
  for the security fixes). A route with no entry is reported, never skipped.
- `equivalence/legacy-screen-rules.ts` is a frozen copy of today's
  frontend gating (nav, settings sections, home route, gated buttons).
- `support/legacy-route-rules.ts` is a frozen copy of the old route
  guard's rules (`@ModuleAccess` / `@ModuleRole`, deleted at P9), so the
  route tests still prove the permission guard answers as they did,
  apart from D2, D3 and D4.
- `equivalence/baseline.json` is the stored answer sheet, one case per line.
