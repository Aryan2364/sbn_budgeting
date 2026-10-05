import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  ACCESS_MANAGE_KEY,
  ALL_CATALOGUES,
  PERMISSION_KEYS,
  accessCatalogue,
  adminGrants,
  budgetCatalogue,
  deriveRoleRows,
  describeKeys,
  isPermissionKey,
  keyInfo,
  validateCatalogues,
  type AnyCatalogue,
  type ModuleCatalogue,
  type PermissionKey,
} from '../../src/access/catalogue';
import { IMPORT_DEFAULT_ROLE_ID, SEED_ROLES, SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { legacyLevelsFor } from '../../src/db/map-access-levels';

/**
 * The code catalogues (access plan 5.2, 5.3) and the seed roles (5.4).
 * No database: the catalogue is code only (R5).
 */

const THREE_PARTS = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

function migrationSql(): string {
  for (const dir of [resolve(__dirname, '..', '..', 'migrations'), resolve(__dirname, '..', '..', '..', 'migrations')]) {
    try {
      return readFileSync(resolve(dir, '0012_access.sql'), 'utf8');
    } catch {
      // try the next
    }
  }
  throw new Error('migrations/0012_access.sql not found');
}

/** A minimal valid product catalogue to break one rule at a time. */
function sample(overrides: Partial<ModuleCatalogue> = {}): ModuleCatalogue {
  return {
    module: 'complaints',
    label: 'Sample',
    sections: [
      { key: 'things', label: 'Things', record: 'site', pick: {}, actions: [{ key: 'view', label: 'view things', short: 'View' }] },
    ],
    ...overrides,
  };
}

const problemsFor = (...cats: AnyCatalogue[]): string[] => validateCatalogues(cats);

describe('access catalogue', () => {
  it('the real catalogues are valid', () => {
    assert.deepEqual(validateCatalogues(), []);
  });

  it('every key has three snake_case parts', () => {
    const bad = PERMISSION_KEYS.filter((k) => !THREE_PARTS.test(k));
    assert.deepEqual(bad, []);
    assert.ok(PERMISSION_KEYS.includes(ACCESS_MANAGE_KEY));
    assert.ok(PERMISSION_KEYS.includes('budget.amounts.see'));
    assert.ok(!PERMISSION_KEYS.some((k) => k === ('access.manage' as string) || k.endsWith('.see_amounts')));
  });

  it('no key is declared twice', () => {
    assert.equal(new Set(PERMISSION_KEYS).size, PERMISSION_KEYS.length);
  });

  it('every need resolves to a section that declares a pick, or to see amounts of its own module', () => {
    for (const info of describeKeys()) {
      for (const need of info.needs) {
        if ('amounts' in need) {
          assert.ok(isPermissionKey(`${info.module}.amounts.see`), `${info.key} needs amounts its module lacks`);
          continue;
        }
        const pickKey = `${need.pick}.pick`;
        assert.ok(isPermissionKey(pickKey), `${info.key} needs ${pickKey}, which does not exist`);
      }
    }
  });

  it('declares the keys the plan and C1 name', () => {
    const expected: PermissionKey[] = [
      'budget.sites.change_people',
      'budget.cost_heads.manage',
      'budget.reports.view',
      'complaints.complaints.raise',
      'complaints.complaints.work',
      'complaints.complaints.reassign',
      'complaints.categories.manage',
      'platform.people.pick',
      'platform.designations.manage',
      'platform.locations.manage',
    ];
    for (const key of expected) assert.ok(isPermissionKey(key), key);
    assert.ok(!isPermissionKey('complaints.complaints.reassign_any'), 'O6: there is no reassign_any');
    assert.ok(!isPermissionKey('complaints.complaints.approve'), 'A1 (5 Oct 2026): complaints have no approval');
    assert.ok(!isPermissionKey('platform.access.view'), 'R12: there is no platform.access.view');
    assert.ok(!isPermissionKey('complaints.amounts.see'), 'Complaints has no see amounts');
  });

  it('types keys: a misspelt key does not compile', () => {
    const ok: PermissionKey = 'budget.expenses.edit';
    // @ts-expect-error misspelt section
    const bad: PermissionKey = 'budget.expnses.edit';
    // @ts-expect-error two-part key
    const twoPart: PermissionKey = 'access.manage';
    assert.ok(ok && bad && twoPart);
  });

  it('offers All only on masters and module-wide keys', () => {
    assert.deepEqual(keyInfo('budget.cost_heads.manage')?.scopes, ['all']);
    assert.deepEqual(keyInfo('budget.amounts.see')?.scopes, ['all']);
    assert.deepEqual(keyInfo(ACCESS_MANAGE_KEY)?.scopes, ['all']);
    assert.deepEqual(keyInfo('budget.expenses.edit')?.scopes, ['own', 'team', 'units', 'all']);
  });

  describe('validateCatalogues refuses', () => {
    const cases: Array<[string, AnyCatalogue[], RegExp]> = [
      ['a duplicate key', [sample({ sections: [...sample().sections, ...sample().sections] })], /declared twice/],
      ['a key that is not snake_case', [sample({ sections: [{ ...sample().sections[0]!, key: 'Bad-Key' }] })], /not three snake_case parts/],
      ['the reserved module', [{ ...sample(), module: 'access' as never }], /reserved for the kit/],
      ['the reserved section', [sample({ sections: [{ ...sample().sections[0]!, key: 'amounts' }] })], /reserved section name/],
      [
        'a need on a missing section',
        [sample({ sections: [{ ...sample().sections[0]!, actions: [{ key: 'view', label: 'v', short: 'V', needs: [{ pick: 'complaints.nowhere' }] }] }] })],
        /does not exist/,
      ],
      [
        'a need on a section with no pick',
        [sample({ sections: [
          { key: 'a', label: 'A', record: 'site', actions: [{ key: 'view', label: 'v', short: 'V', needs: [{ pick: 'complaints.b' }] }] },
          { key: 'b', label: 'B', record: 'site', actions: [{ key: 'view', label: 'v', short: 'V' }] },
        ] })],
        /declares no pick/,
      ],
      [
        'see amounts needed in a module without it',
        [sample({ sections: [{ ...sample().sections[0]!, actions: [{ key: 'view', label: 'v', short: 'V', needs: [{ amounts: true }] }] }] })],
        /has none/,
      ],
      [
        'a scoped action on a master',
        [sample({ sections: [{ key: 'heads', label: 'Heads', record: 'master', pick: { everyone: true }, actions: [{ key: 'manage', label: 'm', short: 'M', ownColumns: ['created_by'] }] }] })],
        /masters are All only/,
      ],
      [
        'an amount in pick fields',
        [sample({ sections: [{ ...sample().sections[0]!, pick: { fields: ['id', 'name', 'amountPaise'] } }] })],
        /never returns amounts/,
      ],
      [
        'more than 8 sections',
        [sample({ sections: Array.from({ length: 9 }, (_, i) => ({ ...sample().sections[0]!, key: `s${i}` })) })],
        /the most is 8/,
      ],
      ['a module declared twice', [sample(), sample()], /declared twice/],
    ];
    for (const [what, cats, pattern] of cases) {
      it(what, () => {
        const problems = problemsFor(...cats);
        assert.ok(problems.some((p) => pattern.test(p)), `expected ${pattern} in: ${problems.join(' | ')}`);
      });
    }

    it('nothing when the sample is valid', () => {
      assert.deepEqual(problemsFor(sample()), []);
    });
  });
});

describe('derived Picks and see amounts', () => {
  it('adds the Picks a tick needs, at its scope or the declared one', () => {
    const { rows, derived } = deriveRoleRows([
      { key: 'budget.expenses.edit', scope: 'own' },
      { key: 'complaints.complaints.raise', scope: 'own' },
    ]);
    const ids = rows.map((r) => `${r.key}:${r.scope}`);
    assert.ok(ids.includes('budget.sites.pick:own'), 'same scope as the needing permission');
    assert.ok(ids.includes('budget.sites.pick:all'), 'raise declares the sites Pick at All');
    assert.ok(ids.includes('budget.amounts.see:all'), 'O9: amounts added like a Pick');
    assert.ok(derived.every((d) => d.neededBy));
  });

  it('never stores a pick-for-everyone Pick, a ticked Pick or access.rights.manage', () => {
    const { rows } = deriveRoleRows([
      { key: 'budget.cost_heads.manage', scope: 'all' },
      { key: 'budget.projects.pick', scope: 'all' },
    ]);
    assert.deepEqual(rows.map((r) => r.key), ['budget.cost_heads.manage']);
    assert.throws(() => deriveRoleRows([{ key: ACCESS_MANAGE_KEY, scope: 'all' }]), /only by Admin/);
  });
});

describe('seed roles', () => {
  it('have unique fixed ids, and only Admin has a system_key (C2)', () => {
    assert.equal(new Set(SEED_ROLES.map((r) => r.id)).size, SEED_ROLES.length);
    assert.deepEqual(SEED_ROLES.filter((r) => r.systemKey !== null).map((r) => [r.seed, r.systemKey]), [['admin', 'admin']]);
    assert.equal(IMPORT_DEFAULT_ROLE_ID, SEED_ROLE_IDS.complaints_member);
  });

  it('match the rows migration 0012 inserts', () => {
    const sql = migrationSql();
    for (const role of SEED_ROLES) {
      const line = new RegExp(`'${role.id}', '${role.name}',\\s*'${role.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', ${role.systemKey ? `'${role.systemKey}'` : 'null'}\\)`);
      assert.match(sql, line, `${role.name} in 0012_access.sql`);
    }
  });

  it('use only known keys, at a scope the key offers, and never store access.rights.manage', () => {
    for (const role of SEED_ROLES) {
      for (const [key, scope] of role.grants) {
        assert.ok(isPermissionKey(key), `${role.name}: ${key}`);
        assert.ok(keyInfo(key)!.scopes.includes(scope), `${role.name}: ${key} at ${scope}`);
        assert.notEqual(key, ACCESS_MANAGE_KEY);
      }
    }
    assert.deepEqual(SEED_ROLES.find((r) => r.seed === 'admin')!.grants, []);
  });

  it('derive back the level they map from (plan 5.5 round trip)', () => {
    const expected: Record<string, Record<string, string>> = {
      budget_admin: { platform: 'none', budget: 'admin', complaints: 'none' },
      budget_staff: { platform: 'none', budget: 'staff', complaints: 'none' },
      complaints_admin: { platform: 'none', budget: 'none', complaints: 'admin' },
      complaints_member: { platform: 'none', budget: 'none', complaints: 'member' },
    };
    for (const role of SEED_ROLES.filter((r) => r.seed !== 'admin')) {
      const rows = deriveRoleRows(role.grants.map(([key, scope]) => ({ key, scope }))).rows;
      assert.deepEqual(legacyLevelsFor(rows), expected[role.seed], role.name);
    }
    assert.deepEqual(legacyLevelsFor(adminGrants()), { platform: 'admin', budget: 'admin', complaints: 'admin' });
  });

  it('Complaints member views and comments at Team, and raises, works and reassigns at Own (C1, A3)', () => {
    const member = SEED_ROLES.find((r) => r.seed === 'complaints_member')!;
    assert.deepEqual(
      [...member.grants].map(([k, s]) => `${k}:${s}`).sort(),
      [
        'complaints.complaints.comment:team',
        'complaints.complaints.raise:own',
        'complaints.complaints.reassign:own',
        'complaints.complaints.view:team',
        'complaints.complaints.work:own',
      ],
    );
  });

  it('the kit catalogue is registered last and holds only access.rights.manage', () => {
    assert.equal(ALL_CATALOGUES.at(-1), accessCatalogue);
    assert.deepEqual(describeKeys([accessCatalogue]).map((k) => k.key), [ACCESS_MANAGE_KEY]);
    assert.equal(budgetCatalogue.sections.length <= 8, true);
  });
});
