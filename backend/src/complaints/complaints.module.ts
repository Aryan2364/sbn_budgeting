import { Module } from '@nestjs/common';

import { PushModule } from '../push/push.module';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';
import { initPhotoStorage } from './photo-storage';

// PushModule: phone notifications after raise, resolve and reassign.
@Module({ imports: [PushModule], controllers: [ComplaintsController], providers: [ComplaintsService] })
export class ComplaintsModule {
  /**
   * Chooses where photos are stored (R2 or disk) while the app is being
   * built, so a half-configured R2 stops startup with a clear message
   * instead of failing the first raise.
   */
  constructor() {
    initPhotoStorage();
  }
}
