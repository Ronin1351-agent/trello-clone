import { z } from 'zod';

export const createCardSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  cardType: z.enum(['story', 'bug', 'task']).optional(),
  columnId: z.string().uuid(),
  swimlaneId: z.string().uuid().optional(),
  parentCardId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateCardSchema = z.object({
  coverAttachmentId: z.string().uuid().nullable().optional(),
  coverMode: z.enum(['cover', 'background']).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  cardType: z.enum(['story', 'bug', 'task']).optional(),
  isArchived: z.boolean().optional(),
  parentCardId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const moveCardSchema = z.object({
  columnId: z.string().uuid(),
  afterId: z.string().uuid().nullable(),
  swimlaneId: z.string().uuid().optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;
