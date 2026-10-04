import { Module } from '@nestjs/common';

import { BudgetPickController } from './budget-pick.controller';
import { ComplaintsPickController } from './complaints-pick.controller';
import { PlatformPickController } from './platform-pick.controller';

/**
 * The Pick endpoints (access plan 6.1.4 item 7, R11.7): one controller
 * per module under `/pick`, `GET /pick/<module>/<section>?q=`, each
 * route `@PickOf('<module>.<section>')` and served by `runPickQuery`
 * (pick-query.ts).
 *
 * P3a ships the module empty. Each P3b lane adds its own controller here
 * (pick/budget-pick.controller.ts, complaints-pick.controller.ts,
 * platform-pick.controller.ts), only for sections some permission needs
 * or everyone picks, and P3b turns on boot-guard's REQUIRE_PICK_ROUTES
 * once all needed Picks have a route.
 *
 * Routes under `/pick` are decided by the PermissionGuard (@PickOf).
 */
@Module({
  controllers: [PlatformPickController, ComplaintsPickController, BudgetPickController],
})
export class PickModule {}
