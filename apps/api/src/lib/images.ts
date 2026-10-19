import { inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { storageProvider } from './storage/index.js';
import { AppError } from '../middleware/error.js';
import { IMAGE_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@trello-clone/shared';

export function validateImage(file: Express.Multer.File): string {
  const b = file.buffer;
  const matches: Record<string, boolean> = {
    'image/png':
      b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255,
    'image/gif': ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString()),
    'image/webp':
      b.length >= 12 &&
      b.subarray(0, 4).toString() === 'RIFF' &&
      b.subarray(8, 12).toString() === 'WEBP',
  };
  if (b.length > MAX_FILE_SIZE_BYTES) throw new AppError(413, 'Images must be 10 MiB or smaller');
  if (!IMAGE_MIME_TYPES.includes(file.mimetype) || !matches[file.mimetype]) {
    throw new AppError(400, 'Choose a valid JPEG, PNG, GIF or WebP image');
  }
  return { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[
    file.mimetype
  ]!;
}

export async function cardCoverUrls(cards: Array<{ coverAttachmentId?: string | null }>) {
  const ids = [
    ...new Set(cards.flatMap((c) => (c.coverAttachmentId ? [c.coverAttachmentId] : []))),
  ];
  if (!ids.length) return new Map<string, string>();
  const rows = await db.query.attachments.findMany({ where: inArray(schema.attachments.id, ids) });
  return new Map(
    rows
      .filter((a) => IMAGE_MIME_TYPES.includes(a.mimeType))
      .map((a) => [a.id, storageProvider.getUrl(a.storagePath)]),
  );
}
