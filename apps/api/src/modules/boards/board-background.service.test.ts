import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  transaction: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  validate: vi.fn(),
  getUrl: vi.fn(),
}));
vi.mock('../../db/index.js', () => ({
  db: { transaction: mocks.transaction },
  schema: { boards: { id: 'id' } },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('../../middleware/boardAccess.js', () => ({ requireBoardAccess: mocks.access }));
vi.mock('../../lib/storage/index.js', () => ({
  storageProvider: { upload: mocks.upload, delete: mocks.remove, getUrl: mocks.getUrl },
}));
vi.mock('../../lib/images.js', () => ({ validateImage: mocks.validate }));
import { setBoardBackground } from './board-background.service.js';
const file = { buffer: Buffer.from('synthetic'), mimetype: 'image/png' } as Express.Multer.File;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({});
  mocks.validate.mockReturnValue('.png');
  mocks.upload.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.getUrl.mockImplementation((key) => '/uploads/' + key);
});
function transaction(previous: string | null) {
  const persist = vi.fn().mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      select: () => ({
        from: () => ({ where: () => ({ for: async () => [{ backgroundImage: previous }] }) }),
      }),
      update: () => ({ set: () => ({ where: persist }) }),
    }),
  );
  return persist;
}
describe('board background lifecycle', () => {
  it('denies readers before storing any file', async () => {
    mocks.access.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
    await expect(setBoardBackground('board', 'reader', file)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('replaces the old image only after the database succeeds', async () => {
    const persist = transaction('board-backgrounds/old.png');
    const result = await setBoardBackground('board', 'editor', file);
    expect(persist).toHaveBeenCalled();
    expect(mocks.access).toHaveBeenCalledWith('board', 'editor', 'edit');
    expect(result.backgroundImageUrl).toMatch(/^\/uploads\/board-backgrounds\/.*\.png$/);
    expect(mocks.remove).toHaveBeenCalledWith('board-backgrounds/old.png');
  });
  it('removes a background without requiring another file', async () => {
    transaction('board-backgrounds/old.png');
    expect(await setBoardBackground('board', 'editor')).toEqual({ backgroundImageUrl: null });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith('board-backgrounds/old.png');
  });
  it('cleans up the new upload on database failure and preserves the old object', async () => {
    mocks.transaction.mockRejectedValue(new Error('DB failure'));
    await expect(setBoardBackground('board', 'editor', file)).rejects.toThrow('DB failure');
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove.mock.calls[0][0]).toMatch(/^board-backgrounds\/.*\.png$/);
  });
});
