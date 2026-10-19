import { createServer, type Server as HttpServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

vi.mock('../config/env.js', () => ({
  env: { JWT_SECRET: 'test-socket-secret-at-least-32-chars', WEB_URL: 'http://localhost:5173' },
}));
vi.mock('../middleware/boardAccess.js', () => ({ requireBoardAccess: vi.fn() }));

import { requireBoardAccess } from '../middleware/boardAccess.js';
import { setupSocketIO } from './socket.js';

const SECRET = 'test-socket-secret-at-least-32-chars';
const access = vi.mocked(requireBoardAccess);
let server: HttpServer;
let socketServer: ReturnType<typeof setupSocketIO>;
let port: number;
const clients: ClientSocket[] = [];

function token(userId: string, expiresIn = '15m') {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
}

async function connect(userId: string, accessToken = token(userId)): Promise<ClientSocket> {
  const client = createClient(`http://127.0.0.1:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token: accessToken },
    reconnection: false,
    timeout: 2000,
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

async function waitForRoom(boardId: string, minimum: number) {
  const room = `board:${boardId}`;
  const deadline = Date.now() + 2000;
  while ((socketServer.sockets.adapter.rooms.get(room)?.size ?? 0) < minimum) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for authorized board room');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  access.mockReset();
  access.mockImplementation(async (boardId, userId) => {
    if (boardId === 'board-1' && (userId === 'member' || userId === 'shared')) {
      return { board: {} as never, permission: 'read' };
    }
    throw new Error('Forbidden');
  });
  server = createServer();
  socketServer = setupSocketIO(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid test address');
  port = address.port;
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await new Promise<void>((resolve) => socketServer.close(() => resolve()));
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('A2a real Socket.IO board subscription authorization', () => {
  it('delivers only to authorized member and user-share clients; unauthorized client receives zero events', async () => {
    const member = await connect('member');
    const shared = await connect('shared');
    const denied = await connect('outsider');
    const received: Record<string, string[]> = { member: [], shared: [], denied: [] };
    member.on('synthetic:card', (data) => received.member.push(data.title));
    shared.on('synthetic:card', (data) => received.shared.push(data.title));
    denied.on('synthetic:card', (data) => received.denied.push(data.title));

    member.emit('board:join', 'board-1');
    shared.emit('board:join', 'board-1');
    denied.emit('board:join', 'board-1');
    await waitForRoom('board-1', 2);
    await pause(80);
    expect(socketServer.sockets.adapter.rooms.get('board:board-1')?.size).toBe(2);

    socketServer.to('board:board-1').emit('synthetic:card', { title: 'Synthetic title' });
    await pause(100);
    expect(received.member).toEqual(['Synthetic title']);
    expect(received.shared).toEqual(['Synthetic title']);
    expect(received.denied).toEqual([]);
  });

  it('does not deliver to a removed member after revalidation', async () => {
    const member = await connect('member');
    const seen: string[] = [];
    member.on('synthetic:card', (data) => seen.push(data.title));
    member.emit('board:join', 'board-1');
    await waitForRoom('board-1', 1);

    access.mockRejectedValue(new Error('Member removed'));
    // The server rechecks permissions every 5 seconds. Wait for the next tick.
    await pause(5200);
    expect(socketServer.sockets.adapter.rooms.get('board:board-1')?.size ?? 0).toBe(0);
    socketServer.to('board:board-1').emit('synthetic:card', { title: 'Protected after revocation' });
    await pause(80);
    expect(seen).toEqual([]);
  }, 10_000);

  it('rejects expired JWTs at the transport handshake', async () => {
    const expired = token('member', -1);
    const client = createClient(`http://127.0.0.1:${port}`, {
      path: '/socket.io', transports: ['websocket'], reconnection: false,
      auth: { token: expired }, timeout: 2000,
    });
    clients.push(client);
    const error = await new Promise<Error>((resolve, reject) => {
      client.once('connect', () => reject(new Error('Unexpected successful connection')));
      client.once('connect_error', resolve);
    });
    expect(error.message).toContain('Invalid or expired token');
  });

  it('reconnects through authorization and denies a subsequently revoked share', async () => {
    const user = await connect('shared');
    user.emit('board:join', 'board-1');
    await waitForRoom('board-1', 1);
    user.disconnect();
    access.mockRejectedValue(new Error('Share revoked'));
    const retry = await connect('shared');
    retry.emit('board:join', 'board-1');
    await pause(80);
    expect(socketServer.sockets.adapter.rooms.get('board:board-1')?.size ?? 0).toBe(0);
  });
});
