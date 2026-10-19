import { cardCoverUrls } from '../../lib/images.js';
import { IMAGE_MIME_TYPES } from '@trello-clone/shared';
import { eq, and, asc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { AppError } from '../../middleware/error.js';
import { requireBoardAccess } from '../../middleware/boardAccess.js';
import { getPositionAfter, getPositionBetween, getPositionBefore } from '../../utils/ordering.js';
import type { CreateCardInput, UpdateCardInput, MoveCardInput } from '@trello-clone/shared';
import { storageProvider } from '../../lib/storage/index.js';

export async function createCard(boardId: string, userId: string, input: CreateCardInput) {
  await requireBoardAccess(boardId, userId, 'edit');

  // Verify the column belongs to this board
  const column = await db.query.columns.findFirst({
    where: and(eq(schema.columns.id, input.columnId), eq(schema.columns.boardId, boardId)),
  });
  if (!column) throw new AppError(404, 'Column not found on this board');

  // Resolve swimlane: use provided swimlaneId or fall back to default
  let swimlaneId: string;
  if (input.swimlaneId) {
    const swimlane = await db.query.swimlanes.findFirst({
      where: and(eq(schema.swimlanes.id, input.swimlaneId), eq(schema.swimlanes.boardId, boardId)),
    });
    if (!swimlane) throw new AppError(404, 'Swimlane not found on this board');
    swimlaneId = swimlane.id;
  } else {
    const defaultSwimlane = await db.query.swimlanes.findFirst({
      where: and(eq(schema.swimlanes.boardId, boardId), eq(schema.swimlanes.isDefault, true)),
    });
    if (!defaultSwimlane) throw new AppError(500, 'Board has no default swimlane');
    swimlaneId = defaultSwimlane.id;
  }

  // Validate parentCardId if provided
  let parentCardId: string | null = null;
  if (input.parentCardId) {
    const parent = await db.query.cards.findFirst({
      where: and(eq(schema.cards.id, input.parentCardId), eq(schema.cards.boardId, boardId)),
    });
    if (!parent) throw new AppError(404, 'Parent card not found on this board');
    if (parent.parentCardId) throw new AppError(400, 'Cannot nest subtasks more than one level deep');
    parentCardId = parent.id;
  }

  // Get last card position in this column+swimlane
  const existingCards = await db.query.cards.findMany({
    where: and(
      eq(schema.cards.columnId, input.columnId),
      eq(schema.cards.swimlaneId, swimlaneId),
      eq(schema.cards.isArchived, false),
    ),
    orderBy: [asc(schema.cards.position)],
    columns: { position: true },
  });

  const lastPos = existingCards.length > 0
    ? existingCards[existingCards.length - 1].position
    : null;

  const [card] = await db
    .insert(schema.cards)
    .values({
      boardId,
      columnId: input.columnId,
      swimlaneId,
      parentCardId,
      title: input.title,
      description: input.description ?? null,
      cardType: input.cardType ?? 'task',
      position: getPositionAfter(lastPos),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdBy: userId,
    })
    .returning();

  return card;
}

export async function getCard(cardId: string, userId: string) {
  const card = await db.query.cards.findFirst({
    where: eq(schema.cards.id, cardId),
    with: {
      assignees: {
        with: {
          user: {
            columns: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
      comments: {
        orderBy: [asc(schema.comments.createdAt)],
        with: {
          author: {
            columns: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
      cardLabels: {
        with: {
          label: {
            columns: { id: true, name: true, color: true },
          },
        },
      },
      attachments: {
        orderBy: [asc(schema.attachments.createdAt)],
        with: {
          uploader: {
            columns: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
      parentCard: {
        columns: { id: true, title: true, cardType: true },
      },
    },
  });

  if (!card) throw new AppError(404, 'Card not found');

  await requireBoardAccess(card.boardId, userId, 'read');

  // Fetch subtasks separately (non-archived only)
  const subtasks = await db.query.cards.findMany({
    where: and(eq(schema.cards.parentCardId, cardId), eq(schema.cards.isArchived, false)),
    orderBy: [asc(schema.cards.position)],
    columns: {
      id: true,
      columnId: true,
      swimlaneId: true,
      parentCardId: true,
      cardType: true,
      title: true,
      position: true,
      dueDate: true,
    },
  });

  return {
    ...card,
    coverImageUrl: card.coverAttachmentId ? (await cardCoverUrls([card])).get(card.coverAttachmentId) ?? null : null,
    assignees: card.assignees.map((a) => ({
      id: a.user.id,
      displayName: a.user.displayName,
      avatarUrl: a.user.avatarUrl,
    })),
    labels: card.cardLabels.map((cl) => cl.label),
    comments: card.comments.map((c) => ({
      id: c.id,
      cardId: c.cardId,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: c.author,
    })),
    attachments: card.attachments.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      url: storageProvider.getUrl(a.storagePath),
    })),
    subtasks: subtasks.map((s) => ({
      ...s,
      assignees: [] as Array<{ id: string; displayName: string; avatarUrl: string | null }>,
      labels: [] as Array<{ id: string; name: string; color: string }>,
      commentCount: 0,
      subtaskCount: 0,
      subtaskDoneCount: 0,
    })),
    parentCard: card.parentCard ?? null,
  };
}

export async function updateCard(cardId: string, userId: string, input: UpdateCardInput) {
  const card = await db.query.cards.findFirst({
    where: eq(schema.cards.id, cardId),
  });
  if (!card) throw new AppError(404, 'Card not found');

  await requireBoardAccess(card.boardId, userId, 'edit');

  if (input.coverAttachmentId) {
    const attachment = await db.query.attachments.findFirst({ where: and(eq(schema.attachments.id, input.coverAttachmentId), eq(schema.attachments.cardId, cardId)) });
    if (!attachment || !IMAGE_MIME_TYPES.includes(attachment.mimeType)) throw new AppError(400, 'Cover must be an image attached to this card');
  }

  // Validate parentCardId changes
  if (input.parentCardId !== undefined) {
    if (input.parentCardId !== null) {
      if (input.parentCardId === cardId) {
        throw new AppError(400, 'A card cannot be its own parent');
      }
      const parent = await db.query.cards.findFirst({
        where: and(eq(schema.cards.id, input.parentCardId), eq(schema.cards.boardId, card.boardId)),
      });
      if (!parent) throw new AppError(404, 'Parent card not found on this board');
      if (parent.parentCardId) throw new AppError(400, 'Cannot nest subtasks more than one level deep');

      // Check if the card already has children (would create depth > 1)
      const existingChildren = await db.query.cards.findMany({
        where: eq(schema.cards.parentCardId, cardId),
        columns: { id: true },
        limit: 1,
      });
      if (existingChildren.length > 0) {
        throw new AppError(400, 'Cannot set parent on a card that already has subtasks');
      }
    }
  }

  // Build update payload, converting dueDate string to Date
  const { dueDate, ...restInput } = input;
  const updatePayload: Record<string, unknown> = { ...restInput, updatedAt: new Date() };
  if (dueDate !== undefined) {
    updatePayload.dueDate = dueDate ? new Date(dueDate) : null;
  }

  const [updated] = await db
    .update(schema.cards)
    .set(updatePayload as unknown as typeof schema.cards.$inferInsert)
    .where(eq(schema.cards.id, cardId))
    .returning();

  return { ...updated, coverImageUrl: updated.coverAttachmentId ? (await cardCoverUrls([updated])).get(updated.coverAttachmentId) ?? null : null };
}

export async function moveCard(cardId: string, userId: string, input: MoveCardInput) {
  const card = await db.query.cards.findFirst({
    where: eq(schema.cards.id, cardId),
  });
  if (!card) throw new AppError(404, 'Card not found');

  await requireBoardAccess(card.boardId, userId, 'edit');

  // Verify the target column belongs to the same board
  const targetColumn = await db.query.columns.findFirst({
    where: and(eq(schema.columns.id, input.columnId), eq(schema.columns.boardId, card.boardId)),
  });
  if (!targetColumn) throw new AppError(404, 'Target column not found on this board');

  // Resolve target swimlane
  const targetSwimlaneId = input.swimlaneId ?? card.swimlaneId;
  if (input.swimlaneId) {
    const swimlane = await db.query.swimlanes.findFirst({
      where: and(eq(schema.swimlanes.id, input.swimlaneId), eq(schema.swimlanes.boardId, card.boardId)),
    });
    if (!swimlane) throw new AppError(404, 'Target swimlane not found on this board');
  }

  // Get all non-archived cards in the target column+swimlane (excluding the card being moved)
  const cardsInTarget = await db.query.cards.findMany({
    where: and(
      eq(schema.cards.columnId, input.columnId),
      eq(schema.cards.swimlaneId, targetSwimlaneId),
      eq(schema.cards.isArchived, false),
    ),
    orderBy: [asc(schema.cards.position)],
  });

  const otherCards = cardsInTarget.filter((c) => c.id !== cardId);

  let newPosition: string;

  if (input.afterId === null) {
    newPosition = getPositionBefore(otherCards[0]?.position ?? null);
  } else {
    const afterIndex = otherCards.findIndex((c) => c.id === input.afterId);
    if (afterIndex === -1) throw new AppError(404, 'Target card not found');

    const afterPos = otherCards[afterIndex].position;
    const beforePos = otherCards[afterIndex + 1]?.position ?? null;

    newPosition = getPositionBetween(afterPos, beforePos);
  }

  const [updated] = await db
    .update(schema.cards)
    .set({
      columnId: input.columnId,
      swimlaneId: targetSwimlaneId,
      position: newPosition,
      updatedAt: new Date(),
    })
    .where(eq(schema.cards.id, cardId))
    .returning();

  return updated;
}

export async function deleteCard(cardId: string, userId: string) {
  const card = await db.query.cards.findFirst({
    where: eq(schema.cards.id, cardId),
  });
  if (!card) throw new AppError(404, 'Card not found');

  await requireBoardAccess(card.boardId, userId, 'edit');

  await db.delete(schema.cards).where(eq(schema.cards.id, cardId));
}
