/**
 * Access baseline harness (access plan P0).
 *
 *   npm run test:equivalence             run the matrix, compare with baseline.json
 *   npm run test:equivalence:record      run the matrix, (re)write baseline.json
 *   npm run test:equivalence -- --plant  self-check: remove one @ModuleRole in memory
 *                                        and prove the comparison catches it
 *
 * Other flags:  --only "<METHOD /api/path>"   restrict to matching routes
 *               --no-setup                    use the database as it is (e.g. a
 *                                             restore) instead of rebuilding fixtures
 *               --out <file>                  also write this run's snapshot there
 *               --ignore digest,keys          leave fields out of the comparison
 *
 * Needs TEST_DATABASE_URL (see test/support/test-env.ts). Without
 * --no-setup the database is DROPPED, recreated, migrated, seeded with
 * test/equivalence/fixtures.ts and given the decision 23 mapping
 * (npm run access:map-levels -- --apply, plan 6.3.1) on every run. With
 * --no-setup the database must already carry the mapping.
 *
 * Two comparisons, both matched against the intended differences
 * (plan 6.3.3, intended.ts), never loosened:
 *   - each case against baseline.json (status, ids, keys, digest, ...);
 *   - every ACCESS-SHADOW disagreement between the new route guard and
 *     the old one. The run FAILS on any unplanned one.
 */
import { prepareTestEnv } from '../support/test-env';

const env = prepareTestEnv();

import { discoverRoutes, startHarnessApp } from '../support/app';
import { queryGuardViolations, resetQueryGuard } from '../support/query-guard';
import { migrateTestDatabase, recreateTestDatabase, withTestClient } from '../support/test-db';
import { compareRuns, formatDifference, type Difference, type Field } from './compare';
import { USER_LABEL, seedFixtures } from './fixtures';
import {
  EXPECTED_SHADOW_IDS,
  matchIntended,
  matchShadow,
  missingD6,
  routeMatcher,
  type IntendedWorld,
  type ShadowMatch,
  type ShadowWorld,
} from './intended';
import { runMatrix, type MatrixRun } from './matrix';
import { BASELINE_FILE, readSnapshot, summarise, writeSnapshot } from './snapshot';

export interface BaselineOptions {
  record?: boolean;
  setup?: boolean;
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
  /** Every shadow disagreement of the run, classified. Null on --record and --plant. */
  shadow: ShadowMatch | null;
  /** The people D2 names (mapping report items 2 and 3), for the "every listed entry appears" check. */
  d2People: string[];
  /** D6's complaints, for matching the baseline differences (intended.ts). */
  selfApprovals: Map<string, string>;
}

/** The module a mapping-report gain names: "Budget (from staff to everything)" -> 'budget'. */
function gainModule(gain: string): string | null {
  if (/^budget\b/i.test(gain)) return 'budget';
  if (/^complaints\b/i.test(gain)) return 'complaints';
  return null;
}

/** The guard keeps at most 1000 lines (permission.guard.ts SHADOW_CAP). */
const SHADOW_DRAIN_LIMIT = 1000;

/** The route the --plant self-check weakens, and the handler behind it. */
export const PLANTED_ROUTE = 'DELETE /api/cost-heads/:id';

export async function runBaseline(options: BaselineOptions = {}): Promise<BaselineResult> {
  const log = (msg: string): void => {
    if (!options.quiet) process.stdout.write(`${msg}\n`);
  };
  const setup = options.setup ?? true;

  if (setup) {
    log(`Rebuilding test database "${env.databaseName}" ...`);
    await recreateTestDatabase({ drop: true });
    const applied = await migrateTestDatabase();
    log(`  migrations applied: ${applied.join(', ')}`);
    await withTestClient((db) => seedFixtures(db, env.uploadDir));
    log('  fixtures seeded');
  }

  // The decision 23 mapping (plan 6.3.1): applied on a fresh fixture
  // database; on --no-setup, checked to be applied already (a dry run
  // that would change something means the roles are not today's levels,
  // and the shadow comparison would be meaningless).
  const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
  const mapping = await withTestClient((db) => resyncAccessMapping(db, { apply: setup }));
  if (setup) {
    log(`  decision 23 mapping applied: ${mapping.changes.length} changes`);
  } else if (mapping.changes.length > 0) {
    throw new Error(
      `The database does not carry the decision 23 mapping (${mapping.changes.length} pending changes). ` +
        'Run npm run access:map-levels -- --apply on it first.',
    );
  }
  const adminGains = new Map<string, Set<string>>();
  for (const p of [...mapping.report.platformLevelOnly, ...mapping.report.otherAdminGains]) {
    const modules = new Set(p.gains.map(gainModule).filter((m): m is string => m !== null));
    if (modules.size) adminGains.set(p.id, modules);
  }
  const noModuleRows = new Set(
    await withTestClient(async (db) =>
      (
        await db.query<{ id: string }>(
          `select u.id from users u /*scope-exempt: harness, every person*/
           where not exists (select 1 from user_module_access m where m.user_id = u.id)`,
        )
      ).rows.map((r) => r.id),
    ),
  );

  // D6 (plan 6.3.3): every complaint whose approver raised or resolved
  // it, keyed as the approver's case suffix "<label>|<complaint id>".
  const selfApprovals = new Map(
    await withTestClient(async (db) =>
      (
        await db.query<{ id: string; approver_id: string; status: string }>(
          `select c.id, c.approver_id, c.status from complaints c /*scope-exempt: harness, every complaint*/
           where c.approver_id in (c.raised_by, c.resolved_by)`,
        )
      ).rows.map((r): [string, string] => [`${USER_LABEL[r.approver_id] ?? r.approver_id}|${r.id}`, r.status]),
    ),
  );
  if (selfApprovals.size) {
    log(`  D6: ${[...selfApprovals].filter(([, s]) => s !== 'closed').length} open complaint(s) whose approver raised or resolved it`);
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
      // A deliberately planted regression, in memory only: budget staff
      // can now delete cost heads. The comparison must catch it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CostHeadsController } = require('../../src/cost-heads/cost-heads.controller') as
        typeof import('../../src/cost-heads/cost-heads.controller');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MODULE_ACCESS } = require('../../src/common/module-access.decorator') as
        typeof import('../../src/common/module-access.decorator');
      Reflect.deleteMetadata(MODULE_ACCESS, CostHeadsController.prototype.remove);
      log(`PLANTED: removed @ModuleRole('budget', 'admin') from ${PLANTED_ROUTE} (in memory only)`);
    }

    const routes = discoverRoutes(harness.app);
    const only = options.plant ? (options.only ?? PLANTED_ROUTE) : options.only;
    log(`Discovered ${routes.length} routes. Running the matrix${only ? ` (only "${only}")` : ''} ...`);

    // The shadow log is capped in the guard; drain it after every person
    // so nothing is lost, and fail if one person alone could have hit the cap.
    const { shadowDisagreements } = await import('../../src/access/permission.guard');
    const shadowLines: string[] = [];
    const drainShadow = (): void => {
      if (shadowDisagreements.length >= SHADOW_DRAIN_LIMIT) {
        throw new Error('The shadow log reached its cap within one person; some lines may be lost.');
      }
      shadowLines.push(...shadowDisagreements.splice(0));
    };
    shadowDisagreements.length = 0;
    resetQueryGuard();

    const started = Date.now();
    const run = await withTestClient((db) =>
      runMatrix(harness, routes, db, {
        only,
        onProgress: (n, label) => {
          drainShadow();
          log(`  [${n}] ${label}`);
        },
      }),
    );
    drainShadow();

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
      return { run, differences: [], summary, shadow: null, d2People: [], selfApprovals };
    }

    const baseline = readSnapshot(BASELINE_FILE());
    const differences = compareRuns(baseline, run, { only, ignore: options.ignore });
    const world: ShadowWorld = { routeOf: routeMatcher(routes), adminGains, noModuleRows };
    const shadow = options.plant ? null : matchShadow(shadowLines, world);
    return { run, differences, summary, shadow, d2People: [...adminGains.keys()], selfApprovals };
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
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--ignore') opts.ignore = (argv[++i] ?? '').split(',').filter(Boolean) as Field[];
    else throw new Error(`Unknown argument ${a}`);
  }
  return opts;
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  runBaseline(opts)
    .then(({ run, differences, shadow, d2People, selfApprovals }) => {
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
      const intendedWorld: IntendedWorld = { runCases: run.cases, selfApprovals };
      const { unmatched, matched } = matchIntended(differences, intendedWorld);
      // D6's count: every listed complaint must show its change (plan 6.3.2).
      const d6Missing = opts.only ? [] : missingD6(differences, intendedWorld);
      const counts = (m: Record<string, number>): string =>
        Object.keys(m).length ? Object.entries(m).sort().map(([id, n]) => `${id}: ${n}`).join(', ') : 'none';
      process.stdout.write(`Baseline differences matched, per intended id: ${counts(matched)}.\n`);

      // Shadow disagreements: every one must be an intended difference,
      // and (on a full run) every expected one must appear (plan 6.3.2).
      const shadowFailures: string[] = [];
      if (shadow) {
        const label = (id: string): string => USER_LABEL[id] ?? id;
        process.stdout.write(`Shadow disagreements matched, per intended id: ${counts(shadow.matched)}.\n`);
        for (const [id, people] of Object.entries(shadow.people).sort()) {
          process.stdout.write(`  ${id} people: ${[...people].map(label).sort().join(', ')}\n`);
        }
        for (const l of shadow.unmatched) shadowFailures.push(`unplanned: ${l.raw} (${label(l.user)})`);
        for (const raw of shadow.unparsed) shadowFailures.push(`unparseable: ${raw}`);
        if (!opts.only) {
          for (const id of EXPECTED_SHADOW_IDS) {
            if (!shadow.matched[id]) shadowFailures.push(`expected intended difference ${id} never appeared`);
          }
          const d2 = shadow.people.D2 ?? new Set<string>();
          for (const p of d2People) {
            if (!d2.has(p)) shadowFailures.push(`D2 lists ${label(p)} (mapping report), but they gained nothing`);
          }
        }
      }

      if (d6Missing.length) {
        process.stdout.write(`FAIL: ${d6Missing.length} D6 change(s) missing.
`);
        for (const m of d6Missing) process.stdout.write(`  ${m}
`);
      }
      if (unmatched.length === 0 && problems.length === 0 && shadowFailures.length === 0 && d6Missing.length === 0) {
        process.stdout.write('PASS: zero unmatched differences from the baseline, zero unplanned shadow disagreements.\n');
        process.exit(0);
      }
      if (unmatched.length) {
        process.stdout.write(`FAIL: ${unmatched.length} unmatched difference(s) from the baseline.\n`);
        for (const d of unmatched.slice(0, 200)) process.stdout.write(`  ${formatDifference(d)}\n`);
        if (unmatched.length > 200) process.stdout.write(`  ... and ${unmatched.length - 200} more\n`);
      }
      if (shadowFailures.length) {
        process.stdout.write(`FAIL: ${shadowFailures.length} shadow problem(s).\n`);
        for (const f of shadowFailures.slice(0, 200)) process.stdout.write(`  ${f}\n`);
        if (shadowFailures.length > 200) process.stdout.write(`  ... and ${shadowFailures.length - 200} more\n`);
      }
      if (problems.length) process.stdout.write(`FAIL: ${problems.length} case(s) with no case or an error.\n`);
      process.exit(1);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exit(2);
    });
}
