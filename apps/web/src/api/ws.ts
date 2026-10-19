import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore.js';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      // Connect straight to the persistent API host; keep HTTP API calls same-origin.
      transports: ['websocket'],
      autoConnect: false,
      withCredentials: true,
      auth: () => ({
        token: useAuthStore.getState().accessToken,
      }),
    });
  }
  return socket;
}

/**
 * Connect the socket if it's not already connected.
 * Uses the current access token from the auth store.
 */
export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    // Update auth token before connecting
    s.auth = { token: useAuthStore.getState().accessToken };
    s.connect();
  }
  return s;
}

/**
 * Disconnect the socket.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
  }
}

/**
 * Get the current socket ID (used for x-socket-id header to exclude self from broadcasts).
 */
export function getSocketId(): string | undefined {
  return socket?.id;
}
