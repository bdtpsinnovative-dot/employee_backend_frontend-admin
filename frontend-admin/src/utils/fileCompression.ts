const IMAGE_MAX_EDGE = 2048;
const IMAGE_MIN_EDGE = 1280;
const IMAGE_TARGET_BYTES = 1_250_000;
const MIN_WEBP_QUALITY = 0.66;
const INITIAL_WEBP_QUALITY = 0.84;

function isCompressibleImage(file: File): boolean {
  return file.type.startsWith('image/')
    && file.type !== 'image/gif'
    && file.type !== 'image/svg+xml'
    && file.size > 250 * 1024;
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

function webpFileName(name: string): string {
  const baseName = name.replace(/\.[^.]+$/, '').trim() || 'image';
  return `${baseName}.webp`;
}

/**
 * Keeps upload bandwidth and R2 storage low while preserving a crisp image for
 * task evidence. Animated GIFs and SVG files are retained unchanged so their
 * animation/vector data is never lost.
 */
export async function optimizeFileForUpload(file: File): Promise<File> {
  if (!isCompressibleImage(file) || typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const sourceEdge = Math.max(bitmap.width, bitmap.height);
    let scale = Math.min(1, IMAGE_MAX_EDGE / sourceEdge);
    let result: Blob | null = null;

    for (;;) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return file;

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let quality = INITIAL_WEBP_QUALITY;
      result = await canvasToWebp(canvas, quality);
      while (result && result.size > IMAGE_TARGET_BYTES && quality > MIN_WEBP_QUALITY) {
        quality = Math.max(MIN_WEBP_QUALITY, quality - 0.06);
        result = await canvasToWebp(canvas, quality);
      }

      const outputEdge = Math.max(canvas.width, canvas.height);
      if (!result || result.size <= IMAGE_TARGET_BYTES || outputEdge <= IMAGE_MIN_EDGE) break;
      scale *= 0.82;
    }

    // Do not replace a file if the compressed version is not meaningfully smaller.
    if (!result || result.size >= file.size * 0.97) return file;

    return new File([result], webpFileName(file.name), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch {
    // Unsupported formats (for example HEIC in some browsers) upload unchanged.
    return file;
  } finally {
    bitmap?.close();
  }
}
