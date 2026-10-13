import { Body, Controller, Delete, Headers, HttpCode, Post } from '@nestjs/common';

import { SignedIn } from '../access/decorators';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { SubscribeDto, UnsubscribeDto } from './push.dto';
import { PushService } from './push.service';

/**
 * This phone's notifications (CONTRACT section 9, push-notifications;
 * plan Phase 6a). Open to anyone signed in, and always about the caller:
 * a phone is saved for the person signed in on it, and only that person
 * can remove it.
 *
 * Access: every handler is SignedIn. A phone is personal, like the bell,
 * so no permission key applies; what is pushed to it is decided by the
 * complaint events, which only notify the people on the complaint.
 */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /**
   * Saves (or moves to the caller) the phone's push subscription, the
   * body being the browser's `PushSubscription.toJSON()`. Sent after
   * sign-in and whenever the phone turns notifications on. 204.
   */
  @Post('subscriptions')
  // @SignedIn: the subscription is saved for the caller only.
  @SignedIn()
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() body: SubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    await this.push.subscribe(user.id, body, userAgent?.trim() || null);
  }

  /**
   * Removes the caller's subscription for this phone. Sent at sign-out
   * BEFORE the token is cleared, and when notifications are turned off.
   * 204 whether or not there was one (someone else's phone looks the same
   * as an unknown one and is left alone).
   */
  @Delete('subscriptions')
  // @SignedIn: deletes only the caller's own row (where user_id = me).
  @SignedIn()
  @HttpCode(204)
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() body: UnsubscribeDto): Promise<void> {
    await this.push.unsubscribe(user.id, body.endpoint);
  }
}
