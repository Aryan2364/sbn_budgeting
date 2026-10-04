import {
  Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import type { Pool } from 'pg';

import { SignedIn } from '../access/decorators';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { PG_POOL } from '../db/db.module';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  complaintId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * The bell (CONTRACT section 3). Open to anyone signed in, and always
 * scoped to the caller: nobody reads or marks another person's
 * notifications, and trying looks exactly like the id not existing.
 *
 * Access plan P2b: every handler is declared SignedIn (plan 6.1.3, 6.2):
 * notifications are personal, so no permission key applies.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  // @SignedIn: the caller's own notifications only (where user_id = me).
  @SignedIn()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw?: string,
  ): Promise<{ items: NotificationItem[]; unreadCount: number }> {
    const parsed = Number(limitRaw ?? 20);
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.floor(parsed))) : 20;

    const [items, unread] = await Promise.all([
      this.pool.query<NotificationItem>(
        `select id, kind, title, body, complaint_id as "complaintId",
                read_at as "readAt", created_at as "createdAt"
         from notifications
         where user_id = $1
         order by created_at desc, id
         limit $2`,
        [user.id, limit],
      ),
      this.pool.query<{ n: number }>(
        `select count(*)::int as n from notifications where user_id = $1 and read_at is null`,
        [user.id],
      ),
    ]);
    return { items: items.rows, unreadCount: unread.rows[0]?.n ?? 0 };
  }

  @Post('read-all')
  // @SignedIn: marks only the caller's own notifications read.
  @SignedIn()
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.pool.query(
      `update notifications set read_at = now() where user_id = $1 and read_at is null`,
      [user.id],
    );
  }

  @Post(':id/read')
  // @SignedIn: one of the caller's own notifications; anyone else's is a 404.
  @SignedIn()
  @HttpCode(204)
  async read(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const { rowCount } = await this.pool.query(
      `update notifications set read_at = coalesce(read_at, now())
       where id = $1 and user_id = $2`,
      [id, user.id],
    );
    if (!rowCount) {
      throw new NotFoundException('That notification no longer exists. Refresh the list.');
    }
  }
}
