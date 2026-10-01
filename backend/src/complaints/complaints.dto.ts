import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Request bodies for the complaints routes (CONTRACT section 3).
 *
 * Multipart fields arrive as strings, so every text field is trimmed
 * here and "required" is checked as "non-blank after trimming". The
 * required-note rules (resolve, send back, reassign, comment) live in
 * the service, after the permission check, so a person who may not act
 * is told that rather than "add a note".
 */

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RaiseComplaintDto {
  /**
   * The budget site the complaint is about (client decision, 1 Oct 2026,
   * CONTRACT section 10). It replaced `locationId`.
   */
  @IsUUID('all', { message: 'Choose the site from the list' })
  siteId!: string;

  @IsUUID('all', { message: 'Choose the category from the list' })
  categoryId!: string;

  @Transform(trim)
  @IsString({ message: "Enter the complainant's name" })
  @MinLength(1, { message: "Enter the complainant's name" })
  @MaxLength(200)
  complainantName!: string;

  @Transform(trim)
  @IsString({ message: "Enter the complainant's phone number" })
  @MinLength(1, { message: "Enter the complainant's phone number" })
  @MaxLength(40)
  complainantPhone!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  locationNote?: string;

  @Transform(trim)
  @IsString({ message: 'Describe the complaint' })
  @MinLength(1, { message: 'Describe the complaint' })
  @MaxLength(5000)
  description!: string;
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
  @IsUUID('all', { message: 'Choose the new supervisor from the list' })
  supervisorId!: string;
}
