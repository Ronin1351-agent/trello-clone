import { setBoardBackground } from './board-background.service.js';
import { AppError } from '../../middleware/error.js';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../middleware/auth.js';
import * as boardsService from './boards.service.js';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const board = await boardsService.createBoard(req.params.teamId as string, req.userId!, req.body);
    res.status(201).json({ board });
  } catch (err) {
    next(err);
  }
}

export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const boards = await boardsService.listBoards(req.params.teamId as string, req.userId!);
    res.json({ boards });
  } catch (err) {
    next(err);
  }
}

export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const board = await boardsService.getBoard(req.params.boardId as string, req.userId!);
    res.json({ board });
  } catch (err) {
    next(err);
  }
}

export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const board = await boardsService.updateBoard(req.params.boardId as string, req.userId!, req.body);
    res.json({ board });
  } catch (err) {
    next(err);
  }
}

export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await boardsService.deleteBoard(req.params.boardId as string, req.userId!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function backgroundHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (req.method !== 'DELETE' && !req.file) throw new AppError(400, 'No image uploaded');
    const result = await setBoardBackground(req.params.boardId as string, req.userId!, req.file);
    res.json(result);
  } catch (error) { next(error); }
}
