import {
  Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile,
  UploadedFiles, UseFilters, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import type { ListResult, MatchInfo } from '../common/list-query';
import { ModuleAccess } from '../common/module-access.decorator';
import { NoteDto, RaiseComplaintDto, ReassignDto, ResolveDto } from './complaints.dto';
import {
  ComplaintsService, type ComplaintDetail, type ComplaintRow, type ComplaintSite, type ComplaintSummary, type Tab,
} from './complaints.service';
import {
  MAX_PHOTOS, PHOTO_MULTER_OPTIONS, PhotoUploadErrorFilter, type UploadedPhoto,
} from './photo-storage';

/**
 * Complaints (CONTRACT section 3). Every route needs complaints access;
 * who may do what to one complaint is decided by `permissions.ts`,
 * inside the service, after the row is locked. A complaint the caller
 * can't see is a 404 everywhere, so its existence never leaks.
 */
@Controller('complaints')
@ModuleAccess('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListQueryDto,
    @Query('tab') tab?: string,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('locationId') locationId?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<ListResult<ComplaintRow & MatchInfo>> {
    return this.complaints.list(user, query, tab, { status, siteId, locationId, categoryId });
  }

  /**
   * The raise form's site picker (CONTRACT section 10). Complaints access
   * is enough: most raisers have no budget access, which /sites needs.
   * Declared before `:id` so "sites" is never read as an id.
   */
  @Get('sites')
  sites(): Promise<{ data: ComplaintSite[] }> {
    return this.complaints.sites();
  }

  @Get('counts')
  counts(@CurrentUser() user: AuthUser): Promise<Record<Tab, number>> {
    return this.complaints.counts(user);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser): Promise<ComplaintSummary> {
    return this.complaints.summary(user);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('photos', MAX_PHOTOS + 1, PHOTO_MULTER_OPTIONS))
  @UseFilters(PhotoUploadErrorFilter)
  raise(
    @CurrentUser() user: AuthUser,
    @Body() body: RaiseComplaintDto,
    @UploadedFiles() files?: UploadedPhoto[],
  ): Promise<ComplaintDetail> {
    return this.complaints.raise(user, body, files);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ComplaintDetail> {
    return this.complaints.detail(user, id);
  }

  /** Needs the bearer token, so the UI fetches it into a blob URL. */
  @Get(':id/photos/:photoId')
  @Header('Cache-Control', 'private, max-age=3600')
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ): Promise<StreamableFile> {
    const { stream, contentType, bytes } = await this.complaints.photo(user, id, photoId);
    return new StreamableFile(stream, { type: contentType, length: bytes });
  }

  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ComplaintDetail> {
    return this.complaints.start(user, id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('photos', MAX_PHOTOS + 1, PHOTO_MULTER_OPTIONS))
  @UseFilters(PhotoUploadErrorFilter)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveDto,
    @UploadedFiles() files?: UploadedPhoto[],
  ): Promise<ComplaintDetail> {
    return this.complaints.resolve(user, id, body.resolutionNote, files);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NoteDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.approve(user, id, body.note);
  }

  @Post(':id/send-back')
  @HttpCode(200)
  sendBack(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NoteDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.sendBack(user, id, body.note);
  }

  @Post(':id/reassign')
  @HttpCode(200)
  reassign(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReassignDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.reassign(user, id, body);
  }

  @Post(':id/comments')
  @HttpCode(200)
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NoteDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.comment(user, id, body.note);
  }
}
