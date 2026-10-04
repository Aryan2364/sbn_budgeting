import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';

import { VARIANCE_AMOUNT_KEYS } from '../reports/variance.service';
import { type AccessContext, can } from './access-context';
import { MODULE_CATALOGUES, RESERVED_SECTION, keyInfo, type PermissionKey } from './catalogue';
import { declarationsOf } from './decorators';
import { reasonFor } from './permission.guard';

/**
 * See amounts (access plan 6.1.6; DECISIONS 9; R10; O9; backend kit 9.2).
 *
 * Runs globally, after the route guards. For a caller who lacks a
 * module's `<module>.amounts.see`, on a route of that module:
 *
 * 1. **Amount-only routes are unreachable.** A route whose declared key
 *    needs see amounts in the catalogue (budgets view and edit, reports
 *    view, expense create and edit) is refused, 403 `{ error:
 *    'forbidden', permission: '<module>.amounts.see', reason }`. A role
 *    save always derives see amounts with those keys (O9), so this only
 *    bites if the dependency is somehow missing, and then nothing leaks.
 * 2. **Amounts are absent everywhere else.** Every key ending in a
 *    declared suffix (`Paise`) and every declared key (the catalogue's
 *    `stripKeys` plus the figures the variance service derives from
 *    amounts) is deep-removed from the response: nested objects, list
 *    rows and `aggregates` included. Removed, never null, zero or
 *    "Hidden" (R10). One shared serializer, driven by the catalogue;
 *    no handler strips its own.
 *
 * The query half (a sort, filter or search on an amount) is
 * runListQuery's `amountKeys` refusal and the variance report's own
 * sort check: stripping alone would still let the row ORDER leak.
 *
 * Exports are built in the browser from these responses, so they
 * inherit the removal; a future server-side export goes through here.
 *
 * Which module a route belongs to comes from its one declaration's key.
 * A route with no module (`@SignedIn`, or none) gets every module's
 * removal the caller lacks: defensive, and such routes carry no amounts.
 *
 * A caller who holds see amounts gets the handler's response object
 * untouched, so today's users (every mapped budget role holds it) see
 * exactly what they saw before (plan 5.4, 6.3).
 */

export interface AmountRule {
  module: string;
  /** `<module>.amounts.see` */
  key: PermissionKey;
  suffixes: readonly string[];
  keys: ReadonlySet<string>;
}

/** Figures derived from amounts that carry no amount suffix, per module. */
const DERIVED_AMOUNT_KEYS: Readonly<Record<string, readonly string[]>> = {
  budget: VARIANCE_AMOUNT_KEYS,
};

/** One rule per module whose catalogue declares see amounts. */
export const AMOUNT_RULES: readonly AmountRule[] = MODULE_CATALOGUES.flatMap((cat) =>
  cat.seeAmounts
    ? [
        {
          module: cat.module,
          key: `${cat.module}.${RESERVED_SECTION}.see` as PermissionKey,
          suffixes: cat.seeAmounts.stripSuffixes,
          keys: new Set([...cat.seeAmounts.stripKeys, ...(DERIVED_AMOUNT_KEYS[cat.module] ?? [])]),
        },
      ]
    : [],
);

/** The modules a handler's declaration names. Empty = no module (`@SignedIn`, or none). */
export function modulesOf(handler: object): string[] {
  const modules = new Set<string>();
  for (const d of declarationsOf(handler)) {
    if (d.kind === 'can' || d.kind === 'canAny') for (const k of d.keys) modules.add(k.split('.')[0]!);
    else if (d.kind === 'pickOf') modules.add(d.section.split('.')[0]!);
  }
  return [...modules];
}

/** The see-amounts rules that apply to this handler for a caller who lacks them. */
export function rulesFor(handler: object, ctx: AccessContext): AmountRule[] {
  const modules = modulesOf(handler);
  return AMOUNT_RULES.filter(
    (rule) => (modules.length === 0 || modules.includes(rule.module)) && !can(ctx, rule.key),
  );
}

/** True when the key's catalogue entry needs its module's see amounts (O9). */
export function needsAmounts(key: string): boolean {
  return (keyInfo(key)?.needs ?? []).some((need) => 'amounts' in need);
}

/**
 * The see-amounts key a route is refused for, or null. A `@Can` key that
 * needs see amounts is refused without it; a `@CanAny` only when every
 * key the caller holds needs it (any other held key is usable as is).
 */
export function amountRefusal(handler: object, ctx: AccessContext): PermissionKey | null {
  const lacking = new Map(AMOUNT_RULES.filter((r) => !can(ctx, r.key)).map((r) => [r.module, r.key]));
  if (lacking.size === 0) return null;
  for (const d of declarationsOf(handler)) {
    if (d.kind !== 'can' && d.kind !== 'canAny') continue;
    const held = d.keys.filter((k) => can(ctx, k));
    const usable = (held.length ? held : d.keys).filter(
      (k) => !(needsAmounts(k) && lacking.has(k.split('.')[0]!)),
    );
    if (usable.length === 0) {
      const first = d.keys.find((k) => needsAmounts(k) && lacking.has(k.split('.')[0]!))!;
      return lacking.get(first.split('.')[0]!)!;
    }
  }
  return null;
}

function isAmountKey(key: string, rules: readonly AmountRule[]): boolean {
  return rules.some((r) => r.keys.has(key) || r.suffixes.some((s) => key.endsWith(s)));
}

function isOpaque(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof StreamableFile ||
    Buffer.isBuffer(value) ||
    ArrayBuffer.isView(value) ||
    typeof (value as { pipe?: unknown }).pipe === 'function'
  );
}

/**
 * The value with every amount key removed, at any depth, exactly as
 * JSON.stringify would see it (own enumerable keys, `toJSON` honoured).
 * Never mutates the input. Dates, buffers and streams pass through.
 */
export function stripAmounts(value: unknown, rules: readonly AmountRule[]): unknown {
  if (rules.length === 0 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stripAmounts(item, rules));
  if (isOpaque(value)) return value;
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') return stripAmounts((toJSON as () => unknown).call(value), rules);
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (isAmountKey(key, rules)) continue;
    out[key] = stripAmounts(inner, rules);
  }
  return out;
}

@Injectable()
export class AmountsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const access = context.switchToHttp().getRequest<{ access?: AccessContext }>().access;
    // A @Public() route has no caller and no amounts.
    if (!access) return next.handle();

    const handler = context.getHandler();
    const refusedFor = amountRefusal(handler, access);
    if (refusedFor) {
      const reason = reasonFor(refusedFor);
      throw new ForbiddenException({ error: 'forbidden', permission: refusedFor, reason, message: reason });
    }

    const rules = rulesFor(handler, access);
    if (rules.length === 0) return next.handle();
    return next.handle().pipe(map((body) => stripAmounts(body, rules)));
  }
}
