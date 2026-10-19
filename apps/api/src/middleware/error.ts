import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { pino } from 'pino';

const logger = pino({ name: 'error-handler' });

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err);

  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Files must be 10 MiB or smaller' });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
