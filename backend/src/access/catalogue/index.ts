import { accessCatalogue, ACCESS_MANAGE_KEY } from './access';
import { budgetCatalogue } from './budget';
import { complaintsCatalogue } from './complaints';
import { platformCatalogue } from './platform';
import {
  SCOPES,
  type AnyCatalogue,
  type CatalogueKeys,
  type ModuleCatalogue,
  type Need,
  type Scope,
  type SectionDef,
} from './types';

export * from './types';
export { accessCatalogue, ACCESS_MANAGE_KEY, budgetCatalogue, complaintsCatalogue, platformCatalogue };

/**
 * The registry of module catalogues (access plan section 5.2).
 *
 * Nothing here touches the database: the catalogue is code only (R5).
 * `validateCatalogues()` runs in the unit tests now and at boot from P2a,
 * and refuses, listing every offender, on anything section 5.2 forbids.
 */

/** The product's modules, in the order the screens list them. */
export const PRODUCT_CATALOGUES = [budgetCatalogue, complaintsCatalogue, platformCatalogue] as const;

/** Every catalogue, the kit's own `access` one last. */
export const ALL_CATALOGUES: readonly AnyCatalogue[] = [...PRODUCT_CATALOGUES, accessCatalogue];

/** Every permission key the code knows. A key outside this union fails to compile. */
export type PermissionKey =
  | CatalogueKeys<typeof budgetCatalogue>
  | CatalogueKeys<typeof complaintsCatalogue>
  | CatalogueKeys<typeof platformCatalogue>
  | CatalogueKeys<typeof accessCatalogue>;

/** Reserved names (plan 3.4.10): no product catalogue may use them. */
export const RESERVED_MODULE = 'access';
export const RESERVED_SECTION = 'amounts';
export const PICK_ACTION = 'pick';
export const MAX_SECTIONS = 8;

const KEY_PART = /^[a-z][a-z0-9_]*$/;
const AMOUNT_FIELD = /(paise|amount)/i;

export type KeyKind = 'action' | 'pick' | 'amounts' | 'access';

export interface KeyInfo {
  key: string;
  kind: KeyKind;
  module: string;
  moduleLabel: string;
  /** Null for module-wide keys (see amounts). */
  section: SectionDef | null;
  /** The sentence fragment reasonFor builds on: "edit expenses". */
  label: string;
  /** The scopes the role grid offers for this key (kit 40.4 rule 3). */
  scopes: readonly Scope[];
  needs: readonly Need[];
}

const ALL_ONLY: readonly Scope[] = ['all'];

function scopesForSection(section: SectionDef): readonly Scope[] {
  return section.record === 'master' || section.record === 'none' ? ALL_ONLY : SCOPES;
}

/** Every key the given catalogues declare, with what the grid and the derivations need. */
export function describeKeys(catalogues: readonly AnyCatalogue[] = ALL_CATALOGUES): KeyInfo[] {
  const out: KeyInfo[] = [];
  for (const cat of catalogues) {
    for (const section of cat.sections) {
      for (const action of section.actions) {
        out.push({
          key: `${cat.module}.${section.key}.${action.key}`,
          kind: cat.module === RESERVED_MODULE ? 'access' : 'action',
          module: cat.module,
          moduleLabel: cat.label,
          section,
          label: action.label,
          scopes: scopesForSection(section),
          needs: action.needs ?? [],
        });
      }
      if (section.pick) {
        out.push({
          key: `${cat.module}.${section.key}.${PICK_ACTION}`,
          kind: 'pick',
          module: cat.module,
          moduleLabel: cat.label,
          section,
          label: `pick ${section.label.toLowerCase()}`,
          scopes: scopesForSection(section),
          needs: [],
        });
      }
    }
    if ('seeAmounts' in cat && cat.seeAmounts) {
      out.push({
        key: `${cat.module}.${RESERVED_SECTION}.see`,
        kind: 'amounts',
        module: cat.module,
        moduleLabel: cat.label,
        section: null,
        label: `see amounts (${cat.seeAmounts.covers})`,
        scopes: ALL_ONLY,
        needs: [],
      });
    }
  }
  return out;
}

const KEYS_BY_NAME = new Map(describeKeys().map((k) => [k.key, k]));

/** Every key, as a runtime list, in catalogue order. */
export const PERMISSION_KEYS: readonly PermissionKey[] = [...KEYS_BY_NAME.keys()] as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return KEYS_BY_NAME.has(key);
}

export function keyInfo(key: string): KeyInfo | undefined {
  return KEYS_BY_NAME.get(key);
}

/**
 * The keys Admin holds, all at All, computed rather than stored (R4,
 * decision 8): every key of every catalogue, access.rights.manage
 * included. A new module reaches Admin with no migration.
 */
export function adminGrants(): Array<{ key: PermissionKey; scope: Scope }> {
  return PERMISSION_KEYS.map((key) => ({ key, scope: 'all' as const }));
}

// ---------------------------------------------------------------------
// Validation (plan 5.2, backend kit 3.6)
// ---------------------------------------------------------------------

function sectionOf(catalogues: readonly AnyCatalogue[], ref: string): SectionDef | undefined {
  const [module, section, ...rest] = ref.split('.');
  if (!module || !section || rest.length) return undefined;
  return catalogues.find((c) => c.module === module)?.sections.find((s) => s.key === section);
}

function isAmountField(field: string, cat: AnyCatalogue): boolean {
  if (AMOUNT_FIELD.test(field)) return true;
  if (!('seeAmounts' in cat) || !cat.seeAmounts) return false;
  return (
    cat.seeAmounts.stripKeys.includes(field) ||
    cat.seeAmounts.stripSuffixes.some((suffix) => field.endsWith(suffix))
  );
}

/**
 * Every problem with the catalogues, one plain line each. Empty means
 * valid. The boot check (P2a) refuses to start on a non-empty list.
 */
export function validateCatalogues(catalogues: readonly AnyCatalogue[] = ALL_CATALOGUES): string[] {
  const problems: string[] = [];
  const seenModules = new Set<string>();
  const seenKeys = new Set<string>();

  for (const cat of catalogues) {
    const isKit = cat === accessCatalogue;
    if (seenModules.has(cat.module)) problems.push(`Module "${cat.module}" is declared twice.`);
    seenModules.add(cat.module);
    if (!KEY_PART.test(cat.module)) problems.push(`Module "${cat.module}" is not snake_case.`);
    if (!isKit && cat.module === RESERVED_MODULE) {
      problems.push(`Module "${cat.module}" is reserved for the kit's own access catalogue.`);
    }
    if (cat.sections.length > MAX_SECTIONS) {
      problems.push(`Module "${cat.module}" has ${cat.sections.length} sections; the most is ${MAX_SECTIONS}.`);
    }

    const sectionKeys = new Set<string>();
    for (const section of cat.sections) {
      const where = `${cat.module}.${section.key}`;
      if (sectionKeys.has(section.key)) problems.push(`Section "${where}" is declared twice.`);
      sectionKeys.add(section.key);
      if (section.key === RESERVED_SECTION) {
        problems.push(`Section "${where}" uses the reserved section name "${RESERVED_SECTION}".`);
      }
      if (section.actions.length === 0) problems.push(`Section "${where}" has no actions.`);

      for (const action of section.actions) {
        if (action.key === PICK_ACTION) {
          problems.push(`Section "${where}" lists "pick" as an action; a Pick is declared with \`pick\`.`);
        }
        if (section.record === 'master' && (action.ownColumns || action.createSiteFrom)) {
          problems.push(`Master section "${where}" has a scoped action "${action.key}"; masters are All only.`);
        }
        if (!action.label.trim() || !action.short.trim()) {
          problems.push(`Action "${where}.${action.key}" needs a label and a short name.`);
        }
        for (const need of action.needs ?? []) {
          if ('amounts' in need) {
            if (!('seeAmounts' in cat) || !cat.seeAmounts) {
              problems.push(
                `Action "${where}.${action.key}" needs see amounts, but module "${cat.module}" has none.`,
              );
            }
            continue;
          }
          const target = sectionOf(catalogues, need.pick);
          if (!target) {
            problems.push(`Action "${where}.${action.key}" needs the Pick of "${need.pick}", which does not exist.`);
          } else if (!target.pick) {
            problems.push(
              `Action "${where}.${action.key}" needs the Pick of "${need.pick}", but that section declares no pick.`,
            );
          }
        }
      }

      for (const field of section.pick?.fields ?? []) {
        if (isAmountField(field, cat)) {
          problems.push(`The Pick of "${where}" returns "${field}", an amount. A Pick never returns amounts.`);
        }
      }
    }
  }

  for (const info of describeKeys(catalogues)) {
    const parts = info.key.split('.');
    if (parts.length !== 3 || !parts.every((p) => KEY_PART.test(p))) {
      problems.push(`Key "${info.key}" is not three snake_case parts.`);
    }
    if (seenKeys.has(info.key)) problems.push(`Key "${info.key}" is declared twice.`);
    seenKeys.add(info.key);
  }

  return problems;
}

export function assertCataloguesValid(catalogues: readonly AnyCatalogue[] = ALL_CATALOGUES): void {
  const problems = validateCatalogues(catalogues);
  if (problems.length) {
    throw new Error(`The access catalogues are invalid:\n  - ${problems.join('\n  - ')}`);
  }
}

// ---------------------------------------------------------------------
// Derived rows: Picks and see amounts (decision 11, R6, O9)
// ---------------------------------------------------------------------

export interface Grant {
  key: string;
  scope: Scope;
}

export interface DerivedGrant extends Grant {
  /** The ticked permission that needs it. */
  neededBy: string;
}

/**
 * The full set of role_permissions rows for a role whose ticked
 * permissions are `ticked`: the ticks themselves, plus every Pick and
 * see amounts they need, as a role save derives them (plan 6.1.11 step 3).
 *
 * - A Pick takes the needing permission's scope, or the declared 'all'.
 *   A Pick needed at several scopes is several rows (R6).
 * - A pick-for-everyone section's Pick is never stored: every active
 *   user holds it with no row.
 * - A section's own Pick is implied by its view (plan 3.4.6) and is not
 *   stored unless another section's permission needs it.
 * - Ticked Picks are ignored: Picks are derived, never ticked.
 * - access.rights.manage is never a row; it is refused here.
 */
export function deriveRoleRows(ticked: readonly Grant[]): { rows: Grant[]; derived: DerivedGrant[] } {
  const rows = new Map<string, Grant>();
  const derived: DerivedGrant[] = [];
  const add = (grant: Grant): boolean => {
    const id = `${grant.key}|${grant.scope}`;
    if (rows.has(id)) return false;
    rows.set(id, { key: grant.key, scope: grant.scope });
    return true;
  };

  for (const t of ticked) {
    if (t.key === ACCESS_MANAGE_KEY) {
      throw new Error(`${ACCESS_MANAGE_KEY} is held only by Admin and is never stored on a role.`);
    }
    const info = keyInfo(t.key);
    if (info?.kind === 'pick') continue;
    add(t);
  }

  for (const t of ticked) {
    const info = keyInfo(t.key);
    if (!info || info.kind === 'pick') continue;
    for (const need of info.needs) {
      let grant: Grant;
      if ('amounts' in need) {
        grant = { key: `${info.module}.${RESERVED_SECTION}.see`, scope: 'all' };
      } else {
        const target = sectionOf(ALL_CATALOGUES, need.pick);
        if (!target?.pick || target.pick.everyone) continue;
        grant = { key: `${need.pick}.${PICK_ACTION}`, scope: need.scope ?? t.scope };
      }
      if (add(grant)) derived.push({ ...grant, neededBy: t.key });
    }
  }

  const order = new Map(PERMISSION_KEYS.map((k, i) => [k as string, i]));
  const sorted = [...rows.values()].sort(
    (a, b) =>
      (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER) ||
      a.key.localeCompare(b.key) ||
      SCOPES.indexOf(a.scope) - SCOPES.indexOf(b.scope),
  );
  return { rows: sorted, derived };
}

/** Product catalogues only, typed for callers that need ModuleCatalogue. */
export const MODULE_CATALOGUES: readonly ModuleCatalogue[] = PRODUCT_CATALOGUES;
