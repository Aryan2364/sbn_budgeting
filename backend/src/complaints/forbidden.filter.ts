import { type ArgumentsHost, Catch, type ExceptionFilter, ForbiddenException } from '@nestjs/common';

import type { AccessContext } from '../access/access-context';
import { SIGN_IN, isGujarati, knowsPermission, refusedFor } from './messages';

/**
 * The complaints routes' 403s, in Gujarati (owner decision, 7 Oct 2026).
 *
 * Two kinds of 403 come from the shared access layer with an English
 * sentence: the permission guard's ("Only people allowed to ... can do
 * this.", the key not held) and `assertRecordAccess`'s ("You can ...
 * only if ...", held, but not at a scope reaching this complaint). Both
 * carry `{ error: 'forbidden', permission, reason, message }`. This
 * replaces `reason` and `message` with the same answer in Gujarati,
 * computed from the caller's scopes exactly as the access layer computed
 * the English (`refusedFor` = `recordReason`, and `reasonFor` when the
 * key is not held). Status, `error` and `permission` are untouched.
 *
 * Anything else passes through as it was: a sentence already in
 * Gujarati (the workflow's own refusals), a permission with no Gujarati
 * words, a 403 without a permission field.
 */
@Catch(ForbiddenException)
export class ComplaintsForbiddenFilter implements ExceptionFilter {
  catch(exception: ForbiddenException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const request = http.getRequest<{ access?: AccessContext }>();
    const body = exception.getResponse();

    response.status(exception.getStatus()).json(translated(body, request.access));
  }
}

function translated(body: unknown, access: AccessContext | undefined): unknown {
  if (!body || typeof body !== 'object') return body;
  const b = body as { permission?: unknown; message?: unknown; reason?: unknown };
  if (typeof b.permission !== 'string' || isGujarati(b.message)) return body;

  let said: string | null = null;
  if (b.permission === '' && !access) said = SIGN_IN;
  else if (access && knowsPermission(b.permission)) said = refusedFor(access, b.permission);
  if (!said) return body;
  return { ...b, reason: said, message: said };
}
