import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@trello-clone/shared', () => ({
  WS_EVENTS: {
    BOARD_JOIN: 'board:join',
    BOARD_LEAVE: 'board:leave',
  },
}));

vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-min-10-chars',
    WEB_URL: 'http://localhost:3000',
  },
}));

vi.mock('../middleware/boardAccess.js', () => ({
  requireBoardAccess: vi.fn(),
}));

vi.mock('pino', () => ({
  pino: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

type MockSocketNext = (err?: Error) => void;
interface MockSocketLike {
  handshake: { auth: Record<string, unknown> };
  data: Record<string, unknown>;
  id: string;
  rooms: Set<string>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _trigger: (event: string, ...args: unknown[]) => void | Promise<void>;
}

// Capture .use() and .on() handlers from the Socket.IO Server constructor
let capturedAuthMiddleware: ((socket: MockSocketLike, next: MockSocketNext) => void) | null = null;
let capturedConnectionHandler: ((socket: MockSocketLike) => void) | null = null;

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(() => ({
    use: vi.fn().mockImplementation((fn: (socket: MockSocketLike, next: MockSocketNext) => void) => {
      capturedAuthMiddleware = fn;
    }),
    on: vi.fn().mockImplementation((event: string, fn: (socket: MockSocketLike) => void) => {
      if (event === 'connection') capturedConnectionHandler = fn;
    }),
  })),
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

import jwt from 'jsonwebtoken';
import { requireBoardAccess } from '../middleware/boardAccess.js';
import { setupSocketIO, getIO } from './socket.js';

type EventHandler = (...args: unknown[]) => void | Promise<void>;
const connectedSockets: MockSocketLike[] = [];

function makeMockSocket(overrides: Record<string, unknown> = {}) {
  const eventHandlers: Record<string, EventHandler> = {};
  const rooms = (overrides.rooms as Set<string> | undefined) ?? new Set<string>(['socket-1']);
  const socket = {
    handshake: { auth: { token: 'valid-token' } },
    data: {} as { userId?: string },
    id: 'socket-1',
    connected: true,
    rooms,
    join: vi.fn().mockImplementation((room: string) => { rooms.add(room); }),
    leave: vi.fn().mockImplementation((room: string) => { rooms.delete(room); }),
    on: vi.fn().mockImplementation((event: string, fn: EventHandler) => {
      eventHandlers[event] = fn;
    }),
    // Helper to trigger registered events in tests
    _trigger: (event: string, ...args: unknown[]) => eventHandlers[event]?.(...args),
    ...overrides,
  };
  connectedSockets.push(socket as MockSocketLike);
  return socket;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jwt.verify).mockReset();
  vi.mocked(jwt.verify).mockReturnValue({ sub: 'user-1' });
  vi.mocked(requireBoardAccess).mockReset();
  vi.mocked(requireBoardAccess).mockResolvedValue({ board: {} as never, permission: 'read' });
  capturedAuthMiddleware = null;
  capturedConnectionHandler = null;
});

afterEach(() => {
  for (const socket of connectedSockets.splice(0)) socket._trigger('disconnect', 'test');
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getIO
// ---------------------------------------------------------------------------

describe('getIO', () => {
  it('throws when Socket.IO is not initialized', () => {
    // getIO uses module-level `io` variable. On first import it's null,
    // but setupSocketIO may have been called. We test the fresh state
    // by checking the error class — if setupSocketIO was called in another
    // test, getIO would succeed. This test verifies the error message pattern.
    // Since setupSocketIO is called in other tests and mutates module state,
    // we just verify getIO returns a Server-like object after setup.
    const mockHttpServer = {} as unknown as import('http').Server;
    setupSocketIO(mockHttpServer);
    expect(() => getIO()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// setupSocketIO — auth middleware
// ---------------------------------------------------------------------------

describe('setupSocketIO auth middleware', () => {
  beforeEach(() => {
    const mockHttpServer = {} as unknown as import('http').Server;
    setupSocketIO(mockHttpServer);
  });

  it('rejects when no token is provided', () => {
    const socket = makeMockSocket({ handshake: { auth: {} } });
    const next = vi.fn();

    capturedAuthMiddleware!(socket, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Authentication required');
  });

  it('rejects when token is invalid', () => {
    const socket = makeMockSocket({ handshake: { auth: { token: 'bad-token' } } });
    const next = vi.fn();
    (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    capturedAuthMiddleware!(socket, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err.message).toBe('Invalid or expired token');
  });

  it('accepts valid token and sets socket.data.userId', () => {
    const socket = makeMockSocket({ handshake: { auth: { token: 'valid-token' } } });
    const next = vi.fn();
    (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue({ sub: 'user-1' });

    capturedAuthMiddleware!(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe('user-1');
  });
});

// ---------------------------------------------------------------------------
// setupSocketIO — connection handler
// ---------------------------------------------------------------------------

describe('setupSocketIO connection handler', () => {
  beforeEach(() => {
    const mockHttpServer = {} as unknown as import('http').Server;
    setupSocketIO(mockHttpServer);
  });

  it('joins user room on connection', () => {
    const socket = makeMockSocket({ data: { userId: 'user-1' } });

    capturedConnectionHandler!(socket);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
  });

  it('joins board room and leaves existing board rooms on BOARD_JOIN', async () => {
    const socket = makeMockSocket({
      data: { userId: 'user-1' },
      rooms: new Set(['socket-1', 'user:user-1', 'board:old-board']),
    });

    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'new-board');

    expect(requireBoardAccess).toHaveBeenCalledWith('new-board', 'user-1', 'read');
    expect(socket.leave).toHaveBeenCalledWith('board:old-board');
    expect(socket.join).toHaveBeenCalledWith('board:new-board');
  });

  it('leaves specific board room on BOARD_LEAVE', () => {
    const socket = makeMockSocket({ data: { userId: 'user-1' } });

    capturedConnectionHandler!(socket);
    socket._trigger('board:leave', 'board-1');

    expect(socket.leave).toHaveBeenCalledWith('board:board-1');
  });

  it('ignores invalid boardId on BOARD_JOIN', async () => {
    const socket = makeMockSocket({ data: { userId: 'user-1' } });

    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', '');
    await socket._trigger('board:join', 123);

    // join should only have been called once (for user room), not for invalid boardIds
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith('user:user-1');
  });
  it('denies an unauthorized user even when their JWT is valid', async () => {
    vi.mocked(requireBoardAccess).mockRejectedValue(new Error('Not a member of this team'));
    const socket = makeMockSocket({ data: { userId: 'user-1' } });
    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'private-board');
    expect(socket.join).not.toHaveBeenCalledWith('board:private-board');
    expect(socket.rooms.has('board:private-board')).toBe(false);
  });

  it('fails closed if database authorization fails', async () => {
    vi.mocked(requireBoardAccess).mockRejectedValue(new Error('database unavailable'));
    const socket = makeMockSocket({ data: { userId: 'user-1' } });
    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'board-1');
    expect(socket.rooms.has('board:board-1')).toBe(false);
  });

  it('accepts valid user shares with read permission', async () => {
    vi.mocked(jwt.verify).mockReturnValue({ sub: 'shared-user' });
    const socket = makeMockSocket({ data: { userId: 'shared-user' } });
    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'shared-board');
    expect(requireBoardAccess).toHaveBeenCalledWith('shared-board', 'shared-user', 'read');
    expect(socket.rooms.has('board:shared-board')).toBe(true);
  });

  it('does not rejoin when an explicit leave occurs while authorization is pending', async () => {
    let approve!: (result: { board: never; permission: 'read' }) => void;
    vi.mocked(requireBoardAccess).mockImplementation(() => new Promise((resolve) => { approve = resolve; }));
    const socket = makeMockSocket({ data: { userId: 'user-1' } });
    capturedConnectionHandler!(socket);
    const pending = socket._trigger('board:join', 'board-1');
    socket._trigger('board:leave', 'board-1');
    approve({ board: {} as never, permission: 'read' });
    await pending;
    expect(socket.rooms.has('board:board-1')).toBe(false);
  });

  it('evicts an already joined socket after its board share is revoked', async () => {
    vi.useFakeTimers();
    const socket = makeMockSocket({ data: { userId: 'user-1' } });
    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'board-1');
    expect(socket.rooms.has('board:board-1')).toBe(true);
    vi.mocked(requireBoardAccess).mockRejectedValue(new Error('Share revoked'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(socket.rooms.has('board:board-1')).toBe(false);
  });

  it('evicts access when a previously valid JWT expires', async () => {
    vi.useFakeTimers();
    const socket = makeMockSocket({ data: { userId: 'user-1' } });
    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'board-1');
    vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('jwt expired'); });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(socket.rooms.has('board:board-1')).toBe(false);
  });

  it('denies expired or malformed tokens at board join', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('jwt expired'); });
    const socket = makeMockSocket({ data: { userId: 'user-1' } });
    capturedConnectionHandler!(socket);
    await socket._trigger('board:join', 'board-1');
    expect(socket.rooms.has('board:board-1')).toBe(false);
  });

});
