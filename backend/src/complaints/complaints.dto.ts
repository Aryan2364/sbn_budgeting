import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { ACT, RAISE, ROOT_CAUSE_MAX } from './messages';

/**
 * Request bodies for the complaints routes (CONTRACT section 3).
 *
 * Multipart fields arrive as strings, so every text field is trimmed
 * here and "required" is checked as "non-blank after trimming". The
 * required-note rules (resolve, reassign, comment) live in
 * the service, after the permission check, so a person who may not act
 * is told that rather than "add a note".
 *
 * Every message is Gujarati (owner decision, 7 Oct 2026; messages.ts).
 */

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Trimmed, and a blank string (or null) becomes null: "none", which @IsOptional then accepts. */
const blankToNull = ({ value }: { value: unknown }): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export class RaiseComplaintDto {
  /**
   * The complaint's short title, its main line everywhere (owner
   * decision, 6 Oct 2026). Required: 1-120 characters after trimming.
   */
  @Transform(trim)
  @IsString({ message: RAISE.needTitle })
  @MinLength(1, { message: RAISE.needTitle })
  @MaxLength(120, { message: RAISE.longTitle })
  title!: string;

  /**
   * The budget site the complaint is about (client decision, 1 Oct 2026,
   * CONTRACT section 10). It replaced `locationId`.
   */
  @IsUUID('all', { message: RAISE.needSite })
  siteId!: string;

  @IsUUID('all', { message: RAISE.needCategory })
  categoryId!: string;

  // Optional from 6 Oct 2026 (owner): description, complainant's name and
  // phone. Blank means none and is stored as null. A phone that IS given
  // must still be a full 10-digit number (checked in the service).

  @IsOptional()
  @Transform(blankToNull)
  @IsString({ message: RAISE.longName })
  @MaxLength(200, { message: RAISE.longName })
  complainantName?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString({ message: RAISE.longPhone })
  @MaxLength(40, { message: RAISE.longPhone })
  complainantPhone?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: RAISE.longPlace })
  @MaxLength(500, { message: RAISE.longPlace })
  locationNote?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString({ message: RAISE.longDescription })
  @MaxLength(5000, { message: RAISE.longDescription })
  description?: string | null;
}

export class NoteDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: ACT.longNote })
  @MaxLength(5000, { message: ACT.longNote })
  note?: string;
}

export class ResolveDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: ACT.longResolutionNote })
  @MaxLength(5000, { message: ACT.longResolutionNote })
  resolutionNote?: string;

  /**
   * Why the problem happened (owner decision, 7 Oct 2026; migration
   * 0015). Required, 1-2000 characters after trimming. Optional HERE so
   * that "missing" is answered by the service, after the permission
   * check, like the resolution note: a person who may not resolve is
   * told that, not "add a root cause". Too long is a 400 here.
   */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: ACT.longRootCause })
  @MaxLength(ROOT_CAUSE_MAX, { message: ACT.longRootCause })
  rootCause?: string;
}

export class ReassignDto extends NoteDto {
  @IsUUID('all', { message: ACT.needReassignTarget })
  supervisorId!: string;
}
