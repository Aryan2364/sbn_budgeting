import { Module } from '@nestjs/common';

import { ReportsController } from './reports.controller';
import { VarianceService } from './variance.service';

@Module({
  controllers: [ReportsController],
  providers: [VarianceService],
  exports: [VarianceService],
})
export class ReportsModule {}
