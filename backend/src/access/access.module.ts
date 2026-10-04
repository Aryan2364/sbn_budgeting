import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AccessBootGuard } from './boot-guard';
import { RoleMapService } from './role-map.service';

/**
 * The access runtime (access plan 6.1.1-6.1.3): the in-memory role map,
 * read by JwtAuthGuard on every request, and boot validation. Global so
 * the auth guard and later the access API can inject the role map.
 *
 * PermissionGuard is registered in AppModule as an APP_GUARD, between
 * JwtAuthGuard and ModuleAccessGuard, so the guard order is visible in
 * one place.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [RoleMapService, AccessBootGuard],
  exports: [RoleMapService],
})
export class AccessModule {}
