import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-min-10-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-min-10-chars',
    DATABASE_URL: 'postgresql://localhost:5432/test_db',
  },
}));

vi.mock('../../db/index.js', async () => ({
  db: {
    query: {
      cards: { findFirst: vi.fn(), findMany: vi.fn() },
      attachments: { findFirst: vi.fn(), findMany: vi.fn() },
      columns: { findFirst: vi.fn() },
      swimlanes: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  schema: await import('../../db/schema.js'),
}));

vi.mock('../../middleware/boardAccess.js', () => ({
  requireBoardAccess: vi.fn().mockResolvedValue({ board: { id: 'board-1' }, permission: 'edit' }),
}));

import { db } from '../../db/index.js';
import { requireBoardAccess } from '../../middleware/boardAccess.js';
import { createCard, getCard, updateCard, moveCard, deleteCard } from './cards.service.js';

type MockedDb = {
  query: {
    cards: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    attachments: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    columns: { findFirst: ReturnType<typeof vi.fn> };
    swimlanes: { findFirst: ReturnType<typeof vi.fn> };
  };
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const dbMock = db as unknown as MockedDb;

const mockCard = {
  id: 'card-1',
  boardId: 'board-1',
  columnId: 'col-1',
  swimlaneId: 'lane-1',
  parentCardId: null,
  cardType: 'task',
  title: 'Test card',
  description: null,
  position: 'a0',
  dueDate: null,
  isArchived: false,
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockColumn = { id: 'col-1', boardId: 'board-1', name: 'To Do', position: 'a0' };
const mockSwimlane = { id: 'lane-1', boardId: 'board-1', name: 'Default', isDefault: true };

function makeUpdateReturning(data: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(data),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireBoardAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
    board: { id: 'board-1' },
    permission: 'edit',
  });
});

// ---------------------------------------------------------------------------
// createCard
// ---------------------------------------------------------------------------

describe('createCard', () => {
  it('throws 404 when column not found on board', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(null);

    await expect(
      createCard('board-1', 'user-1', { columnId: 'col-999', title: 'New card' }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Column not found on this board' });
  });

  it('uses the default swimlane when no swimlaneId is provided', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.swimlanes.findFirst.mockResolvedValue(mockSwimlane);
    dbMock.query.cards.findMany.mockResolvedValue([]);
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockCard]),
      }),
    });

    const result = await createCard('board-1', 'user-1', { columnId: 'col-1', title: 'New card' });

    expect(dbMock.query.swimlanes.findFirst).toHaveBeenCalled();
    expect(result).toEqual(mockCard);
  });

  it('throws 500 when board has no default swimlane', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.swimlanes.findFirst.mockResolvedValue(null);

    await expect(
      createCard('board-1', 'user-1', { columnId: 'col-1', title: 'New card' }),
    ).rejects.toMatchObject({ statusCode: 500, message: 'Board has no default swimlane' });
  });

  it('throws 404 when explicit swimlaneId not found on board', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.swimlanes.findFirst.mockResolvedValue(null);

    await expect(
      createCard('board-1', 'user-1', { columnId: 'col-1', swimlaneId: 'lane-999', title: 'New card' }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Swimlane not found on this board' });
  });

  it('throws 404 when parentCardId not found on board', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.swimlanes.findFirst.mockResolvedValue(mockSwimlane);
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(
      createCard('board-1', 'user-1', { columnId: 'col-1', parentCardId: 'card-999', title: 'New card' }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Parent card not found on this board' });
  });

  it('throws 400 when parent card already has a parent', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.swimlanes.findFirst.mockResolvedValue(mockSwimlane);
    dbMock.query.cards.findFirst.mockResolvedValue({
      ...mockCard,
      id: 'card-parent',
      parentCardId: 'card-grandparent',
    });

    await expect(
      createCard('board-1', 'user-1', { columnId: 'col-1', parentCardId: 'card-parent', title: 'New card' }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Cannot nest subtasks more than one level deep' });
  });

  it('creates and returns card on happy path', async () => {
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.swimlanes.findFirst.mockResolvedValue(mockSwimlane);
    dbMock.query.cards.findMany.mockResolvedValue([]);
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockCard]),
      }),
    });

    const result = await createCard('board-1', 'user-1', { columnId: 'col-1', title: 'New card' });

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'edit');
    expect(result).toEqual(mockCard);
  });
});

// ---------------------------------------------------------------------------
// getCard
// ---------------------------------------------------------------------------

describe('getCard', () => {
  it('throws 404 when card not found', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(getCard('card-999', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Card not found',
    });
  });

  it('returns card with mapped relations', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue({
      ...mockCard,
      assignees: [],
      comments: [],
      cardLabels: [],
      attachments: [],
      parentCard: null,
    });
    dbMock.query.cards.findMany.mockResolvedValue([]);

    const result = await getCard('card-1', 'user-1');

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'read');
    expect(result).toMatchObject({
      id: 'card-1',
      assignees: [],
      labels: [],
      comments: [],
      attachments: [],
      subtasks: [],
      parentCard: null,
    });
  });
});

// ---------------------------------------------------------------------------
// updateCard
// ---------------------------------------------------------------------------

describe('updateCard', () => {
  it('throws 404 when card not found', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(updateCard('card-999', 'user-1', { title: 'Updated' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Card not found',
    });
  });

  it('throws 400 when parentCardId equals cardId (self-reference)', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);

    await expect(
      updateCard('card-1', 'user-1', { parentCardId: 'card-1' }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'A card cannot be its own parent' });
  });

  it('throws 404 when new parent card not found on board', async () => {
    dbMock.query.cards.findFirst
      .mockResolvedValueOnce(mockCard)
      .mockResolvedValueOnce(null);

    await expect(
      updateCard('card-1', 'user-1', { parentCardId: 'card-parent' }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Parent card not found on this board' });
  });

  it('throws 400 when new parent already has a parent', async () => {
    dbMock.query.cards.findFirst
      .mockResolvedValueOnce(mockCard)
      .mockResolvedValueOnce({ ...mockCard, id: 'card-parent', parentCardId: 'card-grandparent' });

    await expect(
      updateCard('card-1', 'user-1', { parentCardId: 'card-parent' }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Cannot nest subtasks more than one level deep' });
  });

  it('throws 400 when card already has children and trying to set a parent', async () => {
    dbMock.query.cards.findFirst
      .mockResolvedValueOnce(mockCard)
      .mockResolvedValueOnce({ ...mockCard, id: 'card-parent', parentCardId: null });
    dbMock.query.cards.findMany.mockResolvedValue([
      { ...mockCard, id: 'child-card', parentCardId: 'card-1' },
    ]);

    await expect(
      updateCard('card-1', 'user-1', { parentCardId: 'card-parent' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot set parent on a card that already has subtasks',
    });
  });

  it('updates and returns card on happy path', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.update.mockReturnValue(makeUpdateReturning([{ ...mockCard, title: 'Updated title' }]));

    const result = await updateCard('card-1', 'user-1', { title: 'Updated title' });

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'edit');
    expect(result).toMatchObject({ title: 'Updated title' });
  });
});

// ---------------------------------------------------------------------------
// moveCard
// ---------------------------------------------------------------------------

describe('moveCard', () => {
  it('throws 404 when card not found', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(
      moveCard('card-999', 'user-1', { columnId: 'col-1', afterId: null }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Card not found' });
  });

  it('throws 404 when target column not found on board', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.query.columns.findFirst.mockResolvedValue(null);

    await expect(
      moveCard('card-1', 'user-1', { columnId: 'col-999', afterId: null }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Target column not found on this board' });
  });

  it('places card at beginning when afterId is null', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.cards.findMany.mockResolvedValue([
      { ...mockCard, id: 'card-2', position: 'a1' },
    ]);
    dbMock.update.mockReturnValue(makeUpdateReturning([{ ...mockCard, columnId: 'col-1' }]));

    const result = await moveCard('card-1', 'user-1', { columnId: 'col-1', afterId: null });

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'edit');
    expect(result).toMatchObject({ columnId: 'col-1' });
  });

  it('moves card between two existing cards when afterId is provided', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.query.columns.findFirst.mockResolvedValue(mockColumn);
    dbMock.query.cards.findMany.mockResolvedValue([
      { ...mockCard, id: 'card-2', position: 'a1' },
      { ...mockCard, id: 'card-3', position: 'a2' },
    ]);
    dbMock.update.mockReturnValue(makeUpdateReturning([{ ...mockCard, position: 'a1V' }]));

    const result = await moveCard('card-1', 'user-1', { columnId: 'col-1', afterId: 'card-2' });

    expect(result).toBeDefined();
    expect(dbMock.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteCard
// ---------------------------------------------------------------------------

describe('deleteCard', () => {
  it('throws 404 when card not found', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(deleteCard('card-999', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Card not found',
    });
  });

  it('deletes card on success', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    await deleteCard('card-1', 'user-1');

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'edit');
    expect(dbMock.delete).toHaveBeenCalled();
  });
});

describe('card image ownership', () => {
  it('rejects an attachment that is not attached to this card', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.query.attachments.findFirst.mockResolvedValue(undefined);
    await expect(updateCard('card-1', 'user-1', { coverAttachmentId: 'other-attachment' })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbMock.update).not.toHaveBeenCalled();
  });
  it('rejects non-raster documents as covers', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.query.attachments.findFirst.mockResolvedValue({ id: 'pdf', cardId: 'card-1', mimeType: 'application/pdf' });
    await expect(updateCard('card-1', 'user-1', { coverAttachmentId: 'pdf' })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbMock.update).not.toHaveBeenCalled();
  });
  it('persists an owned image and resolves its URL in the update response', async () => {
    const image = { id: 'image', cardId: 'card-1', mimeType: 'image/png', storagePath: 'attachments/image.png' };
    dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
    dbMock.query.attachments.findFirst.mockResolvedValue(image);
    dbMock.query.attachments.findMany.mockResolvedValue([image]);
    dbMock.update.mockReturnValue(makeUpdateReturning([{ ...mockCard, coverAttachmentId: 'image', coverMode: 'background' }]));
    const result = await updateCard('card-1', 'user-1', { coverAttachmentId: 'image', coverMode: 'background' });
    expect(result).toMatchObject({ coverAttachmentId: 'image', coverMode: 'background', coverImageUrl: '/uploads/attachments/image.png' });
  });
});
