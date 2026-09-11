import { Module } from '@nestjs/common';

import { CostHeadsController } from './cost-heads.controller';

@Module({ controllers: [CostHeadsController] })
export class CostHeadsModule {}
