/**
 * The shape of a module catalogue (access plan section 5.2).
 *
 * The catalogue is code only (R5): there is no permissions table, no
 * boot sync and no CHECK on keys. Each module ships one file in this
 * folder as a typed constant (`as const satisfies ModuleCatalogue`), so
 * every key is a TypeScript literal and a misspelt key fails to compile.
 *
 * Every key has three parts, `module.section.action` (kit 26.3):
 *   an action        budget.expenses.edit
 *   a Pick           budget.sites.pick        (implied, never listed)
 *   see amounts      budget.amounts.see       (module-wide)
 *   managing access  access.rights.manage     (the kit's own catalogue)
 */

/** Stored scope values (R1). On screen `units` is "Selected sites". */
export type Scope = 'own' | 'team' | 'units' | 'all';

export const SCOPES: readonly Scope[] = ['own', 'team', 'units', 'all'];

/** How a record maps to the site (decision 26, plan section 6.1.4). */
export type RecordType =
  | 'project'
  | 'site'
  | 'site_budget'
  | 'expense'
  | 'variance'
  | 'complaint'
  | 'person';

export type Need =
  /**
   * The Pick of another section, as 'module.section'. `scope` omitted =
   * the needing permission's scope (decision 12); 'all' = a wider scope
   * declared in code. There is no override screen.
   */
  | { readonly pick: string; readonly scope?: 'all' }
  /** O9: the module's '<module>.amounts.see', added with a notice like a Pick. */
  | { readonly amounts: true };

export interface ActionDef {
  /** 'edit' -> budget.expenses.edit */
  readonly key: string;
  /** 'edit expenses': feeds reasonFor and the role grid (kit 26.2). */
  readonly label: string;
  /** 'Edit': the grid's column name (kit 40.3 rule 10). */
  readonly short: string;
  readonly needs?: readonly Need[];
  /** Extra columns that make a record "mine" for THIS action only (complaint reassign). */
  readonly ownColumns?: readonly string[];
  /** The site a create is checked against comes from this action's Pick (O5 exception). */
  readonly createSiteFrom?: 'pick';
}

export interface SectionDef {
  /** 'expenses'. snake_case, unique in the module. 'amounts' is reserved. */
  readonly key: string;
  /** 'Expenses' */
  readonly label: string;
  readonly record: RecordType | 'master' | 'none';
  /**
   * Present only if some permission needs this section's Pick, or every
   * active user picks it (R11.7). Fields default to ['id', 'name'] and
   * are never an amount.
   */
  readonly pick?: { readonly fields?: readonly string[]; readonly everyone?: true };
  readonly actions: readonly ActionDef[];
}

/** The product's modules. 'access' is reserved for the kit's own catalogue. */
export type ProductModule = 'budget' | 'complaints' | 'platform';

export interface SeeAmountsDef {
  /** 'cost, budgets' -> "See amounts (cost, budgets)" (kit 40.3 rule 8). */
  readonly covers: string;
  /** Field-name suffixes stripped without see amounts: ['Paise']. */
  readonly stripSuffixes: readonly string[];
  /** Field names stripped without see amounts: ['spentPct', ...]. */
  readonly stripKeys: readonly string[];
}

export interface ModuleCatalogue {
  readonly module: ProductModule;
  readonly label: string;
  /** About 4-8 (decision 9). 'amounts' is a reserved section key. */
  readonly sections: readonly SectionDef[];
  /** The one see-amounts tick (decision 9, O9). Adds '<module>.amounts.see'. */
  readonly seeAmounts?: SeeAmountsDef;
}

/** The kit's own `access` catalogue: one module-wide key, access.rights.manage. */
export interface AccessCatalogue {
  readonly module: 'access';
  readonly label: string;
  readonly sections: readonly SectionDef[];
}

export type AnyCatalogue = ModuleCatalogue | AccessCatalogue;

// ---------------------------------------------------------------------
// Key types, derived from the catalogue constants.
// ---------------------------------------------------------------------

// Each helper takes the union as a type parameter, so the conditional
// distributes over every section and every action.
type ActionKeyOf<M extends string, K extends string, A> = A extends {
  readonly key: infer X extends string;
}
  ? `${M}.${K}.${X}`
  : never;

type ActionKeysOf<M extends string, S> = S extends {
  readonly key: infer K extends string;
  readonly actions: readonly (infer A)[];
}
  ? ActionKeyOf<M, K, A>
  : never;

type PickKeysOf<M extends string, S> = S extends {
  readonly key: infer K extends string;
  readonly pick: object;
}
  ? `${M}.${K}.pick`
  : never;

/** Every key a catalogue constant declares: actions, Picks and see amounts. */
export type CatalogueKeys<C> = C extends {
  readonly module: infer M extends string;
  readonly sections: readonly (infer S)[];
}
  ?
      | ActionKeysOf<M, S>
      | PickKeysOf<M, S>
      | (C extends { readonly seeAmounts: object } ? `${M}.amounts.see` : never)
  : never;
