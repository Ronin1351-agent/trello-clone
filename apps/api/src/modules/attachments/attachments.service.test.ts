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
      cards: { findFirst: vi.fn() },
      attachments: { findMany: vi.fn(), findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    delete: vi.fn(),
  },
  schema: await import('../../db/schema.js'),
}));

vi.mock('../../middleware/boardAccess.js', () => ({
  requireBoardAccess: vi.fn().mockResolvedValue({ board: { id: 'board-1' }, permission: 'edit' }),
}));

vi.mock('../../lib/storage/index.js', () => ({
  storageProvider: {
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getUrl: vi.fn().mockReturnValue('/uploads/attachments/mock-uuid.png'),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    promises: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { db } from '../../db/index.js';
import { requireBoardAccess } from '../../middleware/boardAccess.js';
import { addAttachment, listAttachments, deleteAttachment } from './attachments.service.js';

type MockedDb = {
  query: {
    cards: { findFirst: ReturnType<typeof vi.fn> };
    attachments: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    users: { findFirst: ReturnType<typeof vi.fn> };
  };
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const dbMock = db as unknown as MockedDb;

const mockCard = { id: 'card-1', boardId: 'board-1' };

const mockFile = {
  originalname: 'test.png',
  buffer: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),
  mimetype: 'image/png',
  size: 12345,
} as Express.Multer.File;

const mockAttachmentRow = {
  id: 'att-1',
  cardId: 'card-1',
  uploadedBy: 'user-1',
  filename: 'test.png',
  storagePath: 'stored-uuid.png',
  mimeType: 'image/png',
  sizeBytes: 12345,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const mockUser = { id: 'user-1', displayName: 'Test User', avatarUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  (requireBoardAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
    board: { id: 'board-1' },
    permission: 'edit',
  });
  dbMock.query.cards.findFirst.mockResolvedValue(mockCard);
});

// ---------------------------------------------------------------------------
// addAttachment
// ---------------------------------------------------------------------------

describe('addAttachment', () => {
  it('calls requireBoardAccess with "edit"', async () => {
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockAttachmentRow]),
      }),
    });
    dbMock.query.users.findFirst.mockResolvedValue(mockUser);

    await addAttachment('board-1', 'card-1', 'user-1', mockFile);

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'edit');
  });

  it('throws 404 when card not found on board', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(addAttachment('board-1', 'card-1', 'user-1', mockFile)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Card not found',
    });
  });

  it('inserts attachment and returns with uploader info', async () => {
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockAttachmentRow]),
      }),
    });
    dbMock.query.users.findFirst.mockResolvedValue(mockUser);

    const result = await addAttachment('board-1', 'card-1', 'user-1', mockFile);

    expect(result).toMatchObject({
      id: 'att-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      url: '/uploads/attachments/mock-uuid.png',
      uploader: mockUser,
    });
    expect(dbMock.insert).toHaveBeenCalledOnce();
  });

  it('uses fallback uploader when user not found', async () => {
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockAttachmentRow]),
      }),
    });
    dbMock.query.users.findFirst.mockResolvedValue(null);

    const result = await addAttachment('board-1', 'card-1', 'user-1', mockFile);

    expect(result.uploader).toEqual({ id: 'user-1', displayName: 'Unknown', avatarUrl: null });
  });
});

// ---------------------------------------------------------------------------
// listAttachments
// ---------------------------------------------------------------------------

describe('listAttachments', () => {
  it('calls requireBoardAccess with "read"', async () => {
    dbMock.query.attachments.findMany.mockResolvedValue([]);

    await listAttachments('board-1', 'card-1', 'user-1');

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'read');
  });

  it('throws 404 when card not found on board', async () => {
    dbMock.query.cards.findFirst.mockResolvedValue(null);

    await expect(listAttachments('board-1', 'card-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Card not found',
    });
  });

  it('returns attachments list with ISO createdAt', async () => {
    dbMock.query.attachments.findMany.mockResolvedValue([
      { ...mockAttachmentRow, uploader: mockUser },
    ]);

    const result = await listAttachments('board-1', 'card-1', 'user-1');

    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result[0].url).toBe('/uploads/attachments/mock-uuid.png');
  });
});

// ---------------------------------------------------------------------------
// deleteAttachment
// ---------------------------------------------------------------------------

describe('deleteAttachment', () => {
  it('calls requireBoardAccess with "edit"', async () => {
    dbMock.query.attachments.findFirst.mockResolvedValue(mockAttachmentRow);
    dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    await deleteAttachment('board-1', 'card-1', 'att-1', 'user-1');

    expect(requireBoardAccess).toHaveBeenCalledWith('board-1', 'user-1', 'edit');
  });

  it('throws 404 when attachment not found', async () => {
    dbMock.query.attachments.findFirst.mockResolvedValue(null);

    await expect(deleteAttachment('board-1', 'card-1', 'att-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Attachment not found',
    });
  });

  it('deletes attachment when found', async () => {
    dbMock.query.attachments.findFirst.mockResolvedValue(mockAttachmentRow);
    dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    await deleteAttachment('board-1', 'card-1', 'att-1', 'user-1');

    expect(dbMock.delete).toHaveBeenCalledOnce();
  });
});
