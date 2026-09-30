import { Module } from '@nestjs/common';

import { ComplaintCategoriesController } from './complaint-categories.controller';

@Module({ controllers: [ComplaintCategoriesController] })
export class ComplaintCategoriesModule {}
