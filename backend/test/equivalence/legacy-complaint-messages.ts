/**
 * A FROZEN copy of the English sentences the baseline build put in
 * successful complaint bodies, for intended difference D12 (owner
 * decision, 7 Oct 2026: the Complaints area speaks Gujarati). Test-only,
 * and never edited to follow the live code: like
 * legacy-complaint-actions.ts, it is a record of what the old build said.
 *
 * The run rebuilds a body with these words (matrix.ts `legacyDigest`) and
 * D12 matches only when that rebuilt body is the baseline's exactly, so
 * nothing but the words may have changed.
 */

/** `GET /complaints/sites` row `reason` (src/complaints/routing.ts before D12). */
export function legacyNoSupervisorReason(siteName: string): string {
  return `${siteName} has no supervisor who can sign in yet, so this complaint would reach nobody. Ask a budget administrator to set one on the site.`;
}

interface SiteRow {
  name: string;
  reason: string | null;
}

/**
 * The site picker's body as the baseline build sent it: each row's
 * `reason` in the old English. Null when the body is not the picker's
 * shape, or when no reason changed (nothing to rebuild).
 */
export function legacySitesBody(body: unknown): unknown | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  let changed = false;
  const rows = data.map((row: SiteRow) => {
    if (!row || typeof row !== 'object' || row.reason === null || typeof row.name !== 'string') return row;
    const old = legacyNoSupervisorReason(row.name);
    if (old === row.reason) return row;
    changed = true;
    return { ...row, reason: old };
  });
  return changed ? { ...(body as object), data: rows } : null;
}
