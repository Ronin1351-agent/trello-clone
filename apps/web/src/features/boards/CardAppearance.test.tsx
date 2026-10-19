import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CardDetail } from '@trello-clone/shared';
const mocks = vi.hoisted(() => ({ update: vi.fn(), store: vi.fn(), error: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../api/cards.api.js', () => ({ updateCard: mocks.update }));
vi.mock('../../stores/boardStore.js', () => ({
  useBoardStore: { getState: () => ({ updateCard: mocks.store }) },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
import { CardAppearance } from './CardAppearance.js';
const card = {
  id: 'card',
  boardId: 'board',
  coverAttachmentId: null,
  coverMode: 'cover',
  attachments: [
    { id: 'png', filename: 'image.png', mimeType: 'image/png' },
    { id: 'pdf', filename: 'doc.pdf', mimeType: 'application/pdf' },
  ],
} as CardDetail;
beforeEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe('card appearance controls', () => {
  it('offers only image attachments and saves the selected image', async () => {
    const change = vi.fn();
    mocks.update.mockResolvedValue({
      coverAttachmentId: 'png',
      coverImageUrl: '/uploads/image.png',
      coverMode: 'cover',
    });
    render(<CardAppearance card={card} onChange={change} />);
    expect(screen.queryByRole('option', { name: 'doc.pdf' })).toBeNull();
    fireEvent.change(screen.getByLabelText('appearance.image'), { target: { value: 'png' } });
    await waitFor(() =>
      expect(change).toHaveBeenCalledWith({
        coverAttachmentId: 'png',
        coverImageUrl: '/uploads/image.png',
        coverMode: 'cover',
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith('board', 'card', {
      coverAttachmentId: 'png',
      coverMode: 'cover',
    });
  });
  it('shows errors without changing saved appearance', async () => {
    const change = vi.fn();
    mocks.update.mockRejectedValue(new Error('offline'));
    render(<CardAppearance card={card} onChange={change} />);
    fireEvent.change(screen.getByLabelText('appearance.image'), { target: { value: 'png' } });
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(change).not.toHaveBeenCalled();
  });
  it('supports full background mode', async () => {
    mocks.update.mockResolvedValue({
      coverAttachmentId: 'png',
      coverMode: 'background',
      coverImageUrl: '/uploads/image.png',
    });
    render(<CardAppearance card={{ ...card, coverAttachmentId: 'png' }} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('appearance.display'), {
      target: { value: 'background' },
    });
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('board', 'card', {
        coverAttachmentId: 'png',
        coverMode: 'background',
      }),
    );
  });
});

it('removes a selected cover without deleting the attachment', async () => {
  mocks.update.mockResolvedValue({
    coverAttachmentId: null,
    coverImageUrl: null,
    coverMode: 'cover',
  });
  const change = vi.fn();
  render(<CardAppearance card={{ ...card, coverAttachmentId: 'png' }} onChange={change} />);
  fireEvent.change(screen.getByLabelText('appearance.image'), { target: { value: '' } });
  await waitFor(() =>
    expect(change).toHaveBeenCalledWith({
      coverAttachmentId: null,
      coverImageUrl: null,
      coverMode: 'cover',
    }),
  );
  expect(mocks.update).toHaveBeenCalledWith('board', 'card', {
    coverAttachmentId: null,
    coverMode: 'cover',
  });
});
