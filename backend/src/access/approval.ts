import { ConflictException } from '@nestjs/common';

/**
 * No self-approval (DECISIONS 19, backend kit rule 23 and 6.4, access
 * plan 6.1.11, RESOLUTIONS O10 Q11 and R7).
 *
 * A person who made a record, by creating it or by doing the work it
 * records, may not be the one who signs it off. The permission layer
 * cannot express this (it is about THIS record's people), so it is a
 * workflow rule, shared here so every module words and answers it the
 * same way:
 *
 *   - the answer is 409 `{ error: 'blocked', reason }`, never 403: the
 *     person may approve in general, just not this record (R7);
 *   - the reason names the cause and what to do instead (kit 26.2),
 *     never a role: "You raised this complaint, so someone else must
 *     approve it."
 *
 * Complaints call it on approve and send back, against the raiser and
 * the resolver (plan 6.2). Budget has no approval workflow today; any
 * future one ("+ Expense approver", DECISIONS 7) must call it too.
 *
 * `selfApprovalReason` is pure, so a workflow function that answers a
 * whole record's per-action map (`can`) and the route that acts can use
 * the one sentence and never disagree.
 */

/** Someone who made the record, and how, in the past tense: `{ id, made: 'raised' }`. */
export interface Maker {
  id: string | null | undefined;
  made: string;
}

export interface SelfApprovalCheck {
  /** The record, as a person would call it: 'complaint', 'expense'. */
  record: string;
  /** What only someone else may do, as "someone else must <decide>": 'approve it', 'send it back'. */
  decide: string;
  /** Everyone who made it, first match wins: the raiser before the resolver. */
  makers: readonly Maker[];
}

/** Null when `userId` made none of it; otherwise the plain reason it is blocked. */
export function selfApprovalReason(userId: string, check: SelfApprovalCheck): string | null {
  const mine = check.makers.find((m) => m.id != null && m.id === userId);
  return mine ? `You ${mine.made} this ${check.record}, so someone else must ${check.decide}.` : null;
}

/** The R7 answer for a workflow block: 409 `{ error: 'blocked', reason }`. */
export function blocked(reason: string): ConflictException {
  return new ConflictException({ error: 'blocked', reason, message: reason });
}

/** Throws the 409 when the caller made the record (kit 6.4: called by every approve route). */
export function assertNotCreator(ctx: { readonly userId: string }, check: SelfApprovalCheck): void {
  const reason = selfApprovalReason(ctx.userId, check);
  if (reason) throw blocked(reason);
}
