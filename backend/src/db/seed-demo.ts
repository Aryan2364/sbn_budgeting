import { COST_HEADS } from './cost-heads.data';
import { loadEnv } from './env';
import { closePool, getPool } from './pool';

loadEnv();

/**
 * THE VERIFICATION FIXTURE. Not part of the real seed, and never run
 * against anything but a development database.
 *
 * It loads `Sadbhvana Budget Tracker.xlsx` — the whole 19 x 5 per-tree
 * grid and all 19 expenses — so that the variance definition can be
 * checked against numbers a person already added up in Excel:
 *
 *   per-tree grand total        3,432
 *   Morbi budget at 5,000 trees 1,71,60,000
 *   Morbi actual                1,19,133
 *   Rajkot actual                  30,029
 *
 * If the view disagrees with any of those, the view is wrong.
 *
 * Two sites on purpose. Morbi carries the full grid; Rajkot carries the
 * same grid at a different tree count, which is what makes the per-tree
 * model visible. Irrigation is blank in all five periods for both, so
 * Rajkot's Irrigation expense of Rs 3,178 lands on a head with no
 * budget rows — exactly the row plan section 3 says must still appear.
 *
 * PERIODS ON EXPENSES ARE A PLACEHOLDER. The spreadsheet has no period
 * column, only a calendar Year formula that answers a different
 * question. Every demo expense is booked to Initial. This fixture
 * verifies the variance maths; it does not define the derivation rule,
 * which is Phase 6.
 */

/** Per-tree rupee amounts, [cost head number, period, rupees]. */
const BUDGET_GRID: readonly [number, number, number][] = [
  [1, 0, 100],
  [2, 0, 450],
  [3, 0, 50],
  [4, 0, 150],
  [5, 0, 25],
  [6, 0, 100],
  [7, 0, 50],
  [7, 1, 40], [7, 2, 40], [7, 3, 40], [7, 4, 40],
  [8, 0, 35],
  [9, 1, 60], [9, 2, 60], [9, 3, 60], [9, 4, 60],
  [10, 1, 135], [10, 2, 135], [10, 3, 135], [10, 4, 135],
  [11, 1, 176], [11, 2, 176], [11, 3, 176], [11, 4, 176],
  [12, 1, 20], [12, 2, 20], [12, 3, 20], [12, 4, 20],
  [13, 1, 4], [13, 2, 4], [13, 3, 4], [13, 4, 4],
  [14, 1, 1], [14, 2, 1], [14, 3, 1], [14, 4, 1],
  // 16 Irrigation: blank in all five periods, so NO ROWS.
  [15, 1, 144], [15, 2, 144], [15, 3, 144], [15, 4, 144],
  [17, 1, 5], [17, 2, 5], [17, 3, 5], [17, 4, 5],
  [18, 1, 28], [18, 2, 28], [18, 3, 28], [18, 4, 28],
  [19, 1, 5], [19, 2, 5], [19, 3, 5], [19, 4, 5],
];

/** [cost head number, site, date, bill number, rupees]. */
const EXPENSES: readonly [number, 'Morbi' | 'Rajkot', string, string, number][] = [
  [1, 'Morbi', '2026-08-22', '62', 11925],
  [2, 'Morbi', '2026-08-17', '26', 7182],
  [3, 'Morbi', '2026-08-27', '87', 11974],
  [4, 'Morbi', '2026-08-24', '53', 10150],
  [5, 'Morbi', '2026-08-20', '122', 12177],
  [6, 'Morbi', '2026-08-18', '38', 9254],
  [7, 'Morbi', '2026-08-23', '82', 9745],
  [8, 'Morbi', '2026-08-20', '114', 10809],
  [9, 'Morbi', '2026-08-24', '119', 11910],
  [10, 'Morbi', '2026-08-26', '93', 5050],
  [11, 'Morbi', '2026-08-21', '114', 5126],
  [12, 'Morbi', '2026-08-17', '89', 10770],
  [13, 'Morbi', '2026-08-26', '123', 3061],
  [14, 'Rajkot', '2026-08-26', '77', 7484],
  [15, 'Rajkot', '2026-08-23', '3', 3995],
  [16, 'Rajkot', '2026-08-24', '82', 3178],
  [17, 'Rajkot', '2026-08-22', '86', 3202],
  [18, 'Rajkot', '2026-08-20', '100', 7309],
  [19, 'Rajkot', '2026-08-21', '32', 4861],
];

/** Rupees to paise, in bigint. Never `rupees * 100` on a float. */
function paise(rupees: number): string {
  return (BigInt(rupees) * 100n).toString();
}

async function seedDemo(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    // Idempotent: this fixture owns these rows and replaces them whole.
    await client.query(
      `delete from expenses where site_id in (
         select id from sites where project_id in (
           select id from projects where name = 'Green Belt'))`,
    );
    await client.query(
      `delete from site_budgets where site_id in (
         select id from sites where project_id in (
           select id from projects where name = 'Green Belt'))`,
    );
    await client.query(
      `delete from sites where project_id in (
         select id from projects where name = 'Green Belt')`,
    );
    await client.query(`delete from projects where name = 'Green Belt'`);

    const heads = await client.query<{ id: string; name: string; sort_order: number }>(
      'select id, name, sort_order from cost_heads order by sort_order',
    );
    if (heads.rowCount !== COST_HEADS.length) {
      throw new Error('Run the real seed first: cost heads are missing.');
    }
    const headByNumber = new Map(heads.rows.map((r) => [r.sort_order, r.id]));

    const project = await client.query<{ id: string }>(
      `insert into projects (donor_name, name, planned_trees)
       values ('Sadbhavna Trust', 'Green Belt', 8000) returning id`,
    );
    const projectId = project.rows[0]!.id;

    const siteIds = new Map<string, string>();
    for (const [name, trees] of [
      ['Morbi', 5000],
      ['Rajkot', 3000],
    ] as const) {
      const site = await client.query<{ id: string }>(
        `insert into sites (project_id, name, planned_trees, plantation_start_date)
         values ($1, $2, $3, date '2026-08-01') returning id`,
        [projectId, name, trees],
      );
      siteIds.set(name, site.rows[0]!.id);
    }

    for (const siteId of siteIds.values()) {
      for (const [headNo, period, rupees] of BUDGET_GRID) {
        await client.query(
          `insert into site_budgets (site_id, cost_head_id, period, per_tree_paise)
           values ($1, $2, $3, $4)`,
          [siteId, headByNumber.get(headNo), period, paise(rupees)],
        );
      }
    }

    for (const [headNo, siteName, spentOn, billNumber, rupees] of EXPENSES) {
      await client.query(
        `insert into expenses
           (site_id, cost_head_id, spent_on, period, amount_paise, bill_number, approved_by)
         values ($1, $2, $3, 0, $4, $5, 'ABC')`,
        [
          siteIds.get(siteName),
          headByNumber.get(headNo),
          spentOn,
          paise(rupees),
          billNumber,
        ],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  // eslint-disable-next-line no-console
  console.log(
    `demo fixture: 1 project, 2 sites, ${BUDGET_GRID.length} budget rows per site, ` +
      `${EXPENSES.length} expenses`,
  );
}

if (require.main === module) {
  seedDemo()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
