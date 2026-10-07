import {
  type ArgumentsHost, BadRequestException, Catch, type ExceptionFilter, HttpException, Logger,
  NotFoundException, PayloadTooLargeException, ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { type OpenedPhoto, type PhotoStore, photoStoreFromEnv, uploadRoot } from './photo-stores';

/**
 * Complaint photos (CONTRACT section 3, "Storage"; section 9, be-r2).
 *
 * Each photo is stored under a name the server generates, never the one
 * the phone sent (section 9, be-photo-keys):
 *
 *   complaints/<yyyy>/<reference>/<stage>-<n>.<ext>
 *   e.g. complaints/2026/C-000123/raised-1.jpg, .../resolved-2.png
 *
 * in the Cloudflare R2 bucket when R2 is configured, otherwise under
 * UPLOAD_DIR (photo-stores.ts). Either way they are served only through
 * the authorised photo endpoint, never as a public URL or static path.
 * Rows written before this keep their old `complaints/<yyyy>/<mm>/<uuid>.<ext>`
 * keys; every read goes by the row's stored key, so both layouts work.
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
        ? 'કામ પૂરું થયાનો ઓછામાં ઓછો એક ફોટો ઉમેરો. ફરિયાદ ઉકેલવા માટે ફોટો જરૂરી છે.'
        : `ઓછામાં ઓછા ${min} ફોટા ઉમેરો.`,
    );
  }
  if (list.length > max) {
    throw new UnprocessableEntityException(
      `તમે ${list.length} ફોટા મોકલ્યા છે. વધુમાં વધુ ${max} ફોટા ચાલે, તેથી ${list.length - max} ફોટા દૂર કરો.`,
    );
  }
  return list.map((file) => {
    if (file.size > MAX_PHOTO_BYTES || file.buffer.length > MAX_PHOTO_BYTES) {
      throw new UnprocessableEntityException(
        `${file.originalname} 5 MB કરતાં મોટો છે. નાનો ફોટો પસંદ કરો.`,
      );
    }
    const contentType = sniffImageType(file.buffer);
    if (!contentType) {
      throw new UnprocessableEntityException(
        `${file.originalname} JPEG, PNG કે WebP ફોટો નથી. ફોટો પસંદ કરીને ફરી પ્રયાસ કરો.`,
      );
    }
    return { file, contentType };
  });
}

export { uploadRoot };

const logger = new Logger('PhotoStorage');

let store: PhotoStore | null = null;

/**
 * Picks the driver from the environment and says which, once. Called
 * from ComplaintsModule's constructor so a half-configured R2 stops the
 * API at startup rather than at the first photo. Never logs a key.
 */
export function initPhotoStorage(): PhotoStore {
  if (!store) {
    store = photoStoreFromEnv();
    logger.log(`Complaint photos: ${store.description}`);
  }
  return store;
}

// Gujarati (owner, 7 Oct 2026), like every complaints message.
const SAVE_FAILED = 'ફોટા સાચવી શકાયા નથી. ફરી પ્રયાસ કરો.';
const LOAD_FAILED = 'ફોટો ખૂલી શક્યો નથી. થોડી વાર પછી ફરી પ્રયાસ કરો.';

export interface StoredPhoto {
  storageKey: string;
  contentType: PhotoType;
  bytes: number;
  originalName: string;
}

export type PhotoStage = 'raise' | 'resolve';

/** The word in the file name; the database keeps `stage` as raise/resolve. */
const STAGE_WORD: Record<PhotoStage, string> = { raise: 'raised', resolve: 'resolved' };

/** Where one complaint's photos for one stage go, and what is already there. */
export interface PhotoPlace {
  /** The year the complaint was raised, in Asia/Kolkata. */
  year: number;
  /** The complaint's reference exactly as the API shows it, `C-000123`. */
  reference: string;
  stage: PhotoStage;
  /**
   * Every storage key already stored for this complaint and stage. The
   * caller reads them while holding the complaint's row lock (or owning
   * the uncommitted row), so two requests never pick the same name.
   */
  existingKeys: string[];
}

/**
 * `complaints/<yyyy>/<reference>/<stage>-<n>.<ext>`, with n continuing
 * after the highest n already stored for this complaint and stage
 * (older complaints may carry a second resolution). Keys in the
 * old uuid layout never match the pattern and so never count.
 */
export function planPhotoKeys(place: PhotoPlace, photos: CheckedPhoto[]): string[] {
  const { year, reference, stage, existingKeys } = place;
  if (!/^\d{4}$/.test(String(year)) || !/^C-\d{6,}$/.test(reference)) {
    throw new Error(`Cannot build a photo folder from year ${year} and reference ${reference}`);
  }
  const folder = `complaints/${year}/${reference}`;
  const word = STAGE_WORD[stage];
  const head = `${folder}/${word}-`;
  const highest = existingKeys.reduce((max, key) => {
    if (!key.startsWith(head)) return max;
    const n = /^(\d+)\.(?:jpg|png|webp)$/.exec(key.slice(head.length))?.[1];
    return n === undefined ? max : Math.max(max, Number(n));
  }, 0);
  return photos.map(
    ({ contentType }, i) => `${folder}/${word}-${highest + 1 + i}.${EXTENSION[contentType]}`,
  );
}

/**
 * Writes the files and returns their keys. The caller inserts the rows
 * inside its transaction and calls `removeStored` if that transaction
 * fails, so a refused action leaves no orphan files behind. On resolve
 * it does so BEFORE rolling back, while it still holds the complaint's
 * lock: the next resolve may reuse the same names once the lock is
 * released, and a late delete would then remove that one's photos. If any
 * write fails, the ones that succeeded are removed here and the caller
 * gets a 503 it can show as is; the transaction then rolls back, so no
 * row points at a photo that was never stored.
 */
export async function storePhotos(
  photos: CheckedPhoto[],
  place: PhotoPlace,
): Promise<StoredPhoto[]> {
  if (photos.length === 0) return [];
  const target = initPhotoStorage();
  const keys = planPhotoKeys(place, photos);
  const planned: StoredPhoto[] = photos.map(({ file, contentType }, i) => ({
    storageKey: keys[i]!,
    contentType,
    bytes: file.buffer.length,
    originalName: file.originalname,
  }));

  const results = await Promise.allSettled(
    planned.map((p, i) => target.put(p.storageKey, photos[i]!.file.buffer, p.contentType)),
  );
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length > 0) {
    for (const f of failed) {
      logger.error(`Storing a complaint photo failed: ${describe(f.reason)}`);
    }
    await removeStored(planned.filter((_, i) => results[i]!.status === 'fulfilled'));
    throw new ServiceUnavailableException(SAVE_FAILED);
  }
  return planned;
}

/**
 * Best effort: a photo that cannot be removed is logged by key (so it
 * can be cleaned up by hand) and never masks the error that caused the
 * removal.
 */
export async function removeStored(stored: StoredPhoto[]): Promise<void> {
  if (stored.length === 0) return;
  const target = initPhotoStorage();
  const results = await Promise.allSettled(stored.map((s) => target.remove(s.storageKey)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.warn(
        `Could not remove orphan photo ${stored[i]!.storageKey}: ${describe(r.reason)}`,
      );
    }
  });
}

/**
 * The photo's bytes and size, or a 404 naming the cause when they are
 * gone. A storage outage is a 503, not a 404: the photo still exists.
 */
export async function openStored(storageKey: string): Promise<OpenedPhoto> {
  const source = initPhotoStorage();
  let opened: OpenedPhoto | null;
  try {
    opened = await source.get(storageKey);
  } catch (error) {
    logger.error(`Reading complaint photo ${storageKey} failed: ${describe(error)}`);
    throw new ServiceUnavailableException(LOAD_FAILED);
  }
  if (!opened) throw new NotFoundException(source.missingMessage);
  return opened;
}

/** The error's name and message, never the request (it carries a signature). */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
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
      reworded = 'એક ફોટો 5 MB કરતાં મોટો છે. નાનો ફોટો પસંદ કરો.';
    } else if (/^(Too many files|Unexpected field)/.test(message)) {
      reworded = `વધુમાં વધુ ${MAX_PHOTOS} ફોટા ચાલે. વધારાના ફોટા દૂર કરો.`;
    }

    if (reworded) {
      response.status(422).json({ statusCode: 422, message: reworded, error: 'Unprocessable Entity' });
      return;
    }
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}
