import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type SortDirection } from './list-query';

/**
 * The query string every list endpoint accepts. One shape, so the
 * frontend's list machinery is written once too.
 *
 * Anything not declared here — an unknown filter, an undeclared sort
 * column — is a 400 rather than a silent fallback. A list that quietly
 * ignores a sort the user asked for is worse than one that refuses it.
 */
export class ListQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  /** Free text. Runs against every meaningful field on the record. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: SortDirection;
}
