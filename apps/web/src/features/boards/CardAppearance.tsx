import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IMAGE_MIME_TYPES } from '@trello-clone/shared';
import type { CardDetail } from '@trello-clone/shared';
import { updateCard } from '../../api/cards.api.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { toast } from 'sonner';

export function CardAppearance({
  card,
  onChange,
}: {
  card: CardDetail;
  onChange: (updates: Partial<CardDetail>) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const images = card.attachments.filter((a) => IMAGE_MIME_TYPES.includes(a.mimeType));
  async function save(coverAttachmentId: string | null, coverMode: 'cover' | 'background') {
    setBusy(true);
    try {
      const updated = await updateCard(card.boardId, card.id, { coverAttachmentId, coverMode });
      const changes = {
        coverAttachmentId: updated.coverAttachmentId,
        coverImageUrl: updated.coverImageUrl,
        coverMode: updated.coverMode,
      };
      useBoardStore.getState().updateCard(card.id, changes);
      onChange(changes);
    } catch {
      toast.error(t('appearance.saveError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy} className="space-y-2">
      <legend className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
        {t('appearance.cardImage')}
      </legend>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('appearance.cardHint')}</p>
      <label className="block text-sm text-gray-700 dark:text-gray-300">
        {t('appearance.image')}
        <select
          className="block w-full mt-1 rounded-lg border p-2 bg-white dark:bg-gray-800"
          value={card.coverAttachmentId ?? ''}
          onChange={(e) => void save(e.target.value || null, card.coverMode ?? 'cover')}
        >
          <option value="">{t('appearance.noImage')}</option>
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.filename}
            </option>
          ))}
        </select>
      </label>
      {card.coverAttachmentId && (
        <label className="block text-sm text-gray-700 dark:text-gray-300">
          {t('appearance.display')}
          <select
            className="block w-full mt-1 rounded-lg border p-2 bg-white dark:bg-gray-800"
            value={card.coverMode ?? 'cover'}
            onChange={(e) =>
              void save(card.coverAttachmentId!, e.target.value as 'cover' | 'background')
            }
          >
            <option value="cover">{t('appearance.cover')}</option>
            <option value="background">{t('appearance.background')}</option>
          </select>
        </label>
      )}
      {busy && (
        <p role="status" className="text-sm">
          {t('appearance.saving')}
        </p>
      )}
    </fieldset>
  );
}
