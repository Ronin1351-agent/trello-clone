import { describe, it, expect, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ db: {}, schema: {} }));
vi.mock('./storage/index.js', () => ({ storageProvider: {} }));
import { validateImage } from './images.js';
const file = (buffer: Buffer, mimetype = 'image/png') =>
  ({ buffer, mimetype, size: buffer.length }) as Express.Multer.File;
describe('decorative image validation', () => {
  it('accepts a PNG signature and uses a server-selected extension', () => {
    expect(validateImage(file(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))).toBe('.png');
  });
  it('rejects a renamed text file and active SVG', () => {
    expect(() => validateImage(file(Buffer.from('<script>')))).toThrow('valid JPEG');
    expect(() => validateImage(file(Buffer.from('<svg/>'), 'image/svg+xml'))).toThrow('valid JPEG');
  });
  it('rejects empty and oversized uploads', () => {
    expect(() => validateImage(file(Buffer.alloc(0)))).toThrow();
    expect(() => validateImage(file(Buffer.alloc(10 * 1024 * 1024 + 1)))).toThrow('10 MiB');
  });
});
