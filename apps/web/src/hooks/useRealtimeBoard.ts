import { useEffect, useRef } from 'react';
import { WS_EVENTS } from '@trello-clone/shared';
import type { CardSummary, Column, Swimlane, Label } from '@trello-clone/shared';
import { connectSocket } from '../api/ws.js';
import { useBoardStore } from '../stores/boardStore.js';

/**
 * Hook that manages real-time board updates via Socket.IO.
 * Joins the board room on mount, leaves on unmount.
 * Listens for all board mutation events and updates the Zustand store.
 */
export function useRealtimeBoard(boardId: string | undefined) {
  const connectedBoardRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!boardId) return;

    const socket = connectSocket();

    function joinBoard() {
      socket.emit(WS_EVENTS.BOARD_JOIN, boardId);
      connectedBoardRef.current = boardId;
    }

    // Join once connected (or immediately if already connected)
    if (socket.connected) {
      joinBoard();
    }
    socket.on('connect', joinBoard);

    // --- Card events ---
    socket.on(WS_EVENTS.CARD_CREATED, (data: { card: CardSummary }) => {
      useBoardStore.getState().addCard(data.card);
    });

    socket.on(WS_EVENTS.CARD_UPDATED, (data: { card: CardSummary }) => {
      useBoardStore.getState().updateCard(data.card.id, data.card);
    });

    socket.on(WS_EVENTS.CARD_MOVED, (data: { card: CardSummary }) => {
      useBoardStore.getState().moveCard(
        data.card.id,
        data.card.columnId,
        data.card.swimlaneId,
        data.card.position,
      );
    });

    socket.on(WS_EVENTS.CARD_ARCHIVED, (data: { cardId: string }) => {
      useBoardStore.getState().removeCard(data.cardId);
    });

    // --- Column events ---
    socket.on(WS_EVENTS.COLUMN_CREATED, (data: { column: Column }) => {
      useBoardStore.getState().addColumn(data.column);
    });

    socket.on(WS_EVENTS.COLUMN_UPDATED, (data: { column: Column }) => {
      useBoardStore.getState().updateColumn(data.column.id, data.column);
    });

    socket.on(WS_EVENTS.COLUMN_MOVED, (data: { column: Column }) => {
      const store = useBoardStore.getState();
      store.updateColumn(data.column.id, { position: data.column.position });
      // Re-sort columns after position change
      const board = store.board;
      if (board) {
        const sorted = [...board.columns].sort((a, b) => a.position.localeCompare(b.position));
        store.reorderColumns(sorted);
      }
    });

    socket.on(WS_EVENTS.COLUMN_DELETED, (data: { columnId: string }) => {
      useBoardStore.getState().removeColumn(data.columnId);
    });

    // --- Swimlane events ---
    socket.on(WS_EVENTS.SWIMLANE_CREATED, (data: { swimlane: Swimlane }) => {
      useBoardStore.getState().addSwimlane(data.swimlane);
    });

    socket.on(WS_EVENTS.SWIMLANE_UPDATED, (data: { swimlane: Swimlane }) => {
      useBoardStore.getState().updateSwimlane(data.swimlane.id, data.swimlane);
    });

    socket.on(WS_EVENTS.SWIMLANE_MOVED, (data: { swimlane: Swimlane }) => {
      const store = useBoardStore.getState();
      store.updateSwimlane(data.swimlane.id, { position: data.swimlane.position });
      const board = store.board;
      if (board) {
        const sorted = [...board.swimlanes].sort((a, b) => a.position.localeCompare(b.position));
        store.reorderSwimlanes(sorted);
      }
    });

    socket.on(WS_EVENTS.SWIMLANE_DELETED, (data: { swimlaneId: string }) => {
      useBoardStore.getState().removeSwimlane(data.swimlaneId);
    });

    // --- Comment events (update comment count on card summary) ---
    socket.on(WS_EVENTS.COMMENT_CREATED, (data: { cardId: string }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        useBoardStore.getState().updateCard(data.cardId, {
          commentCount: card.commentCount + 1,
        });
      }
    });

    socket.on(WS_EVENTS.COMMENT_DELETED, (data: { cardId: string }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        useBoardStore.getState().updateCard(data.cardId, {
          commentCount: Math.max(0, card.commentCount - 1),
        });
      }
    });

    // --- Assignee events ---
    socket.on(WS_EVENTS.ASSIGNEE_ADDED, (data: { cardId: string; assignee: { id: string; displayName: string; avatarUrl: string | null } }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        const alreadyAssigned = card.assignees.some((a) => a.id === data.assignee.id);
        if (!alreadyAssigned) {
          useBoardStore.getState().updateCard(data.cardId, {
            assignees: [...card.assignees, data.assignee],
          });
        }
      }
    });

    socket.on(WS_EVENTS.ASSIGNEE_REMOVED, (data: { cardId: string; userId: string }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        useBoardStore.getState().updateCard(data.cardId, {
          assignees: card.assignees.filter((a) => a.id !== data.userId),
        });
      }
    });

    // --- Label events ---
    socket.on(WS_EVENTS.LABEL_CREATED, (data: { label: Label }) => {
      useBoardStore.getState().addLabel(data.label);
    });

    socket.on(WS_EVENTS.LABEL_UPDATED, (data: { label: Label }) => {
      useBoardStore.getState().updateLabel(data.label.id, data.label);
    });

    socket.on(WS_EVENTS.LABEL_DELETED, (data: { labelId: string }) => {
      useBoardStore.getState().removeLabel(data.labelId);
    });

    socket.on(WS_EVENTS.CARD_LABEL_ADDED, (data: { cardId: string; label: { id: string; name: string; color: string } }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        const alreadyHas = card.labels.some((l) => l.id === data.label.id);
        if (!alreadyHas) {
          useBoardStore.getState().updateCard(data.cardId, {
            labels: [...card.labels, data.label],
          });
        }
      }
    });

    socket.on(WS_EVENTS.CARD_LABEL_REMOVED, (data: { cardId: string; labelId: string }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        useBoardStore.getState().updateCard(data.cardId, {
          labels: card.labels.filter((l) => l.id !== data.labelId),
        });
      }
    });

    // --- Attachment events ---
    socket.on(WS_EVENTS.ATTACHMENT_ADDED, (data: { cardId: string }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        useBoardStore.getState().updateCard(data.cardId, {
          attachmentCount: card.attachmentCount + 1,
        });
      }
    });

    socket.on(WS_EVENTS.ATTACHMENT_REMOVED, (data: { cardId: string; attachmentId: string }) => {
      const card = useBoardStore.getState().board?.cards.find((c) => c.id === data.cardId);
      if (card) {
        useBoardStore.getState().updateCard(data.cardId, {
          ...(card.coverAttachmentId === data.attachmentId ? { coverAttachmentId: null, coverImageUrl: null } : {}),
          attachmentCount: Math.max(0, card.attachmentCount - 1),
        });
      }
    });

    return () => {
      // Leave board room and remove listeners
      if (connectedBoardRef.current) {
        socket.emit(WS_EVENTS.BOARD_LEAVE, connectedBoardRef.current);
        connectedBoardRef.current = undefined;
      }

      socket.off('connect', joinBoard);
      socket.off(WS_EVENTS.CARD_CREATED);
      socket.off(WS_EVENTS.CARD_UPDATED);
      socket.off(WS_EVENTS.CARD_MOVED);
      socket.off(WS_EVENTS.CARD_ARCHIVED);
      socket.off(WS_EVENTS.COLUMN_CREATED);
      socket.off(WS_EVENTS.COLUMN_UPDATED);
      socket.off(WS_EVENTS.COLUMN_MOVED);
      socket.off(WS_EVENTS.COLUMN_DELETED);
      socket.off(WS_EVENTS.SWIMLANE_CREATED);
      socket.off(WS_EVENTS.SWIMLANE_UPDATED);
      socket.off(WS_EVENTS.SWIMLANE_MOVED);
      socket.off(WS_EVENTS.SWIMLANE_DELETED);
      socket.off(WS_EVENTS.COMMENT_CREATED);
      socket.off(WS_EVENTS.COMMENT_DELETED);
      socket.off(WS_EVENTS.ASSIGNEE_ADDED);
      socket.off(WS_EVENTS.ASSIGNEE_REMOVED);
      socket.off(WS_EVENTS.LABEL_CREATED);
      socket.off(WS_EVENTS.LABEL_UPDATED);
      socket.off(WS_EVENTS.LABEL_DELETED);
      socket.off(WS_EVENTS.CARD_LABEL_ADDED);
      socket.off(WS_EVENTS.CARD_LABEL_REMOVED);
      socket.off(WS_EVENTS.ATTACHMENT_ADDED);
      socket.off(WS_EVENTS.ATTACHMENT_REMOVED);
    };
  }, [boardId]);
}
