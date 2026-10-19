import multer from 'multer';
import { AppError } from './error.js';
import { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from '@trello-clone/shared';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (process.env.NODE_ENV === 'production' && process.env.STORAGE_BACKEND !== 's3') {
      cb(new AppError(503, 'Uploads require persistent storage to be configured'));
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new AppError(400, `File type '${file.mimetype}' is not allowed`));
      return;
    }
    cb(null, true);
  },
});
