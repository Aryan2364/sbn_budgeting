import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ALL_CATALOGUES,
  PICK_ACTION,
  RESERVED_MODULE,
  RESERVED_SECTION,
  SCOPES,
  describeKeys,
  type AnyCatalogue,
  type KeyInfo,
} from './catalogue';

/**
 * `npm run access:keys` writes frontend/lib/permission-keys.ts from the
 * catalogues (access plan 6.1.7, R3, backend kit 8.1).
 * `npm run access:keys -- --check` writes nothing and exits 1 when that
 * file is stale (self-check A6).
 *
 * The file holds what the screen needs and /auth/me deliberately does
 * not carry: the PermissionKey union and Scope; each key's label, which
 * reasonFor builds its sentence from; each module's non-Pick keys (a
 * module shows when the user holds any of them); and what the role
 * editor needs to draw the grid and its "Also includes" lines before
 * saving: modules, sections and actions in catalogue order with their
 * short column names, the scopes each section offers, each action's
 * needs with any fixed scope, each module's see-amounts label, and
 * which sections are pick-for-everyone.
 *
 * Reads no environment and no database.
 */

export const GENERATED_PATH_FROM_TRACKING = ['frontend', 'lib', 'permission-keys.ts'] as const;

/**
 * Tracking/frontend/lib/permission-keys.ts, found by walking up from this
 * file (backend/dist/access, backend/src/access or backend/dist-test/src/access)
 * to the folder that holds both backend/ and frontend/lib/.
 */
export function generatedPath(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(dir, 'backend')) && existsSync(resolve(dir, 'frontend', 'lib'))) {
      return resolve(dir, ...GENERATED_PATH_FROM_TRACKING);
    }
    dir = resolve(dir, '..');
  }
  throw new Error(`Could not find frontend/lib from ${__dirname}.`);
}

/** A TypeScript literal in the frontend's style: single quotes, no trailing commas lost. */
function lit(value: unknown, indent = ''): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      const flat = `[${value.map((v) => lit(v)).join(', ')}]`;
      if (flat.length + indent.length <= 100) return flat;
    }
    return `[\n${value.map((v) => `${inner}${lit(v, inner)},`).join('\n')}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const key = (k: string): string => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : lit(k));
  return `{\n${entries.map(([k, v]) => `${inner}${key(k)}: ${lit(v, inner)},`).join('\n')}\n${indent}}`;
}

function sectionScopes(info: KeyInfo | undefined): readonly string[] {
  return info?.scopes ?? SCOPES;
}

/** The generated file's full text. Pure, so the check and the tests can call it. */
export function renderPermissionKeys(catalogues: readonly AnyCatalogue[] = ALL_CATALOGUES): string {
  const keys = describeKeys(catalogues);
  const byKey = new Map(keys.map((k) => [k.key, k]));

  const labels: Record<string, string> = {};
  for (const k of keys) labels[k.key] = k.label;

  const moduleKeys: Record<string, string[]> = {};
  for (const cat of catalogues) moduleKeys[cat.module] = [];
  for (const k of keys) if (k.kind !== 'pick') moduleKeys[k.module]!.push(k.key);

  const catalogue = catalogues.map((cat) => {
    const seeAmounts =
      'seeAmounts' in cat && cat.seeAmounts
        ? { key: `${cat.module}.${RESERVED_SECTION}.see`, label: byKey.get(`${cat.module}.${RESERVED_SECTION}.see`)!.label }
        : null;
    return {
      key: cat.module,
      label: cat.label,
      // Kit 40.3 rule 13: the access module is shown only on Admin's read-only editor.
      adminOnly: cat.module === RESERVED_MODULE,
      seeAmounts,
      sections: cat.sections.map((section) => {
        const pickKey = section.pick ? `${cat.module}.${section.key}.${PICK_ACTION}` : null;
        const firstAction = section.actions[0] ? byKey.get(`${cat.module}.${section.key}.${section.actions[0].key}`) : undefined;
        return {
          key: section.key,
          label: section.label,
          scopes: [...sectionScopes(firstAction)],
          pick: pickKey,
          pickForEveryone: Boolean(section.pick?.everyone),
          actions: section.actions.map((action) => ({
            key: `${cat.module}.${section.key}.${action.key}`,
            short: action.short,
            label: action.label,
            needs: (action.needs ?? []).map((need) =>
              'amounts' in need
                ? { amounts: `${cat.module}.${RESERVED_SECTION}.see` }
                : { pick: `${need.pick}.${PICK_ACTION}`, scope: need.scope ?? 'same' },
            ),
          })),
        };
      }),
    };
  });

  const union = keys.map((k) => `  | '${k.key}'`).join('\n');
  const modules = catalogues.map((c) => `'${c.module}'`).join(' | ');

  return `/**
 * GENERATED by \`npm run access:keys\` in backend/, from
 * backend/src/access/catalogue. DO NOT EDIT BY HAND: edit the catalogue
 * and run the script again. \`npm run access:keys -- --check\` fails when
 * this file is stale (access plan 9.1, A6).
 *
 * GET /auth/me carries only keys and scopes (R3). Everything a screen
 * says about a key, its label above all, comes from here.
 */

/** Stored scope values (R1). \`units\` is labelled "Selected sites" on screen. */
export type Scope = ${SCOPES.map((s) => `'${s}'`).join(' | ')}

export const SCOPES: readonly Scope[] = ${lit([...SCOPES])}

/** Every permission key, three parts each: module.section.action. */
export type PermissionKey =
${union}

export const PERMISSION_KEYS: readonly PermissionKey[] = ${lit(keys.map((k) => k.key))}

/**
 * Each key's label: the words reasonFor builds its sentence from,
 * "Only people allowed to <label> can do this." (kit 26.2).
 */
export const PERMISSION_LABELS: Readonly<Record<PermissionKey, string>> = ${lit(labels)}

export type ModuleKey = ${modules}

/** Each module's keys other than Picks. A module shows when the user holds any of them. */
export const MODULE_KEYS: Readonly<Record<ModuleKey, readonly PermissionKey[]>> = ${lit(moduleKeys)}

/** A Pick the action needs, at the needing permission's scope ('same') or a fixed one. */
export type CatalogueNeed =
  | { readonly pick: PermissionKey; readonly scope: 'same' | 'all' }
  | { readonly amounts: PermissionKey }

export interface CatalogueAction {
  readonly key: PermissionKey
  /** The role grid's column name (kit 40.3 rule 10). */
  readonly short: string
  readonly label: string
  readonly needs: readonly CatalogueNeed[]
}

export interface CatalogueSection {
  readonly key: string
  readonly label: string
  /** The scopes the role grid offers for this section (kit 40.4 rule 3). */
  readonly scopes: readonly Scope[]
  /** This section's Pick key, when it has one. */
  readonly pick: PermissionKey | null
  /** Every active user holds this Pick at All; the screens never mention it. */
  readonly pickForEveryone: boolean
  readonly actions: readonly CatalogueAction[]
}

export interface CatalogueModule {
  readonly key: ModuleKey
  readonly label: string
  /** Shown only on Admin's read-only role editor (kit 40.3 rule 13). */
  readonly adminOnly: boolean
  readonly seeAmounts: { readonly key: PermissionKey; readonly label: string } | null
  readonly sections: readonly CatalogueSection[]
}

/** Modules, sections and actions in catalogue order, for the role editor. */
export const CATALOGUE: readonly CatalogueModule[] = ${lit(catalogue)}
`;
}

function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function main(argv: readonly string[]): number {
  const check = argv.includes('--check');
  const path = generatedPath();
  const next = renderPermissionKeys();
  if (check) {
    if (!existsSync(path)) {
      process.stderr.write(`access:keys --check: ${path} does not exist. Run npm run access:keys.\n`);
      return 1;
    }
    if (normalise(readFileSync(path, 'utf8')) !== normalise(next)) {
      process.stderr.write(
        `access:keys --check: ${path} is stale. Run npm run access:keys in backend/ and commit the result.\n`,
      );
      return 1;
    }
    process.stdout.write(`access:keys --check: ${path} is current.\n`);
    return 0;
  }
  writeFileSync(path, next, 'utf8');
  process.stdout.write(`access:keys: wrote ${path}.\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
