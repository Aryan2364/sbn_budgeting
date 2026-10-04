import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AccessModule } from './access/access.module';
import { AmountsInterceptor } from './access/amounts.interceptor';
import { PermissionGuard } from './access/permission.guard';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { BudgetsModule } from './budgets/budgets.module';
import { ComplaintCategoriesModule } from './complaint-categories/complaint-categories.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { CostHeadsModule } from './cost-heads/cost-heads.module';
import { DesignationsModule } from './designations/designations.module';
import { DbModule } from './db/db.module';
import { ExpensesModule } from './expenses/expenses.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PickModule } from './pick/pick.module';
import { ProjectsModule } from './projects/projects.module';
import { SitesModule } from './sites/sites.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AccessModule,
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
    PickModule,
  ],
  providers: [
    // Authentication is ON by default. A route opts out with @Public(),
    // never the other way round, so an endpoint nobody remembered to
    // guard is guarded.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Access plan P9: the permission guard decides every route from the
    // route's one declaration (@SignedIn, @Can, @CanAny, @PickOf). Which
    // records is decided in the data query (access/scope.ts).
    { provide: APP_GUARD, useClass: PermissionGuard },
    // Access plan P4 (6.1.6): without <module>.amounts.see, amount-only
    // routes are refused and amounts are removed from every response.
    { provide: APP_INTERCEPTOR, useClass: AmountsInterceptor },
  ],
})
export class AppModule {}
