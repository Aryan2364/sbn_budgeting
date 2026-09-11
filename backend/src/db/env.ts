import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The migrate and seed scripts run outside Nest, so they do not get
 * @nestjs/config's .env loading. Node's own loader does the job and
 * costs no dependency.
 */
export function loadEnv(): void {
  const file = resolve(__dirname, '..', '..', '.env');
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch {
    // Already loaded, or the runtime does not support it. Either way the
    // caller falls back to the real environment, which is what CI has.
  }
}
