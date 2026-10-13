import { Module } from '@nestjs/common';

import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Phone notifications (web push). One PushService for the app: the
 * complaints module imports this module to push after its actions.
 */
@Module({ controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
