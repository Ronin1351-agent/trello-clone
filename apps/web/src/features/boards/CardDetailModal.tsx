import { CardAppearance } from './CardAppearance.js';
import { CardImage } from './CardImage.js';
import { useEffect, useState, useCallback } from 'react';
import { X, BookOpen, Bug, CheckSquare, Trash2, MessageSquare, Pencil, Link2, ListChecks, Calendar, Activity } from 'lucide-react';
import type { CardDetail, CardType, Comment } from '@trello-clone/shared';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal.js';
import { Button } from '../../components/ui/Button.js';
import { LabelPicker } from './LabelPicker.js';
import { MoveCardPopover } from './MoveCardPopover.js';
import { AttachmentSection } from './AttachmentSection.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import * as cardsApi from '../../api/cards.api.js';
import * as commentsApi from '../../api/comments.api.js';
import { ActivityFeed } from './ActivityFeed.js';
import { toast } from 'sonner';

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  story: BookOpen,
  bug: Bug,
  task: CheckSquare,
};

const TYPE_COLORS: Record<string, string> = {
  story: 'bg-green-100 text-green-700',
  bug: 'bg-red-100 text-red-700',
  task: 'bg-blue-100 text-blue-700',
};

export function CardDetailModal() {
  const { t } = useTranslation();
  const board = useBoardStore((s) => s.board);
  const selectedCardId = useBoardStore((s) => s.selectedCardId);
  const closeCard = useBoardStore((s) => s.closeCard);
  const openCard = useBoardStore((s) => s.openCard);
  const updateCardInStore = useBoardStore((s) => s.updateCard);
  const removeCardFromStore = useBoardStore((s) => s.removeCard);

  const permission = board?.permission ?? 'edit';
  const canEdit = permission === 'edit';
  const canComment = permission === 'comment' || permission === 'edit';

  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);

  // Use getState() to avoid unstable closure references in dependencies
  const fetchCard = useCallback(async () => {
    const { board: currentBoard, selectedCardId: currentCardId } = useBoardStore.getState();
    if (!currentBoard || !currentCardId) return;
    setIsLoading(true);
    try {
      const detail = await cardsApi.getCard(currentBoard.id, currentCardId);
      setCardDetail(detail);
      setTitle(detail.title);
      setDescription(detail.description ?? '');
    } catch {
      toast.error(t('card.loadError'));
      useBoardStore.getState().closeCard();
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (selectedCardId) {
      setEditingTitle(false);
      setEditingDescription(false);
      fetchCard();
    } else {
      setCardDetail(null);
    }
  }, [selectedCardId, fetchCard]);

  const handleSaveTitle = async () => {
    if (!board || !cardDetail || !title.trim() || !editingTitle) return;
    setEditingTitle(false); // Prevent double-fire from blur after Enter
    try {
      await cardsApi.updateCard(board.id, cardDetail.id, { title: title.trim() });
      updateCardInStore(cardDetail.id, { title: title.trim() });
      setCardDetail({ ...cardDetail, title: title.trim() });
    } catch {
      toast.error(t('card.titleSaveError'));
    }
  };

  const handleSaveDescription = async () => {
    if (!board || !cardDetail) return;
    const desc = description.trim() || null;
    try {
      await cardsApi.updateCard(board.id, cardDetail.id, { description: desc });
      setCardDetail({ ...cardDetail, description: desc });
      setEditingDescription(false);
    } catch {
      toast.error(t('card.descriptionSaveError'));
    }
  };

  const handleChangeType = async (newType: CardType) => {
    if (!board || !cardDetail || cardDetail.cardType === newType) return;
    try {
      await cardsApi.updateCard(board.id, cardDetail.id, { cardType: newType });
      updateCardInStore(cardDetail.id, { cardType: newType });
      setCardDetail({ ...cardDetail, cardType: newType });
    } catch {
      toast.error(t('card.typeChangeError'));
    }
  };

  const handleDelete = async () => {
    if (!board || !cardDetail) return;
    if (!window.confirm(t('card.confirmDelete'))) return;
    try {
      await cardsApi.deleteCard(board.id, cardDetail.id);
      // Clean up subtask references in the store (DB sets parentCardId to null)
      if (cardDetail.subtasks.length > 0) {
        for (const sub of cardDetail.subtasks) {
          updateCardInStore(sub.id, { parentCardId: null });
        }
      }
      removeCardFromStore(cardDetail.id);
      closeCard();
      toast.success(t('card.deleted'));
    } catch {
      toast.error(t('card.deleteError'));
    }
  };

  const handleMoved = (toColumnId: string, toSwimlaneId: string) => {
    if (!cardDetail) return;
    setCardDetail({ ...cardDetail, columnId: toColumnId, swimlaneId: toSwimlaneId });
  };

  const column = board?.columns.find((c) => c.id === cardDetail?.columnId);
  const swimlane = board?.swimlanes.find((s) => s.id === cardDetail?.swimlaneId);

  return (
    <Modal isOpen={!!selectedCardId} onClose={closeCard} title={t('card.cardDetails')}>
      {isLoading || !cardDetail || !board ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
      ) : (
        <div className="relative isolate p-6 space-y-6">
          <CardImage url={cardDetail.coverImageUrl} mode={cardDetail.coverMode} />
          {/* Header with close button */}
          <div className="flex items-start justify-between">
            <div className="flex-1 mr-4">
              {editingTitle && canEdit ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') {
                      setTitle(cardDetail.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full text-xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-blue-500 outline-none pb-1"
                />
              ) : (
                <h2
                  className={`text-xl font-bold text-gray-900 dark:text-gray-100 ${canEdit ? 'cursor-pointer hover:text-blue-600' : ''}`}
                  onClick={() => canEdit && setEditingTitle(true)}
                >
                  {cardDetail.title}
                </h2>
              )}
            </div>
            <button onClick={closeCard} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
            {column && (
              canEdit ? (
                <MoveCardPopover
                  boardId={board.id}
                  cardId={cardDetail.id}
                  currentColumnId={cardDetail.columnId}
                  currentSwimlaneId={cardDetail.swimlaneId}
                  onMoved={handleMoved}
                  triggerClassName="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {t('card.column', { name: column.name })}
                </MoveCardPopover>
              ) : (
                <span>{t('card.column', { name: column.name })}</span>
              )
            )}
            {swimlane && !swimlane.isDefault && (
              canEdit ? (
                <MoveCardPopover
                  boardId={board.id}
                  cardId={cardDetail.id}
                  currentColumnId={cardDetail.columnId}
                  currentSwimlaneId={cardDetail.swimlaneId}
                  onMoved={handleMoved}
                  triggerClassName="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {t('card.swimlane', { name: swimlane.name })}
                </MoveCardPopover>
              ) : (
                <span>{t('card.swimlane', { name: swimlane.name })}</span>
              )
            )}
          </div>

          {/* Card type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('card.cardType')}</label>
            <div className="flex gap-2">
              {(['task', 'story', 'bug'] as const).map((type) => {
                const Icon = TYPE_ICONS[type];
                return (
                  <button
                    key={type}
                    onClick={() => canEdit && handleChangeType(type)}
                    disabled={!canEdit}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      cardDetail.cardType === type ? TYPE_COLORS[type] : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${!canEdit ? 'cursor-default' : ''}`}
                  >
                    {Icon && <Icon size={14} />}
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('card.description')}</label>
            {editingDescription && canEdit ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveDescription}>
                    {t('common.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDescription(cardDetail.description ?? '');
                      setEditingDescription(false);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={`text-sm text-gray-600 dark:text-gray-400 rounded-lg p-3 border border-transparent min-h-[3rem] ${canEdit ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600' : ''}`}
                onClick={() => canEdit && setEditingDescription(true)}
              >
                {cardDetail.description || (canEdit ? t('card.addDescription') : t('card.noDescription'))}
              </div>
            )}
          </div>

          {/* Labels */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('card.labels')}</label>
              {canEdit && <LabelPicker
                boardId={board.id}
                cardId={cardDetail.id}
                cardLabels={cardDetail.labels}
                onToggle={(label, action) => {
                  if (action === 'add') {
                    const newLabels = [...cardDetail.labels, label];
                    setCardDetail({ ...cardDetail, labels: newLabels });
                    updateCardInStore(cardDetail.id, { labels: newLabels });
                  } else {
                    const newLabels = cardDetail.labels.filter((l) => l.id !== label.id);
                    setCardDetail({ ...cardDetail, labels: newLabels });
                    updateCardInStore(cardDetail.id, { labels: newLabels });
                  }
                }}
              />}
            </div>
            {cardDetail.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {cardDetail.labels.map((label) => (
                  <span
                    key={label.id}
                    className="text-xs px-2.5 py-1 rounded-full text-white font-medium"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Due Date */}
          <DueDateSection
            boardId={board.id}
            cardDetail={cardDetail}
            onUpdate={(newDueDate) => {
              setCardDetail({ ...cardDetail, dueDate: newDueDate });
              updateCardInStore(cardDetail.id, { dueDate: newDueDate });
            }}
          />

          {/* Assignees (display only) */}
          {cardDetail.assignees.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('card.assignees')}</label>
              <div className="flex flex-wrap gap-2">
                {cardDetail.assignees.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                      {a.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{a.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parent card link */}
          {cardDetail.parentCard && (
            <div className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <Link2 size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-600 dark:text-gray-400">{t('card.subtaskOf')}</span>
              <button
                onClick={() => openCard(cardDetail.parentCard!.id)}
                className="font-medium text-blue-600 hover:underline truncate"
              >
                {cardDetail.parentCard.title}
              </button>
              <button
                onClick={async () => {
                  try {
                    await cardsApi.updateCard(board!.id, cardDetail.id, { parentCardId: null });
                    updateCardInStore(cardDetail.id, { parentCardId: null });
                    if (cardDetail.parentCard) {
                      const parent = board!.cards.find((c) => c.id === cardDetail.parentCard!.id);
                      if (parent) {
                        updateCardInStore(parent.id, { subtaskCount: Math.max(0, parent.subtaskCount - 1) });
                      }
                    }
                    setCardDetail({ ...cardDetail, parentCardId: null, parentCard: null });
                    toast.success(t('card.linkRemoved'));
                  } catch {
                    toast.error(t('card.linkRemoveError'));
                  }
                }}
                className="ml-auto text-gray-400 dark:text-gray-500 hover:text-red-500 flex-shrink-0"
                title={t('card.removeLink')}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Subtasks section (only if card is not itself a subtask) */}
          {!cardDetail.parentCardId && (
            <SubtaskSection
              boardId={board!.id}
              card={cardDetail}
              onSubtasksChange={fetchCard}
              canEdit={canEdit}
            />
          )}

          {/* Set as subtask (only if card has no subtasks and no parent, and user can edit) */}
          {canEdit && !cardDetail.parentCardId && cardDetail.subtasks.length === 0 && (
            <SetParentSection
              boardId={board!.id}
              card={cardDetail}
              onParentSet={fetchCard}
            />
          )}

          {/* Comments section */}
          <CommentSection
            boardId={board!.id}
            cardId={cardDetail.id}
            comments={cardDetail.comments}
            canComment={canComment}
            onCommentsChange={(newComments) => {
              setCardDetail({ ...cardDetail, comments: newComments });
              updateCardInStore(cardDetail.id, { commentCount: newComments.length });
            }}
          />

          {/* Attachments section */}
          <AttachmentSection
            boardId={board.id}
            cardId={cardDetail.id}
            attachments={cardDetail.attachments ?? []}
            canEdit={canEdit}
            onAttachmentsChange={(newAttachments) => {
              const removedCover = !!cardDetail.coverAttachmentId && !newAttachments.some(a => a.id === cardDetail.coverAttachmentId);
              const changes = removedCover ? { coverAttachmentId: null, coverImageUrl: null } : {};
              setCardDetail({ ...cardDetail, ...changes, attachments: newAttachments });
              updateCardInStore(cardDetail.id, { ...changes, attachmentCount: newAttachments.length });
            }}
          />

          {canEdit && <CardAppearance key={cardDetail.id} card={cardDetail} onChange={changes => setCardDetail(current => current?.id === cardDetail.id ? { ...current, ...changes } : current)} />}

          {/* Activity section */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Activity size={16} />
              {t('board.activity')}
            </label>
            <ActivityFeed cardId={cardDetail.id} boardId={board.id} maxHeight="200px" />
          </div>

          {/* Delete button */}
          {canEdit && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 transition-colors"
              >
                <Trash2 size={16} />
                {t('card.deleteCard')}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------- Subtask Section ---------- */

function SubtaskSection({
  boardId,
  card,
  onSubtasksChange,
  canEdit = true,
}: {
  boardId: string;
  card: CardDetail;
  onSubtasksChange: () => void;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const board = useBoardStore((s) => s.board);
  const openCard = useBoardStore((s) => s.openCard);
  const addCardToStore = useBoardStore((s) => s.addCard);
  const updateCardInStore = useBoardStore((s) => s.updateCard);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lastColumnId = board?.columns[board.columns.length - 1]?.id ?? null;
  const doneCount = card.subtasks.filter((s) => s.columnId === lastColumnId).length;

  const handleAddSubtask = async () => {
    if (!newTitle.trim() || !board) return;
    setSubmitting(true);
    try {
      const newCard = await cardsApi.createCard(boardId, {
        title: newTitle.trim(),
        columnId: board.columns[0].id,
        parentCardId: card.id,
      });
      addCardToStore({
        id: newCard.id,
        columnId: newCard.columnId,
        swimlaneId: newCard.swimlaneId,
        parentCardId: newCard.parentCardId,
        cardType: newCard.cardType,
        title: newCard.title,
        position: newCard.position,
        dueDate: newCard.dueDate ?? null,
        assignees: [],
        labels: [],
        commentCount: 0,
        subtaskCount: 0,
        subtaskDoneCount: 0,
        attachmentCount: 0,
      });
      updateCardInStore(card.id, { subtaskCount: card.subtasks.length + 1 });
      setNewTitle('');
      setShowAddForm(false);
      onSubtasksChange();
    } catch {
      toast.error(t('card.subtaskCreateError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        <ListChecks size={16} />
        {t('card.subtasks')} {card.subtasks.length > 0 && `(${doneCount}/${card.subtasks.length})`}
      </label>

      {/* Progress bar */}
      {card.subtasks.length > 0 && (
        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-3">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${(doneCount / card.subtasks.length) * 100}%` }}
          />
        </div>
      )}

      {/* Subtask list */}
      <div className="space-y-1">
        {card.subtasks.map((subtask) => {
          const isDone = subtask.columnId === lastColumnId;
          return (
            <div
              key={subtask.id}
              className="flex items-center gap-2 text-sm p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => openCard(subtask.id)}
            >
              <div
                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                  isDone ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-500'
                }`}
              >
                {isDone && <CheckSquare size={10} />}
              </div>
              <span className={isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}>{subtask.title}</span>
            </div>
          );
        })}
      </div>

      {/* Add subtask form */}
      {canEdit && showAddForm ? (
        <div className="mt-2 space-y-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSubtask();
              if (e.key === 'Escape') setShowAddForm(false);
            }}
            placeholder={t('card.subtaskPlaceholder')}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddSubtask} disabled={submitting || !newTitle.trim()}>
              {t('common.add')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)} className="mt-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          {t('card.addSubtask')}
        </button>
      )}
    </div>
  );
}

/* ---------- Set Parent Section ---------- */

function SetParentSection({
  boardId,
  card,
  onParentSet,
}: {
  boardId: string;
  card: CardDetail;
  onParentSet: () => void;
}) {
  const { t } = useTranslation();
  const board = useBoardStore((s) => s.board);
  const updateCardInStore = useBoardStore((s) => s.updateCard);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Candidates: cards on the same board that are not already subtasks and not the current card
  const candidates = (board?.cards ?? []).filter(
    (c) => c.id !== card.id && !c.parentCardId && c.title.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSetParent = async (parentId: string) => {
    try {
      await cardsApi.updateCard(boardId, card.id, { parentCardId: parentId });
      updateCardInStore(card.id, { parentCardId: parentId });
      const parentCard = board?.cards.find((c) => c.id === parentId);
      if (parentCard) {
        updateCardInStore(parentId, { subtaskCount: parentCard.subtaskCount + 1 });
      }
      setIsOpen(false);
      onParentSet();
    } catch {
      toast.error(t('card.linkRemoveError'));
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
        <Link2 size={14} className="inline mr-1" />
        {t('card.assignAsSubtask')}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('card.selectParent')}</label>
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('card.searchCards')}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
        {candidates.length === 0 ? (
          <div className="p-3 text-sm text-gray-400 dark:text-gray-500 text-center">{t('card.noMatchingCards')}</div>
        ) : (
          candidates.slice(0, 20).map((c) => (
            <button
              key={c.id}
              onClick={() => handleSetParent(c.id)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <span className={`inline-block text-xs px-1 py-0.5 rounded mr-2 ${TYPE_COLORS[c.cardType]}`}>
                {c.cardType.charAt(0).toUpperCase() + c.cardType.slice(1)}
              </span>
              {c.title}
            </button>
          ))
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

/* ---------- Due Date Section ---------- */

function DueDateSection({
  boardId,
  cardDetail,
  onUpdate,
}: {
  boardId: string;
  cardDetail: CardDetail;
  onUpdate: (dueDate: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [dateValue, setDateValue] = useState('');

  // Initialize date input value when editing starts
  const startEditing = () => {
    if (cardDetail.dueDate) {
      // Convert ISO string to datetime-local format
      const d = new Date(cardDetail.dueDate);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setDateValue(local);
    } else {
      setDateValue('');
    }
    setEditing(true);
  };

  const handleSave = async () => {
    const newDueDate = dateValue ? new Date(dateValue).toISOString() : null;
    try {
      await cardsApi.updateCard(boardId, cardDetail.id, { dueDate: newDueDate });
      onUpdate(newDueDate);
      setEditing(false);
    } catch {
      toast.error(t('card.dueDateSaveError'));
    }
  };

  const handleClear = async () => {
    try {
      await cardsApi.updateCard(boardId, cardDetail.id, { dueDate: null });
      onUpdate(null);
      setEditing(false);
    } catch {
      toast.error(t('card.dueDateRemoveError'));
    }
  };

  const formatDueDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDueDateColor = (iso: string) => {
    const now = new Date();
    const due = new Date(iso);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffMs < 0) return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    if (diffHours < 24) return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
    return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700';
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        <Calendar size={16} />
        {t('card.dueDate')}
      </label>
      {editing ? (
        <div className="space-y-2">
          <input
            type="datetime-local"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>
              {t('common.save')}
            </Button>
            {cardDetail.dueDate && (
              <Button size="sm" variant="ghost" onClick={handleClear} className="text-red-600">
                {t('common.remove')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`cursor-pointer rounded-lg p-3 text-sm border border-transparent hover:border-gray-200 ${
            cardDetail.dueDate ? getDueDateColor(cardDetail.dueDate) : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          onClick={startEditing}
        >
          {cardDetail.dueDate ? (
            <span className="flex items-center gap-2">
              <Calendar size={14} />
              {formatDueDate(cardDetail.dueDate)}
              {new Date(cardDetail.dueDate) < new Date() && (
                <span className="text-xs font-medium text-red-600">{t('card.overdue')}</span>
              )}
            </span>
          ) : (
            t('card.addDueDate')
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Comment Section ---------- */

function CommentSection({
  boardId,
  cardId,
  comments,
  canComment = true,
  onCommentsChange,
}: {
  boardId: string;
  cardId: string;
  comments: Comment[];
  canComment?: boolean;
  onCommentsChange: (comments: Comment[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const handleAddComment = async () => {
    if (!newBody.trim()) return;
    setSubmitting(true);
    try {
      const comment = await commentsApi.createComment(boardId, cardId, { body: newBody.trim() });
      onCommentsChange([...comments, comment]);
      setNewBody('');
    } catch {
      toast.error(t('card.commentAddError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editBody.trim()) return;
    try {
      const updated = await commentsApi.updateComment(boardId, cardId, commentId, { body: editBody.trim() });
      onCommentsChange(comments.map((c) => (c.id === commentId ? updated : c)));
      setEditingId(null);
    } catch {
      toast.error(t('card.commentUpdateError'));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await commentsApi.deleteComment(boardId, cardId, commentId);
      onCommentsChange(comments.filter((c) => c.id !== commentId));
    } catch {
      toast.error(t('card.commentDeleteError'));
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        <MessageSquare size={16} />
        {t('card.comments')} ({comments.length})
      </label>

      {/* Comment list */}
      <div className="space-y-3 mb-4">
        {comments.map((comment) => {
          const isOwn = comment.authorId === currentUser?.id;
          const isEditing = editingId === comment.id;

          return (
            <div key={comment.id} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">
                {comment.author?.displayName?.charAt(0).toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {comment.author?.displayName ?? t('common.unknown')}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(comment.createdAt)}</span>
                  {isOwn && !isEditing && (
                    <div className="flex gap-1 ml-auto">
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditBody(comment.body);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title={t('common.edit')}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title={t('common.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      autoFocus
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateComment(comment.id)}>
                        {t('common.save')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">{comment.body}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add comment form */}
      {canComment && (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">
          {currentUser?.displayName?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div className="flex-1">
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder={t('card.commentPlaceholder')}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddComment();
              }
            }}
          />
          {newBody.trim() && (
            <div className="mt-2">
              <Button size="sm" onClick={handleAddComment} disabled={submitting}>
                {t('card.submitComment')}
              </Button>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
