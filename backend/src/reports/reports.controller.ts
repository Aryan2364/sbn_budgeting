import { Controller, Get, Query } from '@nestjs/common';

import { type AccessContext, CurrentAccess } from '../access/access-context';
import { Can } from '../access/decorators';
import { ListQueryDto } from '../common/list-query.dto';
import { VarianceService, type DashboardSummary } from './variance.service';

@Controller('reports/variance')
export class ReportsController {
  constructor(private readonly variance: VarianceService) {}

  /** Everything the dashboard needs, summed in SQL, in one request. */
  @Get('summary')
  @Can('budget.reports.view')
  summary(@CurrentAccess() access: AccessContext): Promise<DashboardSummary> {
    return this.variance.dashboard(access);
  }

  /**
   * Phase 7b, Report 1. Year-wise budget against variance.
   *
   * Five rows, one per period, scoped to a project by default and
   * narrowed by a site. Client instruction, 7 Sep 2026.
   */
  @Get('periods-summary')
  @Can('budget.reports.view')
  periodsSummary(
    @CurrentAccess() access: AccessContext,
    @Query('projectId') projectId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.variance.periods(access, { projectId, siteId });
  }

  /**
   * Phase 7b, Report 2. Head-wise, year-wise budget against variance.
   *
   * Nineteen head rows, five period columns and a row total. Same
   * project scope and site filter as Report 1. Client instruction,
   * 7 Sep 2026.
   */
  @Get('head-periods')
  @Can('budget.reports.view')
  headPeriods(
    @CurrentAccess() access: AccessContext,
    @Query('projectId') projectId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.variance.headPeriods(access, { projectId, siteId });
  }

  /** Screen 1. All sites, all-time, no filter of any kind on the period. */
  @Get()
  @Can('budget.reports.view')
  sites(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
    @Query('projectId') projectId?: string,
    @Query('managerId') managerId?: string,
  ) {
    return this.variance.sites(access, { ...query, projectId, managerId });
  }
}
