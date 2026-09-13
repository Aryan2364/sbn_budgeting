import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { ListQueryDto } from '../common/list-query.dto';
import {
  PERIODS,
  VarianceService,
  type DashboardSummary,
  type VarianceRow,
} from './variance.service';

@Controller('reports/variance')
export class ReportsController {
  constructor(private readonly variance: VarianceService) {}

  /** Everything the dashboard needs, summed in SQL, in one request. */
  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.variance.dashboard();
  }

  /** The period labels, so the client never restates them. */
  @Get('periods')
  periods(): { value: number; label: string }[] {
    return PERIODS.map((label, value) => ({ value, label }));
  }

  /**
   * Phase 7b, Report 1. Year-wise budget against variance.
   *
   * Five rows, one per period, scoped to a project by default and
   * narrowed by a site. Client instruction, 7 Sep 2026.
   */
  @Get('periods-summary')
  periodsSummary(
    @Query('projectId') projectId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.variance.periods({ projectId, siteId });
  }

  /**
   * Phase 7b, Report 2. Head-wise, year-wise budget against variance.
   *
   * Nineteen head rows, five period columns and a row total. Same
   * project scope and site filter as Report 1. Client instruction,
   * 7 Sep 2026.
   */
  @Get('head-periods')
  headPeriods(
    @Query('projectId') projectId?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.variance.headPeriods({ projectId, siteId });
  }

  /** Screen 1. All sites, all-time, no filter of any kind on the period. */
  @Get()
  sites(
    @Query() query: ListQueryDto,
    @Query('projectId') projectId?: string,
    @Query('managerId') managerId?: string,
  ) {
    return this.variance.sites({ ...query, projectId, managerId });
  }

  /**
   * Screen 2. One site, one row per cost head, plus the site total read
   * from the same view rather than added up here.
   *
   * The period goes to BOTH halves. Sending it to only the rows is
   * what put an all-time total over a single period's rows.
   */
  @Get('sites/:siteId')
  async site(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Query('period') period?: string,
  ): Promise<{ total: VarianceRow | null; rows: VarianceRow[]; period: number | null }> {
    const parsed = period === undefined || period === '' ? undefined : Number(period);
    const [rows, total] = await Promise.all([
      this.variance.siteHeads(siteId, parsed),
      this.variance.siteTotal(siteId, parsed),
    ]);
    return { total, rows, period: parsed ?? null };
  }
}
