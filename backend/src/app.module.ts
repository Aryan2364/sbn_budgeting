import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { BudgetsModule } from './budgets/budgets.module';
import { CostHeadsModule } from './cost-heads/cost-heads.module';
import { DbModule } from './db/db.module';
import { ExpensesModule } from './expenses/expenses.module';
import { LocationsModule } from './locations/locations.module';
import { ProjectsModule } from './projects/projects.module';
import { SitesModule } from './sites/sites.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    UsersModule,
    CostHeadsModule,
    ProjectsModule,
    SitesModule,
    LocationsModule,
    BudgetsModule,
    ExpensesModule,
    ReportsModule,
  ],
  providers: [
    // Authentication is ON by default. A route opts out with @Public(),
    // never the other way round, so an endpoint nobody remembered to
    // guard is guarded.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
