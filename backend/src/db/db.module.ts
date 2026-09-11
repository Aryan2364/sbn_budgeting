import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

import { getPool } from './pool';

export const PG_POOL = 'PG_POOL';

/**
 * One pool for the process. Global so that no module has to import a
 * database module to read from the database.
 */
@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: (): Pool => getPool() }],
  exports: [PG_POOL],
})
export class DbModule {}
