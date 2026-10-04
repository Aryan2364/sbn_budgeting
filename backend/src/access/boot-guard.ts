import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService } from '@nestjs/core';

import { IS_PUBLIC } from '../common/public.decorator';
import {
  PICK_ACTION,
  assertCataloguesValid,
  describeKeys,
  isPermissionKey,
} from './catalogue';
import { type AccessDeclaration, declarationsOf, inHandlerKeysOf } from './decorators';

/**
 * Boot validation (access plan 6.1.3, backend kit 3.6). Runs before the
 * server accepts a request and refuses to start, listing every
 * offender, when:
 *   - the catalogues are invalid (validateCatalogues);
 *   - a handler carries several of the five declarations;
 *   - a declaration names a key, or a Pick, no catalogue declares;
 *   - once P2b has decorated every route: a handler carries none;
 *   - once the Pick routes exist (P3b): a needed Pick has no @PickOf route.
 * It warns when a catalogue action is used by no route (strict mode only;
 * before P2b every action is unused).
 *
 * The same `checkRoutes` runs as a node:test test (test/access/boot.test.ts).
 * This is the route check only. The scope check is the test-time query
 * guard plus a grep (R11.12); there is no list registry.
 */

/**
 * On since the P2b integration: every handler carries its declaration,
 * so a handler with none refuses to boot (backend kit 3.6 rule 2).
 */
export const REQUIRE_DECLARATION_ON_EVERY_ROUTE: boolean = true;

/** P3b turns this on once the /pick/<module>/<section> routes exist. */
export const REQUIRE_PICK_ROUTES = true;

export interface RouteHandler {
  /** "GET /auth/me", for messages. */
  route: string;
  isPublic: boolean;
  declarations: readonly AccessDeclaration[];
  /** Keys checked inside the handler (`@AlsoChecks`), not declarations. */
  inHandlerKeys?: readonly string[];
}

export interface RouteCheckOptions {
  requireDeclarations: boolean;
  requirePickRoutes: boolean;
}

export interface RouteCheck {
  errors: string[];
  warnings: string[];
  /** Handlers with no declaration (an error in strict mode). */
  undeclared: string[];
}

/** Pure. Every problem with the routes' declarations, one plain line each. */
export function checkRoutes(handlers: readonly RouteHandler[], options: RouteCheckOptions): RouteCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const undeclared: string[] = [];
  const usedKeys = new Set<string>();
  const pickRoutes = new Set<string>();

  for (const h of handlers) {
    const count = h.declarations.length + (h.isPublic ? 1 : 0);
    if (count === 0) {
      undeclared.push(h.route);
      if (options.requireDeclarations) {
        errors.push(`${h.route} carries none of @Public, @SignedIn, @Can, @CanAny or @PickOf.`);
      }
    } else if (count > 1) {
      errors.push(`${h.route} carries ${count} access declarations; it must carry exactly one.`);
    }

    for (const d of h.declarations) {
      if (d.kind === 'can' || d.kind === 'canAny') {
        if (d.keys.length === 0) errors.push(`${h.route} declares @CanAny with no keys.`);
        for (const key of d.keys) {
          if (!isPermissionKey(key)) errors.push(`${h.route} names "${key}", which no catalogue declares.`);
          usedKeys.add(key);
        }
      } else if (d.kind === 'pickOf') {
        const key = `${d.section}.${PICK_ACTION}`;
        if (!isPermissionKey(key)) {
          errors.push(`${h.route} declares @PickOf('${d.section}'), a Pick no catalogue declares.`);
        }
        pickRoutes.add(d.section);
      }
    }
    for (const key of h.inHandlerKeys ?? []) {
      if (!isPermissionKey(key)) errors.push(`${h.route} checks "${key}" inside, which no catalogue declares.`);
      usedKeys.add(key);
    }
  }

  const keys = describeKeys();
  if (options.requirePickRoutes) {
    const needed = new Set<string>();
    for (const k of keys) {
      if (k.kind === 'pick' && k.section?.pick?.everyone) needed.add(k.key.slice(0, -(PICK_ACTION.length + 1)));
      for (const need of k.needs) if ('pick' in need) needed.add(need.pick);
    }
    for (const section of [...needed].sort()) {
      if (!pickRoutes.has(section)) errors.push(`The Pick of "${section}" is needed but has no @PickOf route.`);
    }
  }

  if (options.requireDeclarations) {
    for (const k of keys) {
      if (k.kind !== 'action' && k.kind !== 'access') continue;
      if (!usedKeys.has(k.key)) warnings.push(`"${k.key}" is used by no route: ticking it does nothing.`);
    }
  }

  return { errors, warnings, undeclared };
}

const METHOD_NAMES = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function joinPath(...parts: string[]): string {
  return `/${parts.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
}

/** Every route handler of the running app, with its declarations. */
export function collectRouteHandlers(discovery: DiscoveryService): RouteHandler[] {
  const out: RouteHandler[] = [];
  for (const wrapper of discovery.getControllers()) {
    const metatype = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
    if (!metatype) continue;
    const base = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
    const classPublic = Reflect.getMetadata(IS_PUBLIC, metatype) === true;
    const proto = metatype.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (method === undefined || path === undefined) continue;
      const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');
      out.push({
        route: `${METHOD_NAMES[method] ?? method} ${joinPath(first(base), first(path))} (${metatype.name}.${name})`,
        isPublic: classPublic || Reflect.getMetadata(IS_PUBLIC, handler) === true,
        declarations: declarationsOf(handler),
        inHandlerKeys: inHandlerKeysOf(handler),
      });
    }
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

@Injectable()
export class AccessBootGuard implements OnApplicationBootstrap {
  private readonly logger = new Logger('Access');

  constructor(private readonly discovery: DiscoveryService) {}

  onApplicationBootstrap(): void {
    assertCataloguesValid();
    const result = checkRoutes(collectRouteHandlers(this.discovery), {
      requireDeclarations: REQUIRE_DECLARATION_ON_EVERY_ROUTE,
      requirePickRoutes: REQUIRE_PICK_ROUTES,
    });
    if (result.errors.length > 0) {
      throw new Error(`Access boot validation failed:\n  - ${result.errors.join('\n  - ')}`);
    }
    for (const w of result.warnings) this.logger.warn(w);
    if (!REQUIRE_DECLARATION_ON_EVERY_ROUTE && result.undeclared.length > 0) {
      this.logger.log(
        `${result.undeclared.length} routes carry no access declaration yet; the old module guard decides them until P2b.`,
      );
    }
  }
}
