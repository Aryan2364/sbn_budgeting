import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Request bodies for the complaints routes (CONTRACT section 3).
 *
 * Multipart fields arrive as strings, so every text field is trimmed
 * here and "required" is checked as "non-blank after trimming". The
 * required-note rules (resolve, reassign, comment) live in
 * the service, after the permission check, so a person who may not act
 * is told that rather than "add a note".
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
  @IsString({ message: 'Enter a short title for the complaint' })
  @MinLength(1, { message: 'Enter a short title for the complaint' })
  @MaxLength(120, { message: 'Keep the title to 120 characters or fewer' })
  title!: string;

  /**
   * The budget site the complaint is about (client decision, 1 Oct 2026,
   * CONTRACT section 10). It replaced `locationId`.
   */
  @IsUUID('all', { message: 'Choose the site from the list' })
  siteId!: string;

  @IsUUID('all', { message: 'Choose the category from the list' })
  categoryId!: string;

  // Optional from 6 Oct 2026 (owner): description, complainant's name and
  // phone. Blank means none and is stored as null. A phone that IS given
  // must still be a full 10-digit number (checked in the service).

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(200)
  complainantName?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(40)
  complainantPhone?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  locationNote?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;
}

export class NoteDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  note?: string;
}

export class ResolveDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  resolutionNote?: string;
}

export class ReassignDto extends NoteDto {
  @IsUUID('all', { message: 'Choose who will work on it from the list' })
  supervisorId!: string;
}
