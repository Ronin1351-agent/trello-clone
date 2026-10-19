import { cardCoverUrls } from '../../lib/images.js';
import { storageProvider } from '../../lib/storage/index.js';
import crypto from 'node:crypto';
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { AppError } from '../../middleware/error.js';
import { requireBoardAccess, resolveBoardToken } from '../../middleware/boardAccess.js';
import type { CreateUserShareInput, CreateLinkShareInput, UpdateShareInput, BoardPermission } from '@trello-clone/shared';

export async function listShares(boardId: string, userId: string) {
  await requireBoardAccess(boardId, userId, 'edit');

  const shares = await db.query.boardShares.findMany({
    where: eq(schema.boardShares.boardId, boardId),
    with: {
      user: {
        columns: { id: true, displayName: true, email: true, avatarUrl: true },
      },
    },
    orderBy: [asc(schema.boardShares.createdAt)],
  });

  return shares.map((s) => ({
    id: s.id,
    boardId: s.boardId,
    userId: s.userId,
    token: s.token,
    permission: s.permission as BoardPermission,
    createdBy: s.createdBy,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    user: s.user
      ? {
          id: s.user.id,
          displayName: s.user.displayName,
          email: s.user.email,
          avatarUrl: s.user.avatarUrl,
        }
      : undefined,
  }));
}

export async function createUserShare(boardId: string, userId: string, input: CreateUserShareInput) {
  const { board } = await requireBoardAccess(boardId, userId, 'edit');

  // Find the target user by email
  const targetUser = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email),
  });
  if (!targetUser) throw new AppError(404, 'User not found');

  // Check if target is already a team member
  const existingMembership = await db.query.teamMemberships.findFirst({
    where: and(
      eq(schema.teamMemberships.teamId, board.teamId),
      eq(schema.teamMemberships.userId, targetUser.id),
    ),
  });
  if (existingMembership) {
    throw new AppError(409, 'User is already a team member and has full access');
  }

  // Check if share already exists
  const existing = await db.query.boardShares.findFirst({
    where: and(
      eq(schema.boardShares.boardId, boardId),
      eq(schema.boardShares.userId, targetUser.id),
    ),
  });
  if (existing) throw new AppError(409, 'User already has a share for this board');

  const [share] = await db
    .insert(schema.boardShares)
    .values({
      boardId,
      userId: targetUser.id,
      permission: input.permission,
      createdBy: userId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();

  return {
    ...share,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    createdAt: share.createdAt.toISOString(),
    user: {
      id: targetUser.id,
      displayName: targetUser.displayName,
      email: targetUser.email,
      avatarUrl: targetUser.avatarUrl,
    },
  };
}

export async function createLinkShare(boardId: string, userId: string, input: CreateLinkShareInput) {
  await requireBoardAccess(boardId, userId, 'edit');

  const token = crypto.randomBytes(32).toString('hex');

  const [share] = await db
    .insert(schema.boardShares)
    .values({
      boardId,
      token,
      permission: input.permission,
      createdBy: userId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();

  return {
    ...share,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    createdAt: share.createdAt.toISOString(),
  };
}

export async function updateShare(boardId: string, shareId: string, userId: string, input: UpdateShareInput) {
  await requireBoardAccess(boardId, userId, 'edit');

  const share = await db.query.boardShares.findFirst({
    where: and(eq(schema.boardShares.id, shareId), eq(schema.boardShares.boardId, boardId)),
  });
  if (!share) throw new AppError(404, 'Share not found');

  const updates: Record<string, unknown> = {};
  if (input.permission !== undefined) updates.permission = input.permission;
  if (input.expiresAt !== undefined) updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  const [updated] = await db
    .update(schema.boardShares)
    .set(updates)
    .where(eq(schema.boardShares.id, shareId))
    .returning();

  return {
    ...updated,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function deleteShare(boardId: string, shareId: string, userId: string) {
  await requireBoardAccess(boardId, userId, 'edit');

  const share = await db.query.boardShares.findFirst({
    where: and(eq(schema.boardShares.id, shareId), eq(schema.boardShares.boardId, boardId)),
  });
  if (!share) throw new AppError(404, 'Share not found');

  await db.delete(schema.boardShares).where(eq(schema.boardShares.id, shareId));
}

export async function getBoardByToken(token: string) {
  const { board, permission } = await resolveBoardToken(token, 'read');

  const boardId = board.id;

  const [columnsResult, swimlanesResult, cardsResult] = await Promise.all([
    db.query.columns.findMany({
      where: eq(schema.columns.boardId, boardId),
      orderBy: [asc(schema.columns.position)],
    }),
    db.query.swimlanes.findMany({
      where: eq(schema.swimlanes.boardId, boardId),
      orderBy: [asc(schema.swimlanes.position)],
    }),
    db.query.cards.findMany({
      where: and(eq(schema.cards.boardId, boardId), eq(schema.cards.isArchived, false)),
      orderBy: [asc(schema.cards.position)],
      with: {
        assignees: {
          with: {
            user: {
              columns: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    }),
  ]);

  const labelsResult = await db.query.labels.findMany({
    where: eq(schema.labels.boardId, boardId),
  });

  const cardIds = cardsResult.map((c) => c.id);
  const commentCounts: Record<string, number> = {};
  if (cardIds.length > 0) {
    const counts = await db
      .select({
        cardId: schema.comments.cardId,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.comments)
      .where(inArray(schema.comments.cardId, cardIds))
      .groupBy(schema.comments.cardId);
    for (const row of counts) {
      commentCounts[row.cardId] = row.count;
    }
  }

  const cardLabelMap: Record<string, Array<{ id: string; name: string; color: string }>> = {};
  if (cardIds.length > 0) {
    const cardLabelRows = await db.query.cardLabels.findMany({
      where: inArray(schema.cardLabels.cardId, cardIds),
      with: { label: { columns: { id: true, name: true, color: true } } },
    });
    for (const row of cardLabelRows) {
      if (!cardLabelMap[row.cardId]) cardLabelMap[row.cardId] = [];
      cardLabelMap[row.cardId].push(row.label);
    }
  }

  const attachmentCounts: Record<string, number> = {};
  if (cardIds.length > 0) {
    const attCounts = await db
      .select({
        cardId: schema.attachments.cardId,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.attachments)
      .where(inArray(schema.attachments.cardId, cardIds))
      .groupBy(schema.attachments.cardId);
    for (const row of attCounts) {
      attachmentCounts[row.cardId] = row.count;
    }
  }

  const lastColumn = columnsResult.length > 0 ? columnsResult[columnsResult.length - 1] : null;
  const subtaskCounts: Record<string, { total: number; done: number }> = {};
  for (const card of cardsResult) {
    if (card.parentCardId) {
      if (!subtaskCounts[card.parentCardId]) subtaskCounts[card.parentCardId] = { total: 0, done: 0 };
      subtaskCounts[card.parentCardId].total++;
      if (lastColumn && card.columnId === lastColumn.id) subtaskCounts[card.parentCardId].done++;
    }
  }

  const coverUrls = await cardCoverUrls(cardsResult);
  const cardSummaries = cardsResult.map((card) => ({
    id: card.id,
    columnId: card.columnId,
    swimlaneId: card.swimlaneId,
    parentCardId: card.parentCardId,
    cardType: card.cardType,
    title: card.title,
    coverAttachmentId: card.coverAttachmentId,
    coverMode: card.coverMode,
    coverImageUrl: card.coverAttachmentId ? coverUrls.get(card.coverAttachmentId) ?? null : null,
    position: card.position,
    dueDate: card.dueDate?.toISOString() ?? null,
    assignees: card.assignees.map((a) => ({
      id: a.user.id,
      displayName: a.user.displayName,
      avatarUrl: a.user.avatarUrl,
    })),
    labels: cardLabelMap[card.id] ?? [],
    commentCount: commentCounts[card.id] ?? 0,
    subtaskCount: subtaskCounts[card.id]?.total ?? 0,
    subtaskDoneCount: subtaskCounts[card.id]?.done ?? 0,
    attachmentCount: attachmentCounts[card.id] ?? 0,
  }));

  return {
    board: {
      ...board,
    backgroundImageUrl: board.backgroundImage ? storageProvider.getUrl(board.backgroundImage) : null,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    },
    columns: columnsResult,
    swimlanes: swimlanesResult,
    cards: cardSummaries,
    labels: labelsResult,
    permission,
  };
}
