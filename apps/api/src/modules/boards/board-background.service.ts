import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { requireBoardAccess } from '../../middleware/boardAccess.js';
import { storageProvider } from '../../lib/storage/index.js';
import { validateImage } from '../../lib/images.js';
import { AppError } from '../../middleware/error.js';

export async function setBoardBackground(
  boardId: string,
  userId: string,
  file?: Express.Multer.File,
) {
  await requireBoardAccess(boardId, userId, 'edit');
  const key = file ? 'board-backgrounds/' + crypto.randomUUID() + validateImage(file) : null;
  if (file && key) await storageProvider.upload(key, file.buffer, file.mimetype);
  let previous: string | null = null;
  try {
    await db.transaction(async (tx) => {
      // Serialize replacements, including removal, so the previous object is cleaned up correctly.
      const [current] = await tx
        .select()
        .from(schema.boards)
        .where(eq(schema.boards.id, boardId))
        .for('update');
      if (!current) throw new AppError(404, 'Board not found');
      previous = current.backgroundImage;
      await tx
        .update(schema.boards)
        .set({ backgroundImage: key, updatedAt: new Date() })
        .where(eq(schema.boards.id, boardId));
    });
  } catch (error) {
    if (key) await storageProvider.delete(key).catch(() => {});
    throw error;
  }
  if (previous) await storageProvider.delete(previous).catch(() => {});
  return { backgroundImageUrl: key ? storageProvider.getUrl(key) : null };
}
