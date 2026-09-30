import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ModuleAccessGuard } from './auth/module-access.guard';
import { BudgetsModule } from './budgets/budgets.module';
import { ComplaintCategoriesModule } from './complaint-categories/complaint-categories.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { CostHeadsModule } from './cost-heads/cost-heads.module';
import { DesignationsModule } from './designations/designations.module';
import { DbModule } from './db/db.module';
import { ExpensesModule } from './expenses/expenses.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
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
    DesignationsModule,
    BudgetsModule,
    ExpensesModule,
    ReportsModule,
    ComplaintCategoriesModule,
    ComplaintsModule,
    NotificationsModule,
  ],
  providers: [
    // Authentication is ON by default. A route opts out with @Public(),
    // never the other way round, so an endpoint nobody remembered to
    // guard is guarded.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
export class AppModule {}
