import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { AccessBootGuard } from './boot-guard';
import { RoleMapService } from './role-map.service';

/**
 * The access runtime (access plan 6.1.1-6.1.3): the in-memory role map,
 * read by JwtAuthGuard on every request, and boot validation. Global so
 * the auth guard and the access API can inject the role map.
 *
 * P6: the access API (AccessController). AccessService is exported so
 * the people form and the import make their access writes through it
 * (plan 6.1.11).
 *
 * PermissionGuard is registered in AppModule as an APP_GUARD, between
 * JwtAuthGuard and ModuleAccessGuard, so the guard order is visible in
 * one place.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [AccessController],
  providers: [RoleMapService, AccessBootGuard, AccessService],
  exports: [RoleMapService, AccessService],
})
export class AccessModule {}
