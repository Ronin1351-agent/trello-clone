import { CardImage } from './CardImage.js';
import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/react/sortable';
import type { CardSummary } from '@trello-clone/shared';
import { BookOpen, Bug, CheckSquare, MessageSquare, Link2, Calendar, Paperclip, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBoardStore } from '../../stores/boardStore.js';
import { MoveCardPopover } from './MoveCardPopover.js';

interface CardComponentProps {
  card: CardSummary;
  index: number;
  columnId: string;
  swimlaneId: string;
  boardId: string;
}

const TYPE_COLORS: Record<string, string> = {
  story: 'bg-green-100 text-green-700',
  bug: 'bg-red-100 text-red-700',
  task: 'bg-blue-100 text-blue-700',
};

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  story: BookOpen,
  bug: Bug,
  task: CheckSquare,
};

function getDueDateStyle(dueDate: string, overdue: string, soon: string): { className: string; label: string } {
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) {
    return { className: 'bg-red-100 text-red-700', label: overdue };
  }
  if (diffHours < 24) {
    return { className: 'bg-orange-100 text-orange-700', label: soon };
  }
  return { className: 'bg-gray-100 text-gray-600', label: '' };
}

function formatDueDate(dueDate: string, locale: string): string {
  const d = new Date(dueDate);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

export const CardComponent = React.memo(function CardComponent({ card, index, columnId, swimlaneId, boardId }: CardComponentProps) {
  const { t, i18n } = useTranslation();
  const openCard = useBoardStore((s) => s.openCard);
  const [movedAway, setMovedAway] = useState(false);
  const { ref, isDragging } = useSortable({
    id: card.id,
    index,
    type: 'card',
    accept: 'card',
    group: `${columnId}:${swimlaneId}`,
    data: { columnId, swimlaneId },
  });

  const dueDateStyle = card.dueDate ? getDueDateStyle(card.dueDate, t('board.overdue'), t('card.soon')) : null;
  const hasMetadata = card.commentCount > 0 || card.subtaskCount > 0 || card.parentCardId || card.dueDate || card.attachmentCount > 0;

  if (movedAway) return null;

  return (
    <div
      ref={ref}
      onClick={() => {
        if (!isDragging) openCard(card.id);
      }}
      className={`relative isolate group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 shadow-sm cursor-pointer transition-shadow hover:shadow-md ${
        isDragging ? 'opacity-50 shadow-lg cursor-grabbing' : ''
      }`}
    >
      <CardImage url={card.coverImageUrl} mode={card.coverMode} />
      {/* Move card button — always visible on mobile, hover-visible on desktop */}
      <div className="absolute top-1.5 right-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <MoveCardPopover
          boardId={boardId}
          cardId={card.id}
          currentColumnId={columnId}
          currentSwimlaneId={swimlaneId}
          onMoved={() => setMovedAway(true)}
          stopPropagation
          triggerClassName="p-1 rounded bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shadow-sm"
        >
          <MoreVertical size={14} />
        </MoveCardPopover>
      </div>

      {/* Label chips */}
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

      <div className="flex items-start gap-2">
        {(() => {
          const TypeIcon = TYPE_ICONS[card.cardType];
          return (
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[card.cardType]}`}>
              {TypeIcon && <TypeIcon size={12} />}
              {card.cardType.charAt(0).toUpperCase() + card.cardType.slice(1)}
            </span>
          );
        })()}
      </div>
      <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">{card.title}</p>
      {/* Metadata badges */}
      {hasMetadata && (
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          {card.parentCardId && (
            <span className="flex items-center gap-0.5" title={t('card.tooltipSubtask')}>
              <Link2 size={12} />
            </span>
          )}
          {card.dueDate && dueDateStyle && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${dueDateStyle.className}`}
              title={dueDateStyle.label || formatDueDate(card.dueDate, i18n.language)}
            >
              <Calendar size={12} />
              {formatDueDate(card.dueDate, i18n.language)}
            </span>
          )}
          {card.attachmentCount > 0 && (
            <span className="flex items-center gap-1" title={t('card.tooltipAttachments')}>
              <Paperclip size={12} />
              {card.attachmentCount}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="flex items-center gap-1" title={t('card.tooltipComments')}>
              <MessageSquare size={12} />
              {card.commentCount}
            </span>
          )}
          {card.subtaskCount > 0 && (
            <span className="flex items-center gap-1" title={t('card.tooltipSubtasks')}>
              <CheckSquare size={12} />
              <span>
                {card.subtaskDoneCount}/{card.subtaskCount}
              </span>
            </span>
          )}
        </div>
      )}
      {card.assignees.length > 0 && (
        <div className="flex -space-x-1 mt-2">
          {card.assignees.map((assignee) => (
            <div
              key={assignee.id}
              className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center ring-2 ring-white dark:ring-gray-800"
              title={assignee.displayName}
            >
              {assignee.displayName.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
