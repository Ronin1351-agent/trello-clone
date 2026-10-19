import { validateImage } from '../../lib/images.js';
import { eq, and } from 'drizzle-orm';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, schema } from '../../db/index.js';
import { AppError } from '../../middleware/error.js';
import { requireBoardAccess } from '../../middleware/boardAccess.js';
import { storageProvider } from '../../lib/storage/index.js';

export async function addAttachment(
  boardId: string,
  cardId: string,
  userId: string,
  file: Express.Multer.File,
) {
  await requireBoardAccess(boardId, userId, 'edit');

  const card = await db.query.cards.findFirst({
    where: eq(schema.cards.id, cardId),
  });
  if (!card || card.boardId !== boardId) throw new AppError(404, 'Card not found');

  const extension = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mimetype)
    ? validateImage(file)
    : path.extname(file.originalname);
  const key = `attachments/${crypto.randomUUID()}${extension}`;
  await storageProvider.upload(key, file.buffer, file.mimetype);

  const [attachment] = await db
    .insert(schema.attachments)
    .values({
      cardId,
      uploadedBy: userId,
      filename: file.originalname,
      storagePath: key,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    })
    .returning();

  const uploader = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, displayName: true, avatarUrl: true },
  });

  return {
    ...attachment,
    createdAt: attachment.createdAt.toISOString(),
    url: storageProvider.getUrl(key),
    uploader: uploader ?? { id: userId, displayName: 'Unknown', avatarUrl: null },
  };
}

export async function listAttachments(boardId: string, cardId: string, userId: string) {
  await requireBoardAccess(boardId, userId, 'read');

  const card = await db.query.cards.findFirst({
    where: eq(schema.cards.id, cardId),
  });
  if (!card || card.boardId !== boardId) throw new AppError(404, 'Card not found');

  const rows = await db.query.attachments.findMany({
    where: eq(schema.attachments.cardId, cardId),
    orderBy: [schema.attachments.createdAt],
    with: {
      uploader: {
        columns: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return rows.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    url: storageProvider.getUrl(a.storagePath),
  }));
}

export async function deleteAttachment(
  boardId: string,
  cardId: string,
  attachmentId: string,
  userId: string,
) {
  await requireBoardAccess(boardId, userId, 'edit');

  const card = await db.query.cards.findFirst({ where: eq(schema.cards.id, cardId) });
  if (!card || card.boardId !== boardId) throw new AppError(404, 'Card not found');

  const attachment = await db.query.attachments.findFirst({
    where: and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.cardId, cardId)),
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');

  await db.delete(schema.attachments).where(eq(schema.attachments.id, attachmentId));

  await storageProvider.delete(attachment.storagePath);
}
