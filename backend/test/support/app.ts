import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';

import { enableQueryGuard, type GuardMode } from './query-guard';
import { prepareTestEnv } from './test-env';
import { installTestTx, testTxMiddleware } from './test-tx';

/**
 * The real application, booted in-process for the harness.
 *
 * It is AppModule exactly as production builds it: the same guards
 * (APP_GUARD), controllers, pipes and exception handling. Only three
 * things are added, all outside src/:
 *   - the pool singleton is patched for transaction-per-request
 *     (test-tx.ts), so every case is rolled back;
 *   - the body parsers are registered explicitly, BEFORE the
 *     transaction middleware, with the options Nest would use itself.
 *     (A body parser calls `next` from a stream callback, which would
 *     drop the request's AsyncLocalStorage context. Nest sees its
 *     parsers already applied and does not add them twice.);
 *   - it listens on a random local port.
 *
 * main.ts's setup (global prefix and ValidationPipe) is mirrored below.
 * `assertMainTsUnchanged` fails loudly if main.ts changes, so the
 * mirror cannot drift silently.
 */

export const GLOBAL_PREFIX = 'api';

const VALIDATION_OPTIONS = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
  transformOptions: { enableImplicitConversion: false },
} as const;

/** The lines of main.ts the harness mirrors. */
const MAIN_TS_EXPECTS = [
  "app.setGlobalPrefix('api');",
  'transform: true,',
  'whitelist: true,',
  'forbidNonWhitelisted: false,',
  'transformOptions: { enableImplicitConversion: false },',
];

function srcDir(): string {
  // test/support -> ../../src ; dist-test/test/support -> ../../../src
  for (const candidate of [
    resolve(__dirname, '..', '..', 'src'),
    resolve(__dirname, '..', '..', '..', 'src'),
  ]) {
    try {
      readFileSync(resolve(candidate, 'main.ts'));
      return candidate;
    } catch {
      // next
    }
  }
  throw new Error(`Could not find src/main.ts from ${__dirname}`);
}

export function assertMainTsUnchanged(): void {
  const main = readFileSync(resolve(srcDir(), 'main.ts'), 'utf8');
  const missing = MAIN_TS_EXPECTS.filter((line) => !main.includes(line));
  const pipes = main.match(/useGlobal(Pipes|Guards|Interceptors|Filters)\(/g) ?? [];
  if (missing.length > 0 || pipes.length !== 1 || /app\.use\(/.test(main)) {
    throw new Error(
      'src/main.ts no longer matches what test/support/app.ts mirrors ' +
        `(missing: ${missing.join(' | ') || 'none'}; global hooks: ${pipes.join(', ')}). ` +
        'Update the harness bootstrap to match main.ts before trusting its results.',
    );
  }
}

export interface HarnessApp {
  app: INestApplication;
  baseUrl: string;
  mintToken(user: { id: string; name: string }): string;
  close(): Promise<void>;
}

export interface DiscoveredRoute {
  method: string;
  /** Full path template, e.g. `/api/complaints/:id/start`. */
  path: string;
  controller: string;
  handler: string;
  /**
   * The module of the key the handler's access declaration names
   * (`@Can('budget.x.y')` -> 'budget', `@PickOf('platform.people')` ->
   * 'platform'), or null for @SignedIn, @Public and undeclared handlers.
   * Read by the shadow classification (equivalence/intended.ts).
   */
  declaredModule: string | null;
}

function declaredModuleOf(handler: object): string | null {
  // Loaded lazily, like everything from src/, after the environment is set.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { declarationsOf } = require('../../src/access/decorators') as typeof import('../../src/access/decorators');
  const d = declarationsOf(handler)[0];
  if (!d || d.kind === 'signedIn') return null;
  const key = d.kind === 'pickOf' ? d.section : d.keys[0];
  return key?.split('.')[0] ?? null;
}

/**
 * The query guard's mode for the app's pool (access plan 6.1.4). 'record'
 * (the default) never changes an answer: it lists the statements that
 * read a guarded table with no scope marker, for the run's report.
 * P3b's harness run switches to 'throw' once every read is scoped.
 */
export interface HarnessOptions {
  queryGuard?: GuardMode;
}

let guardEnabled = false;

export async function startHarnessApp(options: HarnessOptions = {}): Promise<HarnessApp> {
  prepareTestEnv();
  assertMainTsUnchanged();
  if (!guardEnabled) {
    enableQueryGuard(options.queryGuard ?? 'throw');
    guardEnabled = true;
  }

  // Loaded only now, after the environment is in place.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPool } = require('../../src/db/pool') as typeof import('../../src/db/pool');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../../src/app.module') as typeof import('../../src/app.module');

  installTestTx(getPool());

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe(VALIDATION_OPTIONS));
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.use(testTxMiddleware());
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;
  const jwt = app.get(JwtService);

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    mintToken: (user) => jwt.sign({ sub: user.id, name: user.name }),
    close: async () => {
      await app.close();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pool = require('../../src/db/pool') as typeof import('../../src/db/pool');
      await pool.closePool();
    },
  };
}

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

function joinPath(...parts: string[]): string {
  const joined = parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${joined}`;
}

/**
 * Every route the app serves, read from Nest's own metadata (the same
 * metadata its router is built from). Sorted, so two builds can be
 * compared line by line.
 */
export function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  const modules = app.get(ModulesContainer);
  const routes: DiscoveredRoute[] = [];
  for (const mod of modules.values()) {
    for (const wrapper of mod.controllers.values()) {
      const metatype = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!metatype) continue;
      const rawBase = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
      const bases = Array.isArray(rawBase) ? rawBase : [rawBase ?? ''];
      const proto = metatype.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const handler = proto[name];
        if (typeof handler !== 'function') continue;
        const rawPath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (rawPath === undefined || method === undefined) continue;
        const paths = Array.isArray(rawPath) ? rawPath : [rawPath];
        for (const base of bases) {
          for (const p of paths) {
            routes.push({
              method: METHOD_NAME[method] ?? String(method),
              path: joinPath(GLOBAL_PREFIX, base, p),
              controller: metatype.name,
              handler: name,
              declaredModule: declaredModuleOf(handler),
            });
          }
        }
      }
    }
  }
  const seen = new Set<string>();
  return routes
    .filter((r) => {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
}
