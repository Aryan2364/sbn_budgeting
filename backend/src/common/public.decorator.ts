import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * Opts a route out of the global auth guard. Authentication is on by
 * default and switched off one route at a time, never the reverse — a
 * new endpoint that nobody remembered to guard is guarded.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC, true);
