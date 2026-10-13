import { Type } from 'class-transformer';
import {
  IsDefined, IsObject, IsString, Matches, MaxLength, MinLength, ValidateBy, ValidateNested,
  type ValidationOptions,
} from 'class-validator';
import { isIP } from 'node:net';

/**
 * Request bodies for /push/subscriptions (CONTRACT section 9,
 * push-notifications). The body is the browser's own
 * `PushSubscription.toJSON()`: `{ endpoint, expirationTime, keys: { p256dh, auth } }`.
 * `expirationTime` is not used and the whitelist drops it.
 *
 * No screen shows these sentences (the phone sends the body silently),
 * so they are plain English for whoever reads the network log.
 */

export const ENDPOINT_MAX = 2048;

/** base64url, as the browser hands out p256dh and auth (padding tolerated). */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * A push service address: https, a named host (not an IP address, not a
 * one-word name like `localhost`), the default port, no user or
 * password. The API posts to this address, so it must look like a real
 * push service (fcm.googleapis.com, web.push.apple.com,
 * updates.push.services.mozilla.com, *.notify.windows.com) and never an
 * address inside the server's own network.
 */
export function isPushEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > ENDPOINT_MAX) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || isIP(host) !== 0) return false;
  const labels = host.split('.');
  return labels.length >= 2 && labels.every((l) => /^[a-z0-9-]+$/i.test(l)) && /[a-z]/i.test(labels.at(-1)!);
}

function IsPushEndpoint(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy({ name: 'isPushEndpoint', validator: { validate: isPushEndpoint } }, options);
}

const ENDPOINT_MESSAGE =
  `endpoint must be the https push-service address from the browser's push subscription (at most ${ENDPOINT_MAX} characters).`;

export class PushKeysDto {
  @IsString({ message: 'keys.p256dh must be the base64url public key from the push subscription.' })
  @MinLength(1, { message: 'keys.p256dh must be the base64url public key from the push subscription.' })
  @MaxLength(256, { message: 'keys.p256dh is too long for a push subscription key.' })
  @Matches(BASE64URL, { message: 'keys.p256dh must be the base64url public key from the push subscription.' })
  p256dh!: string;

  @IsString({ message: 'keys.auth must be the base64url secret from the push subscription.' })
  @MinLength(1, { message: 'keys.auth must be the base64url secret from the push subscription.' })
  @MaxLength(128, { message: 'keys.auth is too long for a push subscription secret.' })
  @Matches(BASE64URL, { message: 'keys.auth must be the base64url secret from the push subscription.' })
  auth!: string;
}

export class SubscribeDto {
  @IsPushEndpoint({ message: ENDPOINT_MESSAGE })
  endpoint!: string;

  @IsDefined({ message: 'keys is required: send the push subscription as the browser gives it (toJSON()).' })
  @IsObject({ message: 'keys must be an object with p256dh and auth.' })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class UnsubscribeDto {
  @IsString({ message: 'endpoint is required: the address of the push subscription to remove.' })
  @MinLength(1, { message: 'endpoint is required: the address of the push subscription to remove.' })
  @MaxLength(ENDPOINT_MAX, { message: `endpoint is at most ${ENDPOINT_MAX} characters.` })
  endpoint!: string;
}
