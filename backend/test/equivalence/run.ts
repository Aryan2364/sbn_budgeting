/**
 * Access baseline harness (access plan P0).
 *
 *   npm run test:equivalence             run the matrix, compare with baseline.json
 *   npm run test:equivalence:record      run the matrix, (re)write baseline.json
 *   npm run test:equivalence -- --plant  self-check: weaken one route's declaration in
 *                                        memory and prove the comparison catches it
 *
 * Other flags:  --only "<METHOD /api/path>"   restrict to matching routes
 *               --no-setup                    use the database as it is (e.g. a
 *                                             restore) instead of rebuilding fixtures
 *               --out <file>                  also write this run's snapshot there
 *               --ignore digest,keys          leave fields out of the comparison
 *
 * For a production-shaped run (plan 6.3.1, the P9 runbook), on a restore:
 *               --no-setup --prepare          apply any pending migrations and the
 *                                             decision 23 mapping to the database as
 *                                             it is, print the mapping report, stop
 *               --baseline <file>             compare with this snapshot instead of
 *                                             baseline.json (e.g. a pre-switch build's
 *                                             answers on the same restore)
 *               --switch-only                 that snapshot comes from a pre-switch
 *                                             (shadow-mode) build, which already had
 *                                             D1, D5, D6 and D7: only the switch-over's
 *                                             D2, D3 and D4 may differ, and D8, D9
 *                                             (migration 0013) and D10 (removed report
 *                                             routes), which came after it
 *               --through <version>           with --prepare: apply migrations only up
 *                                             to that one (record a pre-switch build's
 *                                             answers before 0013 drops what it reads)
 *
 * Needs TEST_DATABASE_URL (see test/support/test-env.ts). Without
 * --no-setup the database is DROPPED, recreated, migrated, seeded with
 * test/equivalence/fixtures.ts and given the decision 23 mapping
 * (npm run access:map-levels -- --apply, plan 6.3.1) on every run. With
 * --no-setup the database must already carry the mapping (--prepare
 * applies it).
 *
 * Each case is compared against baseline.json (status, ids, keys,
 * digest, ...), and every difference is matched against the intended
 * differences (plan 6.3.3, intended.ts), never loosened. The run FAILS
 * on any unplanned one, and when a listed entry with a population never
 * appears (plan 6.3.2).
 *
 * From P9 (switch-over) the permission guard decides every route, so
 * D2, D3 and D4, which the shadow guard's log carried from P2b to P9,
 * are matched here as baseline differences. The baseline is the OLD
 * build's answers and is never re-recorded for them.
 */
import { resolve } from 'node:path';

import { launchDir, prepareTestEnv } from '../support/test-env';

const env = prepareTestEnv();

import { discoverRoutes, startHarnessApp } from '../support/app';
import { queryGuardViolations, resetQueryGuard } from '../support/query-guard';
import { migrateTestDatabase, recreateTestDatabase, withTestClient } from '../support/test-db';
import { compareRuns, formatDifference, type Difference, type Field } from './compare';
import { FIXTURE_SCHEMA, USER_LABEL, seedFixtures } from './fixtures';
import {
  matchIntended,
  matchSwitchOnly,
  missingApprovals,
  missingOptionalFields,
  missingRemovals,
  missingSwitchOver,
  moduleLookup,
  type ApprovalsWorld,
  type IntendedWorld,
  type SwitchWorld,
} from './intended';
import {
  captureLegacyWorld, emptyLegacyWorld, hodOnlyPairs, visibilityChange, type LegacyWorld,
} from './legacy-approvals';
import { loadUsers, runMatrix, type MatrixRun } from './matrix';
import { sampleFor, type Sample } from './sampling';
import { BASELINE_FILE, readSnapshot, summarise, writeSnapshot } from './snapshot';

export interface BaselineOptions {
  record?: boolean;
  setup?: boolean;
  /** With --no-setup: migrate and map the database as it is, then stop. */
  prepare?: boolean;
  /** With --prepare: apply migrations only up to this version. */
  through?: string;
  /** Compare with this snapshot instead of baseline.json. */
  baselineFile?: string;
  /** The baseline is a pre-switch build's: only D2, D3, D4 (and D8, D9, D10, which came after it) may differ. */
  switchOnly?: boolean;
  only?: string;
  plant?: boolean;
  out?: string;
  ignore?: Field[];
  quiet?: boolean;
}

export interface BaselineResult {
  run: MatrixRun;
  differences: Difference[];
  summary: Record<string, unknown>;
  /** The baseline's cases (empty on --record), for the switch-over matchers. */
  baselineCases: MatrixRun['cases'];
  /** D2's and D4's people and the routes' modules (intended.ts SwitchWorld). */
  switchOver: SwitchWorld;
  /** What must appear (plan 6.3.2): D2's people who can sign in, and whether D3 and D4 have a population. */
  expect: { d2People: string[]; d3Expected: boolean; d4Expected: boolean };
  /** D8's and D9's facts (intended.ts ApprovalsWorld); absent when the world before 0013 is unknown. */
  approvals: ApprovalsWorld | undefined;
}

/** The module a mapping-report gain names: "Budget (from staff to everything)" -> 'budget'. */
function gainModule(gain: string): string | null {
  if (/^budget\b/i.test(gain)) return 'budget';
  if (/^complaints\b/i.test(gain)) return 'complaints';
  return null;
}

/** The route the --plant self-check weakens, and the handler behind it. */
export const PLANTED_ROUTE = 'DELETE /api/cost-heads/:id';

export async function runBaseline(options: BaselineOptions = {}): Promise<BaselineResult> {
  const log = (msg: string): void => {
    if (!options.quiet) process.stdout.write(`${msg}\n`);
  };
  const setup = options.setup ?? true;

  if (options.prepare) {
    if (setup) throw new Error('--prepare works on a database as it is: pass --no-setup with it.');
    log(`Preparing "${env.databaseName}" as it is (no drop, no fixtures) ...`);
    const applied = await migrateTestDatabase(undefined, { through: options.through });
    log(
      `  migrations applied${options.through ? ` (through ${options.through})` : ''}: ` +
        (applied.length ? applied.join(', ') : 'none (already current)'),
    );
    const { resyncAccessMapping, formatResync } = await import('../../src/db/map-access-levels');
    const mapping = await withTestClient((db) => resyncAccessMapping(db, { apply: true }));
    log(formatResync(mapping));
    if (mapping.report.underGranted.length) {
      throw new Error('Report item 6 is not empty: someone would lose access. Stop and read the report.');
    }
    log('Prepared. Nothing else was run.');
    process.exit(0);
  }

  // The decision 23 mapping (plan 6.3.1): applied on a fresh fixture
  // database; on --no-setup, checked to be applied already (a dry run
  // that would change something means the roles are not today's levels,
  // and the shadow comparison would be meaningless).
  const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
  let mapping: Awaited<ReturnType<typeof resyncAccessMapping>>;
  /**
   * On a fixture run: every person's sample, drawn from the world the
   * baseline was recorded in (before migration 0013 moved its statuses
   * and dropped its people), so every case keeps the key it had there.
   */
  let samples: Map<string, Sample> | undefined;
  /** On a fixture run: the complaint world before migration 0013 (D8, D9). */
  let legacy: LegacyWorld | undefined;
  if (setup) {
    log(`Rebuilding test database "${env.databaseName}" ...`);
    await recreateTestDatabase({ drop: true });
    const applied = await migrateTestDatabase(undefined, { through: FIXTURE_SCHEMA });
    log(`  migrations applied: ${applied.join(', ')}`);
    await withTestClient((db) => seedFixtures(db, env.uploadDir));
    log(`  fixtures seeded (schema ${FIXTURE_SCHEMA})`);
    mapping = await withTestClient((db) => resyncAccessMapping(db, { apply: true }));
    log(`  decision 23 mapping applied: ${mapping.changes.length} changes`);
    samples = await withTestClient(async (db) => {
      const out = new Map<string, Sample>();
      for (const u of await loadUsers(db)) out.set(u.id ?? '', await sampleFor(db, u.id));
      return out;
    });
    legacy = await withTestClient((db) => captureLegacyWorld(db));
    const later = await migrateTestDatabase();
    log(`  later migrations applied to the fixtures: ${later.join(', ') || 'none'}`);
    // The migrations and the seed roles must agree: nothing left to map.
    const after = await withTestClient((db) => resyncAccessMapping(db, { apply: false }));
    if (after.changes.length > 0) {
      throw new Error(
        `After the later migrations the mapping still has ${after.changes.length} change(s): ` +
          after.changes.map((c) => c.text).join('; '),
      );
    }
  } else {
    // A restore after migration 0013 can say what it held before only
    // when it holds no complaint and no category (legacy-approvals.ts).
    legacy = (await withTestClient((db) => emptyLegacyWorld(db))) ?? undefined;
    mapping = await withTestClient((db) => resyncAccessMapping(db, { apply: false }));
    if (mapping.changes.length > 0) {
      throw new Error(
        `The database does not carry the decision 23 mapping (${mapping.changes.length} pending changes). ` +
          'Run npm run access:map-levels -- --apply on it first.',
      );
    }
  }
  // Cases are keyed by the person's label (matrix.ts): the fixture's
  // name, or the id itself on a restore.
  const label = (id: string): string => USER_LABEL[id] ?? id;

  // D2 (plan 6.3.3): the people the mapping report names (items 2 and
  // 3), and the modules Admin gives each of them.
  const d2Gains = new Map<string, Set<string>>();
  for (const p of [...mapping.report.platformLevelOnly, ...mapping.report.otherAdminGains]) {
    const modules = new Set(p.gains.map(gainModule).filter((m): m is string => m !== null));
    if (modules.size) d2Gains.set(label(p.id), modules);
  }
  const people = await withTestClient(async (db) =>
    (
      await db.query<{ id: string; signs_in: boolean; no_module_rows: boolean; platform_admin: boolean }>(
        `select u.id,
                (u.active and u.can_login and u.password_hash is not null) as signs_in,
                not exists (select 1 from user_module_access m where m.user_id = u.id) as no_module_rows,
                exists (select 1 from user_module_access m
                        where m.user_id = u.id and m.module = 'platform' and m.role = 'admin') as platform_admin
         from users u /*scope-exempt: harness, every person*/`,
      )
    ).rows,
  );
  // D4: people with no user_module_access row today.
  const noModuleRows = new Set(people.filter((p) => p.no_module_rows).map((p) => label(p.id)));
  // Plan 6.3.2, every listed entry appears, for entries with a
  // population: a person who cannot sign in is 401 in both builds.
  const signers = people.filter((p) => p.signs_in);
  const expect = {
    d2People: signers.map((p) => label(p.id)).filter((l) => d2Gains.has(l)).sort(),
    // Only Admin manages designations and locations, so anyone else who signs in is refused their full lists.
    d3Expected: signers.some((p) => !p.platform_admin),
    d4Expected: signers.some((p) => p.no_module_rows),
  };

  // D8 and D9 (owner decisions A1-A3, migration 0013): the complaints
  // 0013 closed, who reached one only as its HOD, and what each
  // complaints member now sees that they did not (and the reverse), by
  // case label "<user label>|<complaint id>".
  let approvals: ApprovalsWorld | undefined;
  if (legacy) {
    const world = legacy;
    const extras = new Map<string, Set<string>>();
    const losses = new Map<string, Set<string>>();
    await withTestClient(async (db) => {
      for (const p of people) {
        const v = await visibilityChange(db, world, p.id);
        if (v.extras.size) extras.set(label(p.id), v.extras);
        if (v.losses.size) losses.set(label(p.id), v.losses);
      }
    });
    const hodOnly = new Set(
      [...hodOnlyPairs(world)].map((pair) => {
        const [person = '', complaint = ''] = pair.split('|');
        return `${label(person)}|${complaint}`;
      }),
    );
    approvals = { migrated: world.migrated, hodOnly, extras, losses };
    log(
      `  D8: ${world.migrated.size} complaint(s) closed by 0013, ${hodOnly.size} HOD-only reassign pair(s); ` +
        `D9: ${[...extras].map(([l, s]) => `${l} +${s.size}`).join(', ') || 'nobody'} newly see complaints` +
        (losses.size ? `, ${[...losses].map(([l, s]) => `${l} -${s.size}`).join(', ')} no longer` : ''),
    );
  } else {
    log('  D8, D9: the complaint world before 0013 is unknown here; only their route removals can match.');
  }

  const harness = await startHarnessApp();
  try {
    // Belt and braces: the app's own pool must be on the test database.
    const { rows } = await harness.app
      .get<import('pg').Pool>('PG_POOL')
      .query<{ db: string }>('select current_database() as db');
    if (rows[0]?.db !== env.databaseName) {
      throw new Error(`The app is connected to "${rows[0]?.db}", not the test database. Stopping.`);
    }

    if (options.plant) {
      // A deliberately planted regression, in memory only: anyone signed
      // in can now delete cost heads (the route's @Can is swapped for
      // @SignedIn). The comparison must catch it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CostHeadsController } = require('../../src/cost-heads/cost-heads.controller') as
        typeof import('../../src/cost-heads/cost-heads.controller');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ACCESS_DECLARATIONS } = require('../../src/access/decorators') as
        typeof import('../../src/access/decorators');
      Reflect.defineMetadata(ACCESS_DECLARATIONS, [{ kind: 'signedIn' }], CostHeadsController.prototype.remove);
      log(`PLANTED: swapped @Can('budget.cost_heads.manage') for @SignedIn() on ${PLANTED_ROUTE} (in memory only)`);
    }

    const routes = discoverRoutes(harness.app);
    const only = options.plant ? (options.only ?? PLANTED_ROUTE) : options.only;
    log(`Discovered ${routes.length} routes. Running the matrix${only ? ` (only "${only}")` : ''} ...`);

    resetQueryGuard();

    const started = Date.now();
    const run = await withTestClient((db) =>
      runMatrix(harness, routes, db, {
        only,
        samples,
        legacy,
        onProgress: (n, who) => log(`  [${n}] ${who}`),
      }),
    );

    // The query guard runs in record mode until P3b scopes every read:
    // report what is still unmarked, by table. P3b drives this to zero.
    const unmarked = queryGuardViolations();
    const byTable: Record<string, Set<string>> = {};
    for (const v of unmarked) (byTable[v.table] ??= new Set()).add(v.sql);
    log(
      `Query guard (record mode): ${unmarked.length} unmarked statements, ` +
        `${Object.values(byTable).reduce((n, set) => n + set.size, 0)} distinct` +
        (unmarked.length
          ? ` (${Object.entries(byTable).sort().map(([t, set]) => `${t}: ${set.size}`).join(', ')})`
          : ''),
    );
    const summary = { ...summarise(run), seconds: Math.round((Date.now() - started) / 1000) };
    log(`Done: ${JSON.stringify(summary)}`);

    const switchOver: SwitchWorld = { d2Gains, noModuleRows, moduleOf: moduleLookup(routes) };
    const meta = {
      what: 'Access baseline: every person x every route, today (access plan P0).',
      database: setup ? 'fixtures (test/equivalence/fixtures.ts)' : 'existing database (--no-setup)',
      recordedAt: new Date().toISOString(),
    };
    if (options.out) writeSnapshot(options.out, run, meta);

    if (options.record) {
      if (only || options.plant) throw new Error('Refusing to record a partial or planted run as the baseline.');
      writeSnapshot(BASELINE_FILE(), run, meta);
      log(`Baseline written to ${BASELINE_FILE()}`);
      return { run, differences: [], summary, baselineCases: {}, switchOver, expect, approvals };
    }

    const baselineFile = options.baselineFile ?? BASELINE_FILE();
    log(`Comparing with ${baselineFile}${options.switchOnly ? ' (a pre-switch build: switch-over differences only)' : ''}`);
    const baseline = readSnapshot(baselineFile);
    const differences = compareRuns(baseline, run, { only, ignore: options.ignore });
    return { run, differences, summary, baselineCases: baseline.cases, switchOver, expect, approvals };
  } finally {
    await harness.close();
  }
}

function parseArgs(argv: string[]): BaselineOptions {
  const opts: BaselineOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--record') opts.record = true;
    else if (a === '--no-setup') opts.setup = false;
    else if (a === '--plant') opts.plant = true;
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--out') opts.out = resolve(launchDir, argv[++i] ?? '');
    else if (a === '--ignore') opts.ignore = (argv[++i] ?? '').split(',').filter(Boolean) as Field[];
    else if (a === '--prepare') opts.prepare = true;
    else if (a === '--through') opts.through = argv[++i];
    else if (a === '--baseline') opts.baselineFile = resolve(launchDir, argv[++i] ?? '');
    else if (a === '--switch-only') opts.switchOnly = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (opts.switchOnly && !opts.baselineFile) throw new Error('--switch-only needs --baseline <file>.');
  if (opts.through && !opts.prepare) throw new Error('--through goes with --prepare.');
  if (opts.baselineFile && opts.record) throw new Error('--baseline and --record do not go together.');
  return opts;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  runBaseline(opts)
    .then(({ run, differences, baselineCases, switchOver, expect, approvals }) => {
      const problems = Object.entries(run.cases).filter(
        ([, c]) => c.status === 'NO-CASE' || c.status === 'ERROR',
      );
      for (const [k, c] of problems) process.stdout.write(`  ${c.status}: ${k} ${c.error ?? ''}\n`);

      if (opts.record) {
        process.exit(problems.length > 0 ? 1 : 0);
      }
      if (opts.plant) {
        if (differences.length === 0) {
          process.stdout.write('PLANT NOT CAUGHT: the comparison found no difference. The harness is broken.\n');
          process.exit(1);
        }
        process.stdout.write(`Planted change caught: ${differences.length} difference(s), e.g.\n`);
        for (const d of differences.slice(0, 5)) process.stdout.write(`  ${formatDifference(d)}\n`);
        process.exit(0);
      }
      // Intended differences (plan 6.3.3) are matched by id, never ignored.
      const intendedWorld: IntendedWorld = { runCases: run.cases, baselineCases, switchOver, approvals };
      // Against a pre-switch build only the switch-over's own entries, and
      // D8 and D9 (which came after it), may differ.
      const { unmatched, matched } = opts.switchOnly
        ? matchSwitchOnly(differences, intendedWorld)
        : matchIntended(differences, intendedWorld);
      // D8 and D9 must appear (plan 6.3.2): the removed routes, and every member who newly sees a complaint.
      const approvalsMissing = opts.only ? [] : missingApprovals(differences, intendedWorld);
      const counts = (m: Record<string, number>): string =>
        Object.keys(m).length ? Object.entries(m).sort().map(([id, n]) => `${id}: ${n}`).join(', ') : 'none';
      process.stdout.write(`Baseline differences matched, per intended id: ${counts(matched)}.\n`);

      // The switch-over's entries (D2, D3, D4): on a full run, each with
      // a population must appear, and so must every person D2 names (plan 6.3.2).
      process.stdout.write(`  D2 people (mapping report): ${expect.d2People.join(', ') || 'none'}\n`);
      const missing = opts.only ? [] : missingSwitchOver(differences, intendedWorld, expect);
      // D10 must appear too: both removed report routes are in every baseline.
      if (!opts.only) missing.push(...missingRemovals(differences));
      // D11 too: its raise cases are in every run, and someone may raise.
      if (!opts.only) missing.push(...missingOptionalFields(differences, intendedWorld));

      if (approvalsMissing.length) {
        process.stdout.write(`FAIL: ${approvalsMissing.length} D8/D9 change(s) missing.\n`);
        for (const m of approvalsMissing) process.stdout.write(`  ${m}\n`);
      }
      if (missing.length) {
        process.stdout.write(`FAIL: ${missing.length} listed intended difference(s) did not appear.\n`);
        for (const m of missing) process.stdout.write(`  ${m}\n`);
      }
      if (unmatched.length === 0 && problems.length === 0 && missing.length === 0 && approvalsMissing.length === 0) {
        process.stdout.write('PASS: zero unmatched differences from the baseline; every listed difference appeared.\n');
        process.exit(0);
      }
      if (unmatched.length) {
        process.stdout.write(`FAIL: ${unmatched.length} unmatched difference(s) from the baseline.\n`);
        for (const d of unmatched.slice(0, 200)) process.stdout.write(`  ${formatDifference(d)}\n`);
        if (unmatched.length > 200) process.stdout.write(`  ... and ${unmatched.length - 200} more\n`);
      }
      if (problems.length) process.stdout.write(`FAIL: ${problems.length} case(s) with no case or an error.\n`);
      process.exit(1);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exit(2);
    });
}
