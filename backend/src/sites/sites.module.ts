import { Module } from '@nestjs/common';

import { SitesController } from './sites.controller';

@Module({ controllers: [SitesController] })
export class SitesModule {}
