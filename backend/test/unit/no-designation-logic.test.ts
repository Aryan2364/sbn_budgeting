import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Owner decision A2 (5 Oct 2026, RESOLUTIONS): "the concept of
 * designation should not be linked before acting". Designations stay a
 * job label on a person; no complaint logic may branch on one. Self-check
 * A12 of the access plan, run as a test so it cannot be skipped:
 *
 *   grep -rn "seed_key\|seedKey" backend/src/complaints/   # expect nothing
 */

/** backend/src/complaints, from test/unit or dist-test/test/unit. */
function complaintsDir(): string {
  for (const dir of [resolve(__dirname, '..', '..', 'src', 'complaints'), resolve(__dirname, '..', '..', '..', 'src', 'complaints')]) {
    try {
      if (readdirSync(dir).some((f) => f.endsWith('.ts'))) return dir;
    } catch {
      // try the next one
    }
  }
  throw new Error(`Could not find backend/src/complaints from ${__dirname}`);
}

describe('A12: no complaint logic reads a designation', () => {
  it('backend/src/complaints never mentions a designation seed key', () => {
    const dir = complaintsDir();
    const hits: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/seed_key|seedKey/.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    assert.deepEqual(hits, []);
  });
});
