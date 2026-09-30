import { Module } from '@nestjs/common';

import { DesignationsController } from './designations.controller';

@Module({ controllers: [DesignationsController] })
export class DesignationsModule {}
