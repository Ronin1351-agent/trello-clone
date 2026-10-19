import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, X } from 'lucide-react';
import { IMAGE_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '@trello-clone/shared';
import { uploadBoardBackground, removeBoardBackground } from '../../api/boards.api.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { toast } from 'sonner';

export function BoardBackgroundControl({
  teamId,
  boardId,
  hasImage,
}: {
  teamId: string;
  boardId: string;
  hasImage: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function save(file?: File) {
    if (file && (!IMAGE_MIME_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE_BYTES)) {
      toast.error(t('appearance.imageHint'));
      return;
    }
    setBusy(true);
    try {
      const result = file
        ? await uploadBoardBackground(teamId, boardId, file)
        : await removeBoardBackground(teamId, boardId);
      useBoardStore.setState((state) =>
        state.board?.id === boardId ? { board: { ...state.board, ...result } } : {},
      );
    } catch (error) {
      const response = error as { response?: { data?: { error?: string } } };
      toast.error(response.response?.data?.error ?? t('appearance.saveError'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <button
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 disabled:opacity-50"
      >
        <ImagePlus size={16} />
        {busy ? t('appearance.saving') : t('appearance.boardBackground')}
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        aria-label={t('appearance.boardBackground')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void save(file);
        }}
      />
      {hasImage && (
        <button
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
        >
          <X size={14} />
          {t('appearance.removeBackground')}
        </button>
      )}
    </div>
  );
}
