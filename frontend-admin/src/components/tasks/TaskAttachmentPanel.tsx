import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  File,
  FileImage,
  Link2,
  LoaderCircle,
  Maximize2,
  Pencil,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { uploadFile } from '../../services/adminApi';
import { AttachmentLightbox } from './AttachmentLightbox';
import { uploadWithTimeout } from './attachmentUpload';

export interface TaskAttachment {
  name: string;
  url: string;
  type: 'file' | 'link';
}

export interface AttachmentUploadState {
  uploadingCount: number;
  failedCount: number;
}

interface TaskAttachmentPanelProps {
  attachments: TaskAttachment[];
  disabled?: boolean;
  onAddAttachment: (attachment: TaskAttachment) => void;
  onRemoveAttachment: (index: number) => void;
  onEditAttachment: (index: number, attachment: TaskAttachment) => void;
  onOpenAttachment: (url: string) => void;
  onAddLink: () => void;
  onUploadStateChange?: (state: AttachmentUploadState) => void;
}

type UploadStatus = 'uploading' | 'failed';

interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;
const ATTACHMENT_UPLOAD_TIMEOUT_MS = 90_000;

function createUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toPublicAttachmentUrl(url: string): string {
  if (url.startsWith('r2://')) {
    return url.replace('r2://', 'https://pub-2a877f7cc07b481ca09dec82cb240465.r2.dev/');
  }
  return url;
}

function isImageAttachment(attachment: TaskAttachment): boolean {
  return IMAGE_EXTENSION_PATTERN.test(attachment.name) || IMAGE_EXTENSION_PATTERN.test(attachment.url);
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getUploadErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message || '').trim();
    if (message) return message;
  }
  return 'อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง';
}

interface AttachmentImageThumbnailProps {
  name: string;
  src: string;
  onOpen: () => void;
}

const AttachmentImageThumbnail: React.FC<AttachmentImageThumbnailProps> = ({ name, src, onOpen }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retryPreview = () => {
    setLoaded(false);
    setFailed(false);
    setReloadKey((current) => current + 1);
  };

  if (failed) {
    return (
      <div className="task-attachment-file-thumbnail is-error" aria-label={`ตัวอย่างรูป ${name}`}>
        <FileImage size={20} aria-hidden="true" />
        <span>ดูรูปไม่ได้</span>
        <button type="button" onClick={retryPreview}>ลองใหม่</button>
      </div>
    );
  }

  return (
    <button type="button" className="task-attachment-file-thumbnail" onClick={onOpen} aria-label={`เปิดรูป ${name} แบบเต็มจอ`}>
      {!loaded ? <div className="task-attachment-preview-skeleton" aria-hidden="true" /> : null}
      <img
        key={reloadKey}
        src={src}
        alt={`ตัวอย่างไฟล์ ${name}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      <span className="task-attachment-file-thumbnail-hint" aria-hidden="true">
        <Maximize2 size={14} />
      </span>
    </button>
  );
};

export const TaskAttachmentPanel: React.FC<TaskAttachmentPanelProps> = ({
  attachments,
  disabled = false,
  onAddAttachment,
  onRemoveAttachment,
  onEditAttachment,
  onOpenAttachment,
  onAddLink,
  onUploadStateChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadQueueItem[]>([]);
  const [localPreviewByRemoteUrl, setLocalPreviewByRemoteUrl] = useState<Record<string, string>>({});
  const [lightboxStartIndex, setLightboxStartIndex] = useState<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const objectUrls = objectUrlsRef.current;
    return () => {
      mountedRef.current = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  const uploadingCount = uploadItems.filter((item) => item.status === 'uploading').length;
  const failedCount = uploadItems.filter((item) => item.status === 'failed').length;
  const uploadState = useMemo<AttachmentUploadState>(() => ({
    uploadingCount,
    failedCount,
  }), [failedCount, uploadingCount]);

  useEffect(() => {
    onUploadStateChange?.(uploadState);
  }, [onUploadStateChange, uploadState]);

  const imageAttachments = useMemo(() => attachments
    .map((attachment, index) => ({ attachment, index }))
    .filter(({ attachment }) => isImageAttachment(attachment)), [attachments]);
  const lightboxImages = useMemo(() => imageAttachments.map(({ attachment }) => ({
    name: attachment.name || 'รูปภาพแนบ',
    src: localPreviewByRemoteUrl[attachment.url] || toPublicAttachmentUrl(attachment.url),
  })), [imageAttachments, localPreviewByRemoteUrl]);

  const uploadOne = async (item: UploadQueueItem) => {
    setUploadItems((current) => current.map((queued) => queued.id === item.id
      ? { ...queued, status: 'uploading', progress: 0, error: undefined }
      : queued));

    try {
      const result = await uploadWithTimeout((signal, keepAlive) => uploadFile(item.file, {
        signal,
        onProgress: (progress) => {
          keepAlive();
          if (!mountedRef.current) return;
          setUploadItems((current) => current.map((queued) => queued.id === item.id
            ? { ...queued, progress }
            : queued));
        },
      }), ATTACHMENT_UPLOAD_TIMEOUT_MS);

      if (!result.ok || !result.url) {
        throw new Error('เซิร์ฟเวอร์ไม่ส่งที่อยู่ไฟล์กลับมา');
      }
      if (!mountedRef.current) return;

      if (item.previewUrl) {
        setLocalPreviewByRemoteUrl((current) => ({ ...current, [result.url]: item.previewUrl as string }));
      }
      onAddAttachment({ name: item.file.name, url: result.url, type: 'file' });
      setUploadItems((current) => current.filter((queued) => queued.id !== item.id));
    } catch (error) {
      if (!mountedRef.current) return;
      setUploadItems((current) => current.map((queued) => queued.id === item.id
        ? { ...queued, status: 'failed', progress: 0, error: getUploadErrorMessage(error) }
        : queued));
    }
  };

  const addFiles = (files: File[]) => {
    if (disabled || files.length === 0) return;

    const nextItems = files.map<UploadQueueItem>((file) => {
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      if (previewUrl) objectUrlsRef.current.add(previewUrl);
      return {
        id: createUploadId(),
        file,
        previewUrl,
        progress: 0,
        status: 'uploading',
      };
    });

    setUploadItems((current) => [...current, ...nextItems]);
    nextItems.forEach((item) => void uploadOne(item));
  };

  const removeQueuedUpload = (item: UploadQueueItem) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      objectUrlsRef.current.delete(item.previewUrl);
    }
    setUploadItems((current) => current.filter((queued) => queued.id !== item.id));
  };

  const removeAttachment = (index: number, attachment: TaskAttachment) => {
    const localPreview = localPreviewByRemoteUrl[attachment.url];
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      objectUrlsRef.current.delete(localPreview);
      setLocalPreviewByRemoteUrl((current) => {
        const next = { ...current };
        delete next[attachment.url];
        return next;
      });
    }
    onRemoveAttachment(index);
  };

  return (
    <>
      <section className="task-attachment-panel" aria-busy={uploadState.uploadingCount > 0}>
      <div className="task-attachment-heading">
        <div>
          <span className="task-attachment-eyebrow">ไฟล์ประกอบงาน</span>
          <h3>เอกสารและรูปภาพ</h3>
        </div>
        <span className="task-attachment-count">{attachments.length} ไฟล์</span>
      </div>

      <button
        type="button"
        className={`task-attachment-dropzone${isDragging ? ' is-dragging' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        disabled={disabled}
      >
        <span className="task-attachment-dropzone-icon"><UploadCloud size={22} aria-hidden="true" /></span>
        <span className="task-attachment-dropzone-copy">
          <strong>{isDragging ? 'วางไฟล์เพื่อเริ่มอัปโหลด' : 'ลากไฟล์มาวาง หรือเลือกจากเครื่อง'}</strong>
          <small>รองรับรูปและเอกสารหลายไฟล์ ระบบจะแสดงความคืบหน้าแยกแต่ละไฟล์</small>
        </span>
        <span className="task-attachment-browse-label">เลือกไฟล์</span>
      </button>
      <input
        ref={fileInputRef}
        className="task-attachment-file-input"
        type="file"
        multiple
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />

      {uploadItems.length > 0 ? (
        <div className="task-attachment-upload-list" aria-live="polite">
          {uploadItems.map((item) => (
            <div key={item.id} className={`task-attachment-upload-item is-${item.status}`}>
              <div className="task-attachment-upload-thumb">
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <File size={18} aria-hidden="true" />}
              </div>
              <div className="task-attachment-upload-copy">
                <div className="task-attachment-upload-title">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <span>{formatFileSize(item.file.size)}</span>
                </div>
                {item.status === 'uploading' ? (
                  <>
                    <div className="task-attachment-progress-track" aria-label={`อัปโหลดแล้ว ${item.progress}%`}>
                      <span style={{ width: `${Math.max(4, item.progress)}%` }} />
                    </div>
                    <div className="task-attachment-upload-status">
                      <LoaderCircle className="task-attachment-spin" size={13} aria-hidden="true" />
                      <span>
                        {item.progress >= 100
                          ? 'ส่งไฟล์ครบแล้ว กำลังจัดเก็บบนเซิร์ฟเวอร์...'
                          : item.progress > 0
                            ? `กำลังอัปโหลด ${item.progress}%`
                            : 'กำลังเตรียมไฟล์...'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="task-attachment-upload-error" role="alert">
                    <CircleAlert size={13} aria-hidden="true" />
                    <span>{item.error}</span>
                  </div>
                )}
              </div>
              {item.status === 'failed' ? (
                <div className="task-attachment-upload-actions">
                  <button type="button" onClick={() => void uploadOne(item)} aria-label={`อัปโหลด ${item.file.name} อีกครั้ง`} title="ลองอัปโหลดอีกครั้ง">
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => removeQueuedUpload(item)} aria-label={`นำ ${item.file.name} ออกจากรายการ`} title="นำไฟล์ออก">
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="task-attachment-file-list">
          {attachments.map((attachment, index) => {
            const isImage = isImageAttachment(attachment);
            return (
              <div key={`${attachment.url}-${index}`} className={`task-attachment-file-row${isImage ? ' is-image' : ''}`}>
                {isImage ? (
                  <AttachmentImageThumbnail
                    name={attachment.name || `รูปที่ ${index + 1}`}
                    src={localPreviewByRemoteUrl[attachment.url] || toPublicAttachmentUrl(attachment.url)}
                    onOpen={() => setLightboxStartIndex(imageAttachments.findIndex(({ index: imageIndex }) => imageIndex === index))}
                  />
                ) : (
                  <span className={`task-attachment-file-icon is-${attachment.type === 'link' ? 'link' : 'file'}`}>
                    {attachment.type === 'link' ? <Link2 size={17} aria-hidden="true" /> : <File size={17} aria-hidden="true" />}
                  </span>
                )}
                <div className="task-attachment-file-copy">
                  <strong title={attachment.name || attachment.url}>{attachment.name || attachment.url}</strong>
                  <span>{attachment.type === 'link' ? 'ลิงก์ภายนอก' : isImage ? 'รูปภาพ' : 'เอกสารแนบ'}</span>
                </div>
                <div className="task-attachment-file-actions">
                  <button type="button" onClick={() => onOpenAttachment(attachment.url)} aria-label={`เปิด ${attachment.name || 'ไฟล์แนบ'}`} title="เปิดไฟล์">
                    <ExternalLink size={15} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onEditAttachment(index, attachment)} aria-label={`แก้ไข ${attachment.name || 'ไฟล์แนบ'}`} title="แก้ไขชื่อหรือลิงก์">
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button className="is-danger" type="button" onClick={() => removeAttachment(index, attachment)} aria-label={`ลบ ${attachment.name || 'ไฟล์แนบ'}`} title="ลบไฟล์">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="task-attachment-empty">
          <File size={20} aria-hidden="true" />
          <span>ยังไม่มีเอกสารแนบ</span>
        </div>
      )}

      <button type="button" className="task-attachment-link-button" onClick={onAddLink} disabled={disabled}>
        <Link2 size={16} aria-hidden="true" />
        <span>เพิ่มลิงก์เอกสาร</span>
      </button>

      {uploadState.uploadingCount === 0 && uploadState.failedCount === 0 && attachments.length > 0 ? (
        <p className="task-attachment-ready-note" role="status">
          <CheckCircle2 size={14} aria-hidden="true" />
          ไฟล์พร้อมบันทึกพร้อมข้อมูลงานย่อย
        </p>
      ) : null}
      </section>
      {lightboxStartIndex !== null && lightboxImages.length > 0 ? (
        <AttachmentLightbox
          images={lightboxImages}
          initialIndex={lightboxStartIndex}
          onClose={() => setLightboxStartIndex(null)}
        />
      ) : null}
    </>
  );
};
