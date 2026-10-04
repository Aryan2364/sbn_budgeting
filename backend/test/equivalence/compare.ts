import type { CaseResult, MatrixRun } from './matrix';

/**
 * Compares a run with the stored baseline. Every difference is listed;
 * none is explained away here. Matching differences against the
 * intended-differences list (plan §6.3.3) is a later phase's job, and
 * it must be done by id and matcher, never by loosening this.
 */

export type Field = Exclude<keyof CaseResult, 'classes' | 'error'>;

export const COMPARED_FIELDS: Field[] = [
  'status', 'ids', 'total', 'aggregates', 'keys', 'itemKeys', 'actions', 'contentType', 'bytes', 'digest',
];

export interface Difference {
  key: string;
  kind:
    | 'route-only-in-baseline'
    | 'route-only-in-run'
    | 'case-only-in-baseline'
    | 'case-only-in-run'
    | 'field'
    | 'screen';
  field?: Field;
  baseline?: unknown;
  run?: unknown;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function compareRuns(
  baseline: MatrixRun,
  run: MatrixRun,
  { only, ignore = [] }: { only?: string; ignore?: Field[] } = {},
): Difference[] {
  const diffs: Difference[] = [];
  const inScope = (key: string): boolean => !only || key.split(' |')[0]!.includes(only);

  const baseRoutes = new Set(baseline.routes.filter(inScope));
  const runRoutes = new Set(run.routes.filter(inScope));
  for (const r of baseRoutes) if (!runRoutes.has(r)) diffs.push({ key: r, kind: 'route-only-in-baseline' });
  for (const r of runRoutes) if (!baseRoutes.has(r)) diffs.push({ key: r, kind: 'route-only-in-run' });

  // Screens (legacy-screen-rules.ts): compared whole, per person, per part.
  if (!only) {
    const people = new Set([...Object.keys(baseline.screens ?? {}), ...Object.keys(run.screens ?? {})]);
    for (const person of [...people].sort()) {
      const a = (baseline.screens ?? {})[person] as unknown as Record<string, unknown> | undefined;
      const b = (run.screens ?? {})[person] as unknown as Record<string, unknown> | undefined;
      const parts = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
      for (const part of [...parts].sort()) {
        if (!same(a?.[part], b?.[part])) {
          diffs.push({ key: `screens |${person}`, kind: 'screen', baseline: { [part]: a?.[part] }, run: { [part]: b?.[part] } });
        }
      }
    }
  }

  const fields = COMPARED_FIELDS.filter((f) => !ignore.includes(f));
  const keys = new Set([...Object.keys(baseline.cases), ...Object.keys(run.cases)]);
  for (const key of [...keys].sort()) {
    if (!inScope(key)) continue;
    const a = baseline.cases[key];
    const b = run.cases[key];
    if (!a) {
      diffs.push({ key, kind: 'case-only-in-run', run: b });
      continue;
    }
    if (!b) {
      diffs.push({ key, kind: 'case-only-in-baseline', baseline: a });
      continue;
    }
    for (const field of fields) {
      if (!same(a[field], b[field])) {
        diffs.push({ key, kind: 'field', field, baseline: a[field], run: b[field] });
      }
    }
  }
  return diffs;
}

export function formatDifference(d: Difference): string {
  switch (d.kind) {
    case 'field':
      return `${d.key}\n    ${d.field}: baseline ${JSON.stringify(d.baseline)} -> run ${JSON.stringify(d.run)}`;
    case 'screen':
      return `${d.key}
    baseline ${JSON.stringify(d.baseline)} -> run ${JSON.stringify(d.run)}`;
    case 'case-only-in-run':
      return `${d.key}\n    new case (status ${JSON.stringify((d.run as CaseResult).status)})`;
    case 'case-only-in-baseline':
      return `${d.key}\n    case missing from this run (baseline status ${JSON.stringify((d.baseline as CaseResult).status)})`;
    default:
      return `${d.key}\n    ${d.kind}`;
  }
}
