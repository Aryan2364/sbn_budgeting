import { Module } from '@nestjs/common';

import { UsersImportController } from './users-import.controller';
import { UsersController } from './users.controller';

@Module({ controllers: [UsersImportController, UsersController] })
export class UsersModule {}
