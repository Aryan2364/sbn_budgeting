import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { MatrixRun } from './matrix';

/**
 * The stored baseline: test/equivalence/baseline.json, in the
 * source tree (not dist-test), one case per line so a change to the
 * baseline reads as a short diff in review.
 */

export function sourceDir(): string {
  for (const candidate of [
    resolve(__dirname),
    resolve(__dirname, '..', '..', '..', 'test', 'equivalence'),
  ]) {
    if (existsSync(resolve(candidate, 'fixtures.ts'))) return candidate;
  }
  throw new Error(`Could not find test/equivalence from ${__dirname}`);
}

export const BASELINE_FILE = (): string => resolve(sourceDir(), 'baseline.json');

export interface Snapshot extends MatrixRun {
  meta: Record<string, unknown>;
  summary: Record<string, unknown>;
}

export function summarise(run: MatrixRun): Record<string, unknown> {
  const byStatus: Record<string, number> = {};
  for (const c of Object.values(run.cases)) {
    const k = String(c.status);
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  return {
    routes: run.routes.length,
    users: run.users.length,
    cases: Object.keys(run.cases).length,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function writeSnapshot(file: string, run: MatrixRun, meta: Record<string, unknown>): void {
  const lines: string[] = [];
  lines.push('{');
  lines.push(`  "meta": ${JSON.stringify(meta)},`);
  lines.push(`  "summary": ${JSON.stringify(summarise(run))},`);
  lines.push('  "routes": [');
  run.routes.forEach((r, i) => lines.push(`    ${JSON.stringify(r)}${i < run.routes.length - 1 ? ',' : ''}`));
  lines.push('  ],');
  lines.push('  "users": [');
  run.users.forEach((u, i) => lines.push(`    ${JSON.stringify(u)}${i < run.users.length - 1 ? ',' : ''}`));
  lines.push('  ],');
  lines.push('  "screens": {');
  const screens = Object.entries(run.screens);
  screens.forEach(([k, v], i) =>
    lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < screens.length - 1 ? ',' : ''}`),
  );
  lines.push('  },');
  lines.push('  "cases": {');
  const entries = Object.entries(run.cases);
  entries.forEach(([k, v], i) =>
    lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < entries.length - 1 ? ',' : ''}`),
  );
  lines.push('  }');
  lines.push('}');
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

export function readSnapshot(file: string): Snapshot {
  if (!existsSync(file)) {
    throw new Error(`No baseline at ${file}. Record one first: npm run test:equivalence:record`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
}
