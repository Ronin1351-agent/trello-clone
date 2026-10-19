import { CardImage } from './CardImage.js';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import type { BoardPermission, CardSummary } from '@trello-clone/shared';
import { getSharedBoard } from '../../api/shares.api.js';
import type { BoardDetail } from '../../api/boards.api.js';
import { CheckSquare, MessageSquare, Calendar, Link2, Paperclip, Shield } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  story: 'bg-green-100 text-green-700',
  bug: 'bg-red-100 text-red-700',
  task: 'bg-blue-100 text-blue-700',
};

function formatDueDate(dueDate: string, locale: string): string {
  const d = new Date(dueDate);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

export function SharedBoardPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [board, setBoard] = useState<(BoardDetail & { permission: BoardPermission }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const permLabels: Record<BoardPermission, string> = {
    read: t('share.read'),
    comment: t('share.comment'),
    edit: t('share.edit'),
  };

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    getSharedBoard(token)
      .then(setBoard)
      .catch((err) => {
        const msg = err?.response?.data?.message ?? t('sharedBoard.notFound');
        setError(msg);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('sharedBoard.loading')}</p>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h1 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">{t('sharedBoard.accessDenied')}</h1>
          <p className="text-gray-500 dark:text-gray-400">{error || t('sharedBoard.notFound')}</p>
        </div>
      </div>
    );
  }

  // Group cards by column
  const cardsByColumn: Record<string, CardSummary[]> = {};
  for (const col of board.columns) {
    cardsByColumn[col.id] = [];
  }
  for (const card of board.cards) {
    if (cardsByColumn[card.columnId]) {
      cardsByColumn[card.columnId].push(card);
    }
  }
  for (const colId of Object.keys(cardsByColumn)) {
    cardsByColumn[colId].sort((a, b) => a.position.localeCompare(b.position));
  }

  return (
    <div className="board-image-surface min-h-screen bg-gray-50 dark:bg-gray-900" style={board.backgroundImageUrl ? { '--board-image': `url(${JSON.stringify(board.backgroundImageUrl)})` } as React.CSSProperties : undefined}>
      {/* Banner */}
      <div className="bg-blue-600 text-white px-4 py-2 flex items-center gap-2 text-sm">
        <Shield size={16} />
        <span>{t('sharedBoard.sharedView', { permission: permLabels[board.permission] })}</span>
        <span className="ml-auto text-blue-200 text-xs">{t('sharedBoard.noRealtime')}</span>
      </div>

      <div className="px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">{board.name}</h1>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {board.columns.map((column) => {
            const cards = cardsByColumn[column.id] || [];
            return (
              <div key={column.id} className="flex-shrink-0 w-72 bg-gray-100 dark:bg-gray-700 rounded-lg flex flex-col">
                <div className="p-3 flex items-center gap-2 border-b border-gray-200 dark:border-gray-600">
                  {column.color && (
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
                  )}
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 truncate">{column.name}</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                    {cards.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {cards.map((card) => (
                    <ReadOnlyCard key={card.id} card={card} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReadOnlyCard({ card }: { card: CardSummary }) {
  const { i18n } = useTranslation();
  const hasMetadata = card.commentCount > 0 || card.subtaskCount > 0 || card.parentCardId || card.dueDate || card.attachmentCount > 0;

  return (
    <div className="relative isolate bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 shadow-sm">
      <CardImage url={card.coverImageUrl} mode={card.coverMode} />
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {card.labels.map((label) => (
            <span
              key={label.id}
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium leading-tight"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[card.cardType]}`}>
        {card.cardType.charAt(0).toUpperCase() + card.cardType.slice(1)}
      </span>
      <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">{card.title}</p>
      {hasMetadata && (
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          {card.parentCardId && <Link2 size={12} />}
          {card.dueDate && (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {formatDueDate(card.dueDate, i18n.language)}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {card.commentCount}
            </span>
          )}
          {card.attachmentCount > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={12} />
              {card.attachmentCount}
            </span>
          )}
          {card.subtaskCount > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare size={12} />
              {card.subtaskDoneCount}/{card.subtaskCount}
            </span>
          )}
        </div>
      )}
      {card.assignees.length > 0 && (
        <div className="flex -space-x-1 mt-2">
          {card.assignees.map((a) => (
            <div
              key={a.id}
              className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center ring-2 ring-white dark:ring-gray-800"
              title={a.displayName}
            >
              {a.displayName.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
