import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import {
  type ArgumentsHost, BadRequestException, Catch, type ExceptionFilter, HttpException,
  PayloadTooLargeException, UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Complaint photos on disk (CONTRACT section 3, "Storage").
 *
 * Files live under UPLOAD_DIR at `complaints/<yyyy>/<mm>/<uuid>.<ext>`,
 * a name the server generates, never the one the phone sent. They are
 * served only through the authorised photo endpoint, never as a static
 * path.
 */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 3;

/**
 * The subset of multer's file object this module reads. Declared here
 * because the project carries no @types/multer, and memory storage (the
 * multer default when no `dest` is set) is what fills `buffer`.
 */
export interface UploadedPhoto {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Multer options for every photo route. The per-file cap is enforced by
 * multer itself so a 50 MB upload is cut off mid-stream instead of being
 * buffered first; the count is allowed one over the limit so our own
 * check (below) can word the refusal rather than multer.
 */
export const PHOTO_MULTER_OPTIONS = {
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS + 1 },
};

export type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSION: Record<PhotoType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * What the bytes say the file is. The declared content type is the
 * phone's opinion; a renamed PDF says `image/jpeg` too.
 */
export function sniffImageType(buffer: Buffer): PhotoType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && png.every((byte, i) => buffer[i] === byte)) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export interface CheckedPhoto {
  file: UploadedPhoto;
  contentType: PhotoType;
}

/**
 * Every photo check in one place, so raise and resolve refuse the same
 * things in the same words. Runs before anything is written.
 */
export function checkPhotos(
  files: UploadedPhoto[] | undefined,
  { min, max }: { min: number; max: number },
): CheckedPhoto[] {
  const list = (files ?? []).filter((f) => f.fieldname === 'photos');
  if (list.length < min) {
    throw new UnprocessableEntityException(
      min === 1
        ? 'Add a photo of the fix. Resolving needs at least one photo.'
        : `Add at least ${min} photos.`,
    );
  }
  if (list.length > max) {
    throw new UnprocessableEntityException(
      `You sent ${list.length} photos. Up to ${max} are allowed, so remove ${list.length - max}.`,
    );
  }
  return list.map((file) => {
    if (file.size > MAX_PHOTO_BYTES || file.buffer.length > MAX_PHOTO_BYTES) {
      throw new UnprocessableEntityException(
        `${file.originalname} is larger than 5 MB. Choose a smaller photo.`,
      );
    }
    const contentType = sniffImageType(file.buffer);
    if (!contentType) {
      throw new UnprocessableEntityException(
        `${file.originalname} is not a JPEG, PNG or WebP image. Choose a photo and try again.`,
      );
    }
    return { file, contentType };
  });
}

/**
 * `||`, not `??`: an env file carrying `UPLOAD_DIR=` (blank) sets it to
 * "", and resolve("") is the working directory itself — photos would be
 * written loose into the app folder. Blank means unset.
 */
export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_DIR?.trim() || join(process.cwd(), 'uploads'));
}

/** Resolves a stored key to its absolute path, refusing anything that escapes the root. */
function pathFor(storageKey: string): string {
  const root = uploadRoot();
  const full = resolve(root, storageKey);
  if (!full.startsWith(root + sep)) {
    throw new Error(`Storage key escapes the upload directory: ${storageKey}`);
  }
  return full;
}

export interface StoredPhoto {
  storageKey: string;
  contentType: PhotoType;
  bytes: number;
  originalName: string;
}

/**
 * Writes the files and returns their keys. The caller inserts the rows
 * inside its transaction and calls `removeStored` if that transaction
 * rolls back, so a refused action leaves no orphan files behind.
 */
export async function storePhotos(photos: CheckedPhoto[]): Promise<StoredPhoto[]> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const stored: StoredPhoto[] = [];
  try {
    for (const { file, contentType } of photos) {
      const storageKey = `complaints/${yyyy}/${mm}/${randomUUID()}.${EXTENSION[contentType]}`;
      const full = pathFor(storageKey);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, file.buffer);
      stored.push({
        storageKey,
        contentType,
        bytes: file.buffer.length,
        originalName: file.originalname,
      });
    }
  } catch (error) {
    await removeStored(stored);
    throw error;
  }
  return stored;
}

export async function removeStored(stored: StoredPhoto[]): Promise<void> {
  await Promise.all(
    stored.map((s) => unlink(pathFor(s.storageKey)).catch(() => undefined)),
  );
}

/** The file's size on disk, or null when it is missing. */
export async function storedSize(storageKey: string): Promise<number | null> {
  try {
    return (await stat(pathFor(storageKey))).size;
  } catch {
    return null;
  }
}

export function openStored(storageKey: string): ReadStream {
  return createReadStream(pathFor(storageKey));
}

/**
 * Multer's own refusals ("File too large", "Unexpected field") reach the
 * user as raw library text otherwise. This rewords the ones a person can
 * cause and passes every other error through unchanged.
 */
@Catch(PayloadTooLargeException, BadRequestException)
export class PhotoUploadErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: unknown): void };
    }>();
    const message = exception.message;

    let reworded: string | null = null;
    if (exception instanceof PayloadTooLargeException) {
      reworded = 'A photo is larger than 5 MB. Choose a smaller photo, or let the app compress it.';
    } else if (/^(Too many files|Unexpected field)/.test(message)) {
      reworded = `Up to ${MAX_PHOTOS} photos are allowed, sent in the "photos" field. Remove the extra ones.`;
    }

    if (reworded) {
      response.status(422).json({ statusCode: 422, message: reworded, error: 'Unprocessable Entity' });
      return;
    }
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
