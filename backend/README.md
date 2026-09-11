# Sadbhavna tracking — API

NestJS + PostgreSQL. The frontend is a separate repository,
`D:/RGB_Software/Sadbhavna/tracking`. They meet over HTTP; neither
imports from the other.

**Read `tracking/AGENTS.md` and `tracking/plan.md` before changing
anything here.** The plan is the specification; this is Phase 3 of it.

## The two rules that shape everything

**Money is bigint paise, end to end.** In the database, in this service,
and in JSON. `pg` hands `bigint` back as a *string* and `src/db/pool.ts`
sets that parser explicitly rather than relying on the default, so
nobody turns it off from a config file by accident. Nothing in this
service adds two amounts together.

**All budget and variance arithmetic happens in SQL.** There is one
definition of it — `migrations/0002_variance.sql` — and every screen
reads that one view at a different grain. Two definitions would let the
site totals and the head rows drift apart, and the drift is invisible
until somebody adds up a column by hand.

## Running it

```bash
cp .env.example .env      # then fill in DATABASE_URL and JWT_SECRET
npm install
npm run migrate           # plain SQL, applied in order, checksummed
npm run seed              # the 19 cost heads, and optionally a first admin
npm run build && npm start
```

`npm run seed` creates the first admin only when `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are set. There is deliberately no default account.

`npm run seed:demo` loads `Sadbhvana Budget Tracker.xlsx` — the full
19 × 5 budget grid and all 19 expenses — as a verification fixture. It
is how the variance definition is checked against numbers a person
already added up in Excel. **Development databases only.**

## Migrations

Plain `.sql` files in `migrations/`, applied in filename order, each in
its own transaction, each recorded with a checksum.

**Editing a migration that has already run is refused.** It would leave
every other database on the old version while the file says otherwise,
and the failure surfaces months later as a column that exists on one
machine. Write a new migration.

## Endpoints

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | any signed-in user |
| GET | `/api/cost-heads` | any signed-in user |
| GET | `/api/users` | admin |
| GET | `/api/reports/variance/periods` | any signed-in user |
| GET | `/api/reports/variance` | any signed-in user |
| GET | `/api/reports/variance/sites/:siteId` | any signed-in user |

Authentication is **on by default**. A route opts out with `@Public()`,
never the other way round, so an endpoint nobody remembered to guard is
guarded.

Two roles, `admin` and `staff`. Admin sees Settings and can delete;
staff does not and cannot. `RolesGuard` is the real check — AGENTS.md
§26 is clear that hiding a button is appearance, not security.

A person with `can_login = false` cannot authenticate even with a
password hash on the row. That is checked in the service and backed by a
table constraint.

## The list convention

`src/common/list-query.ts`, written once and used by every list
endpoint. Pagination at 25 by default, sort and filter from declared
whitelists, and search over **every meaningful text field**.

When a row matched on something other than its title, it comes back
carrying `matchedField` and `matchedValue`, so the list can render
`Rishabh Mehta — Delivery` rather than a row that looks arbitrary.

An undeclared sort column and an unknown filter key are both `400`. A
typo'd sort never silently falls back to the default.

## Verifying the variance definition

After `npm run seed:demo`, these must hold. They are the spreadsheet's
own numbers.

| | Expected |
|---|---|
| Morbi budget, 5,000 trees | `1716000000` paise = ₹1,71,60,000 |
| Morbi actual | `11913300` paise = ₹1,19,133 |
| Rajkot actual | `3002900` paise = ₹30,029 |
| Head rows | sum exactly to the site row, both grains |
| Rajkot Irrigation | `budgetPaise: null`, actual `317800` |
