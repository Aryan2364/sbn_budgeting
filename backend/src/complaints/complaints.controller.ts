import {
  Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile,
  UploadedFiles, UseFilters, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import { type AccessContext, CurrentAccess } from '../access/access-context';
import { Can } from '../access/decorators';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import type { ListResult, MatchInfo } from '../common/list-query';
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
 *
 * Access plan P2b, P9: each handler carries its declaration (`@Can`),
 * which the permission guard decides. The key says only that the person may do this KIND of thing; who is the
 * supervisor or the approver on THIS complaint stays in permissions.ts
 * (the workflow layer, plan 6.2). RESOLUTIONS C1: `approve` covers
 * approve and send back; `work` covers start and resolve.
 *
 * Access plan P3b: which complaints a caller reaches is decided in the
 * data query by the shared scope filter (`@CurrentAccess()` into the
 * service): `complaints.complaints.view` for every read, and each
 * action's own key on its write (404 outside view, 403 outside the
 * action). The workflow layer then decides as before.
 */
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @Can('complaints.complaints.view')
  list(
    @CurrentAccess() access: AccessContext,
    @Query() query: ListQueryDto,
    @Query('tab') tab?: string,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('locationId') locationId?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<ListResult<ComplaintRow & MatchInfo>> {
    return this.complaints.list(access, query, tab, { status, siteId, locationId, categoryId });
  }

  /**
   * The raise form's site picker (CONTRACT section 10). Complaints access
   * is enough: most raisers have no budget access, which /sites needs.
   * Declared before `:id` so "sites" is never read as an id.
   */
  @Get('sites')
  @Can('complaints.complaints.raise')
  sites(@CurrentAccess() access: AccessContext): Promise<{ data: ComplaintSite[] }> {
    return this.complaints.sites(access);
  }

  @Get('counts')
  @Can('complaints.complaints.view')
  counts(@CurrentAccess() access: AccessContext): Promise<Record<Tab, number>> {
    return this.complaints.counts(access);
  }

  @Get('summary')
  @Can('complaints.complaints.view')
  summary(@CurrentAccess() access: AccessContext): Promise<ComplaintSummary> {
    return this.complaints.summary(access);
  }

  @Post()
  @Can('complaints.complaints.raise')
  @UseInterceptors(FilesInterceptor('photos', MAX_PHOTOS + 1, PHOTO_MULTER_OPTIONS))
  @UseFilters(PhotoUploadErrorFilter)
  raise(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Body() body: RaiseComplaintDto,
    @UploadedFiles() files?: UploadedPhoto[],
  ): Promise<ComplaintDetail> {
    return this.complaints.raise(user, access, body, files);
  }

  @Get(':id')
  @Can('complaints.complaints.view')
  detail(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ComplaintDetail> {
    return this.complaints.detail(user, access, id);
  }

  /** Needs the bearer token, so the UI fetches it into a blob URL. */
  @Get(':id/photos/:photoId')
  @Can('complaints.complaints.view')
  @Header('Cache-Control', 'private, max-age=3600')
  async photo(
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ): Promise<StreamableFile> {
    const { stream, contentType, bytes } = await this.complaints.photo(access, id, photoId);
    return new StreamableFile(stream, { type: contentType, length: bytes });
  }

  @Post(':id/start')
  @Can('complaints.complaints.work')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ComplaintDetail> {
    return this.complaints.start(user, access, id);
  }

  @Post(':id/resolve')
  @Can('complaints.complaints.work')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('photos', MAX_PHOTOS + 1, PHOTO_MULTER_OPTIONS))
  @UseFilters(PhotoUploadErrorFilter)
  resolve(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveDto,
    @UploadedFiles() files?: UploadedPhoto[],
  ): Promise<ComplaintDetail> {
    return this.complaints.resolve(user, access, id, body.resolutionNote, files);
  }

  @Post(':id/approve')
  @Can('complaints.complaints.approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NoteDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.approve(user, access, id, body.note);
  }

  @Post(':id/send-back')
  @Can('complaints.complaints.approve')
  @HttpCode(200)
  sendBack(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NoteDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.sendBack(user, access, id, body.note);
  }

  @Post(':id/reassign')
  @Can('complaints.complaints.reassign')
  @HttpCode(200)
  reassign(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReassignDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.reassign(user, access, id, body);
  }

  @Post(':id/comments')
  @Can('complaints.complaints.comment')
  @HttpCode(200)
  comment(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: NoteDto,
  ): Promise<ComplaintDetail> {
    return this.complaints.comment(user, access, id, body.note);
  }
}
