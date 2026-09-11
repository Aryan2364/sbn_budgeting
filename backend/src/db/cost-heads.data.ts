/**
 * The 19 cost heads, from `Sadbhvana Budget Tracker.xlsx`, Budget sheet
 * rows 3 to 21. Plan section 2.1.
 *
 * ORDER IS DATA. It is the sheet's own order, it is not alphabetical,
 * and it is not arbitrary — it runs roughly in the order the work
 * happens on a site. It becomes `sort_order` 1 to 19 and it is what the
 * budget grid and the variance tab list rows in.
 *
 * SPELLING IS THE SHEET'S. "Miscellenous" is misspelled and is seeded
 * that way deliberately (plan section 3): it is what the people using
 * the sheet read and type today, and silently renaming a master while
 * importing their data is how an import stops reconciling. cost_heads
 * is admin-editable in Settings, so correcting it later is a row edit.
 *
 * WHITESPACE IS NOT SPELLING. Six of these carry a trailing space in
 * the sheet — "Tree cage ", "Nameplate ", "Sapling ",
 * "Sapling transport ", "Cowdung manure with transport ", "Plantation ".
 * They are trimmed here. A trailing space is invisible on screen and
 * breaks uniqueness and search; the sheet only depends on it because
 * its pivot joins on the text.
 */
export interface SeededCostHead {
  /**
   * Stable identity, set once and never shown. The seed matches on
   * this, not on `name`, so an admin who corrects "Miscellenous" in
   * Settings does not get it re-inserted on the next deploy.
   */
  seedKey: string;
  name: string;
}

export const COST_HEADS: readonly SeededCostHead[] = [
  { seedKey: 'site-cleaning-and-preparation', name: 'Site cleaning and preparation' },
  { seedKey: 'tree-bore', name: 'Tree bore' },
  { seedKey: 'tree-cage', name: 'Tree cage' },
  { seedKey: 'nameplate', name: 'Nameplate' },
  { seedKey: 'sapling', name: 'Sapling' },
  { seedKey: 'sapling-transport', name: 'Sapling transport' },
  { seedKey: 'cowdung-manure-with-transport', name: 'Cowdung manure with transport' },
  { seedKey: 'plantation', name: 'Plantation' },
  { seedKey: 'urea-humic', name: 'Urea / Humic' },
  { seedKey: 'tanker-fuel', name: 'Tanker Fuel' },
  { seedKey: 'tanker-team-salary', name: 'Tanker team salary' },
  { seedKey: 'tanker-maintenance', name: 'Tanker Maintenance' },
  { seedKey: 'tree-replacement', name: 'Tree Replacement' },
  { seedKey: 'wood-support', name: 'Wood Support' },
  { seedKey: 'repairing-team', name: 'Repairing Team' },
  { seedKey: 'irrigation', name: 'Irrigation' },
  { seedKey: 'miscellenous', name: 'Miscellenous' },
  { seedKey: 'supervisor', name: 'Supervisor' },
  { seedKey: 'manager', name: 'Manager' },
];
