import { api } from './client.js';
import type { Board, CreateBoardInput, UpdateBoardInput, CardSummary, Column, Swimlane, Label, BoardPermission } from '@trello-clone/shared';

export interface BoardDetail extends Board {
  columns: Column[];
  swimlanes: Swimlane[];
  cards: CardSummary[];
  labels: Label[];
  permission?: BoardPermission;
}

export async function listBoards(teamId: string): Promise<Board[]> {
  const { data } = await api.get<{ boards: Board[] }>(`/teams/${teamId}/boards`);
  return data.boards;
}

export async function getBoard(teamId: string, boardId: string): Promise<BoardDetail> {
  const { data } = await api.get<{ board: BoardDetail }>(`/teams/${teamId}/boards/${boardId}`);
  return data.board;
}

export async function createBoard(teamId: string, input: CreateBoardInput): Promise<Board> {
  const { data } = await api.post<{ board: Board }>(`/teams/${teamId}/boards`, input);
  return data.board;
}

export async function updateBoard(teamId: string, boardId: string, input: UpdateBoardInput): Promise<Board> {
  const { data } = await api.patch<{ board: Board }>(`/teams/${teamId}/boards/${boardId}`, input);
  return data.board;
}

export async function deleteBoard(teamId: string, boardId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/boards/${boardId}`);
}

export async function uploadBoardBackground(teamId: string, boardId: string, file: File): Promise<{ backgroundImageUrl: string | null }> {
  const form = new FormData(); form.append('file', file);
  const { data } = await api.post('/teams/' + teamId + '/boards/' + boardId + '/background', form);
  return data;
}
export async function removeBoardBackground(teamId: string, boardId: string): Promise<{ backgroundImageUrl: string | null }> {
  const { data } = await api.delete('/teams/' + teamId + '/boards/' + boardId + '/background');
  return data;
}
