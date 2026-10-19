import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, Upload, Trash2, Download, FileText, Image, File } from 'lucide-react';
import type { Attachment } from '@trello-clone/shared';
import * as attachmentsApi from '../../api/attachments.api.js';
import { Button } from '../../components/ui/Button.js';
import { toast } from 'sonner';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return FileText;
  return File;
}

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AttachmentSectionProps {
  boardId: string;
  cardId: string;
  attachments: Attachment[];
  canEdit: boolean;
  onAttachmentsChange: (attachments: Attachment[]) => void;
}

export function AttachmentSection({ boardId, cardId, attachments, canEdit, onAttachmentsChange }: AttachmentSectionProps) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const attachment = await attachmentsApi.uploadAttachment(boardId, cardId, file);
      onAttachmentsChange([...attachments, attachment]);
      toast.success(t('attachment.uploaded'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('attachment.uploadError');
      toast.error(msg);
    } finally {
      setUploading(false);
      // Reset file input so the same file can be uploaded again
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await attachmentsApi.deleteAttachment(boardId, cardId, attachmentId);
      onAttachmentsChange(attachments.filter((a) => a.id !== attachmentId));
      toast.success(t('attachment.deleted'));
    } catch {
      toast.error(t('attachment.deleteError'));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Paperclip size={16} />
          {t('attachment.title', { count: attachments.length })}
        </label>
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={14} className="mr-1" />
              {uploading ? t('attachment.uploading') : t('attachment.upload')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label={t('attachment.upload')}
              className="hidden"
              onChange={handleUpload}
            />
          </>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const FileIcon = getFileIcon(attachment.mimeType);
            const isImage = attachment.mimeType.startsWith('image/');
            const downloadUrl = attachment.url;

            return (
              <div key={attachment.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                {/* Thumbnail or icon */}
                {isImage ? (
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <img
                      src={downloadUrl}
                      alt={attachment.filename}
                      className="w-12 h-12 object-cover rounded border border-gray-200 dark:border-gray-600"
                    />
                  </a>
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0">
                    <FileIcon size={20} className="text-gray-500 dark:text-gray-400" />
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 truncate block"
                  >
                    {attachment.filename}
                  </a>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatFileSize(attachment.sizeBytes)}</span>
                    <span>&middot;</span>
                    <span>{formatDate(attachment.createdAt, i18n.language)}</span>
                    {attachment.uploader && (
                      <>
                        <span>&middot;</span>
                        <span>{attachment.uploader.displayName}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={downloadUrl}
                    download={attachment.filename}
                    className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                    title={t('attachment.download')}
                  >
                    <Download size={14} />
                  </a>
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(attachment.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      title={t('attachment.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
