export interface Board {
  backgroundImageUrl?: string | null;
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  createdBy: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: string;
  wipLimit: number | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Swimlane {
  id: string;
  boardId: string;
  name: string;
  position: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
