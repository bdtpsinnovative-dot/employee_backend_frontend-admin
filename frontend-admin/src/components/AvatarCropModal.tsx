import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Crop, Move, X } from 'lucide-react';

const CROP_SIZE = 280;
const OUTPUT_SIZE = 512;

type AvatarCropModalProps = {
  source: string;
  fileName: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function AvatarCropModal({ source, fileName, onCancel, onConfirm }: AvatarCropModalProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [cropSize, setCropSize] = useState(CROP_SIZE);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  const dimensions = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) {
      return { scale: 1, width: cropSize, height: cropSize, maxX: 0, maxY: 0 };
    }
    const baseScale = Math.max(cropSize / naturalSize.width, cropSize / naturalSize.height);
    const scale = baseScale * zoom;
    const width = naturalSize.width * scale;
    const height = naturalSize.height * scale;
    return {
      scale,
      width,
      height,
      maxX: Math.max(0, (width - cropSize) / 2),
      maxY: Math.max(0, (height - cropSize) / 2),
    };
  }, [cropSize, naturalSize, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => setCropSize(viewport.clientWidth || CROP_SIZE);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setOffset(current => ({
      x: clamp(current.x, -dimensions.maxX, dimensions.maxX),
      y: clamp(current.y, -dimensions.maxY, dimensions.maxY),
    }));
  }, [dimensions.maxX, dimensions.maxY]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setOffset(current => ({
      x: clamp(current.x + deltaX, -dimensions.maxX, dimensions.maxX),
      y: clamp(current.y + deltaY, -dimensions.maxY, dimensions.maxY),
    }));
  }

  function handlePointerEnd() {
    dragRef.current = null;
  }

  function handleConfirm() {
    const image = imageRef.current;
    if (!image || !naturalSize.width || !naturalSize.height) return;

    setProcessing(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      setProcessing(false);
      return;
    }

    const sourceX = (dimensions.width / 2 - cropSize / 2 - offset.x) / dimensions.scale;
    const sourceY = (dimensions.height / 2 - cropSize / 2 - offset.y) / dimensions.scale;
    const sourceSize = cropSize / dimensions.scale;
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(blob => {
      setProcessing(false);
      if (!blob) return;
      const baseName = fileName.replace(/\.[^.]+$/, '') || 'avatar';
      onConfirm(new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }

  return (
    <div className="profile-crop-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="profile-crop-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" onMouseDown={event => event.stopPropagation()}>
        <div className="profile-crop-header">
          <div><h3 id="avatar-crop-title"><Crop size={18} /> ตัดรูปโปรไฟล์</h3><p>ลากรูปและซูมให้พอดีกับกรอบ</p></div>
          <button type="button" onClick={onCancel} aria-label="ปิดหน้าตัดรูป"><X size={19} /></button>
        </div>

        <div
          ref={viewportRef}
          className="profile-crop-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <img
            ref={imageRef}
            src={source}
            alt="ตัวอย่างรูปสำหรับตัด"
            draggable={false}
            onLoad={event => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            style={{
              width: dimensions.width,
              height: dimensions.height,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          <div className="profile-crop-mask" />
        </div>

        <label className="profile-crop-zoom">
          <span><Move size={15} /> ซูมรูป</span>
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
        </label>

        <div className="profile-crop-actions">
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={processing}>ยกเลิก</button>
          <button className="btn-primary profile-action-button" type="button" onClick={handleConfirm} disabled={processing || !naturalSize.width}>
            {processing ? 'กำลังตัดรูป...' : 'ใช้รูปนี้'}
          </button>
        </div>
      </div>
    </div>
  );
}
