import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FileImage, RefreshCw, X } from 'lucide-react';

export interface LightboxImage {
  name: string;
  src: string;
}

interface AttachmentLightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

export const AttachmentLightbox: React.FC<AttachmentLightboxProps> = ({
  images,
  initialIndex,
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [currentIndex, setCurrentIndex] = useState(() => Math.min(initialIndex, images.length - 1));
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  onCloseRef.current = onClose;

  const currentImage = images[currentIndex];

  const showImage = (nextIndex: number) => {
    if (images.length === 0) return;
    setCurrentIndex((nextIndex + images.length) % images.length);
  };

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setReloadKey(0);
  }, [currentImage?.src]);

  useEffect(() => {
    if (images.length === 0) {
      onCloseRef.current();
      return;
    }
    if (currentIndex >= images.length) setCurrentIndex(images.length - 1);
  }, [currentIndex, images.length]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === 'ArrowLeft' && images.length > 1) {
        event.preventDefault();
        setCurrentIndex((index) => (index - 1 + images.length) % images.length);
        return;
      }
      if (event.key === 'ArrowRight' && images.length > 1) {
        event.preventDefault();
        setCurrentIndex((index) => (index + 1) % images.length);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [images.length]);

  if (!currentImage || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="task-attachment-lightbox-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        className="task-attachment-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="task-attachment-lightbox-header">
          <div>
            <span>รูปภาพแนบ</span>
            <h2 id={titleId} title={currentImage.name}>{currentImage.name}</h2>
          </div>
          <div className="task-attachment-lightbox-header-actions">
            <span aria-live="polite">{currentIndex + 1} / {images.length}</span>
            <button ref={closeButtonRef} type="button" onClick={() => onCloseRef.current()} aria-label="ปิดรูปภาพขนาดใหญ่">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="task-attachment-lightbox-stage">
          {!loaded && !failed ? <div className="task-attachment-lightbox-skeleton" aria-label="กำลังโหลดรูปภาพ" /> : null}
          {failed ? (
            <div className="task-attachment-lightbox-error" role="status">
              <FileImage size={36} aria-hidden="true" />
              <strong>ไม่สามารถแสดงรูปนี้ได้</strong>
              <span>ตรวจสอบการเชื่อมต่อแล้วลองโหลดอีกครั้ง</span>
              <button
                type="button"
                onClick={() => {
                  setLoaded(false);
                  setFailed(false);
                  setReloadKey((key) => key + 1);
                }}
              >
                <RefreshCw size={16} aria-hidden="true" />
                ลองโหลดใหม่
              </button>
            </div>
          ) : (
            <img
              key={`${currentImage.src}-${reloadKey}`}
              src={currentImage.src}
              alt={`รูปภาพขนาดใหญ่ ${currentImage.name}`}
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}

          {images.length > 1 ? (
            <>
              <button className="task-attachment-lightbox-nav is-previous" type="button" onClick={() => showImage(currentIndex - 1)} aria-label="ดูรูปก่อนหน้า">
                <ChevronLeft size={25} aria-hidden="true" />
              </button>
              <button className="task-attachment-lightbox-nav is-next" type="button" onClick={() => showImage(currentIndex + 1)} aria-label="ดูรูปถัดไป">
                <ChevronRight size={25} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        {images.length > 1 ? (
          <footer className="task-attachment-lightbox-thumbnails" aria-label="เลือกรูปภาพ">
            {images.map((image, index) => (
              <button
                key={`${image.src}-${index}`}
                type="button"
                className={index === currentIndex ? 'is-active' : ''}
                onClick={() => showImage(index)}
                aria-label={`ดูรูปที่ ${index + 1}: ${image.name}`}
                aria-current={index === currentIndex ? 'true' : undefined}
              >
                <img src={image.src} alt="" loading="lazy" />
              </button>
            ))}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};
