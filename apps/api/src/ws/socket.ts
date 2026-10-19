import { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { WS_EVENTS } from '@trello-clone/shared';
import { pino } from 'pino';
import { requireBoardAccess } from '../middleware/boardAccess.js';

const logger = pino({ name: 'ws' });

let io: Server | null = null;
const BOARD_ACCESS_RECHECK_MS = 5_000;

async function boardAllowed(socket: Socket, userId: string, boardId: string): Promise<boolean> {
  try {
    // Verify the original access token again: a connected socket must not
    // retain board subscriptions after the JWT expires.
    const token = socket.handshake.auth.token;
    if (typeof token !== 'string') throw new Error('Missing access token');
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || payload.sub !== userId) {
      throw new Error('Invalid socket identity');
    }
    await requireBoardAccess(boardId, userId, 'read');
    return socket.connected;
  } catch {
    socket.leave(`board:${boardId}`);
    logger.warn({ userId, boardId, socketId: socket.id }, 'Board room access denied');
    return false;
  }
}


export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function setupSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.WEB_URL,
      credentials: true,
    },
    path: '/socket.io',
  });

  // Authenticate sockets via JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      if (typeof payload === 'string' || typeof payload.sub !== 'string' || !payload.sub) {
        return next(new Error('Invalid or expired token'));
      }
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    logger.info({ userId, socketId: socket.id }, 'Client connected');

    // Join user-specific room for notifications
    socket.join(`user:${userId}`);

    // Match the REST read-access decision before adding the user to a room.
    // Generation fences prevent a stale authorization result rejoining later.
    let joinGeneration = 0;
    const recheckTimer = setInterval(() => {
      void (async () => {
        for (const room of [...socket.rooms]) {
          if (!room.startsWith('board:')) continue;
          const id = room.slice('board:'.length);
          if (!id || !(await boardAllowed(socket, userId, id))) socket.leave(room);
        }
      })();
    }, BOARD_ACCESS_RECHECK_MS);
    recheckTimer.unref?.();

    socket.on(WS_EVENTS.BOARD_JOIN, async (boardId: string) => {
      const generation = ++joinGeneration;
      for (const room of socket.rooms) {
        if (room.startsWith('board:')) socket.leave(room);
      }
      if (typeof boardId !== 'string' || !boardId.trim()) return;
      if (!(await boardAllowed(socket, userId, boardId))) return;
      if (generation !== joinGeneration || !socket.connected) return;
      await socket.join(`board:${boardId}`);
      logger.info({ userId, boardId, socketId: socket.id }, 'Joined authorized board room');
    });

    // Leave a board room
    socket.on(WS_EVENTS.BOARD_LEAVE, (boardId: string) => {
      if (typeof boardId !== 'string' || !boardId) return;
      joinGeneration++;
      socket.leave(`board:${boardId}`);
      logger.info({ userId, boardId, socketId: socket.id }, 'Left board room');
    });

    socket.on('disconnect', (reason) => {
      joinGeneration++;
      clearInterval(recheckTimer);
      logger.info({ userId, socketId: socket.id, reason }, 'Client disconnected');
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}
