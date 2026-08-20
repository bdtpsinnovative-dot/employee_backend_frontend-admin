export type AttachmentUploadOperation<T> = (
  signal: AbortSignal,
  keepAlive: () => void,
) => Promise<T>;

export class AttachmentUploadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`อัปโหลดใช้เวลานานเกิน ${Math.ceil(timeoutMs / 1000)} วินาที กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่`);
    this.name = 'AttachmentUploadTimeoutError';
  }
}

export function uploadWithTimeout<T>(
  upload: AttachmentUploadOperation<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout>;

    const keepAlive = () => {
      if (settled) return;
      globalThis.clearTimeout(timeoutId);
      timeoutId = globalThis.setTimeout(() => {
        settled = true;
        controller.abort();
        reject(new AttachmentUploadTimeoutError(timeoutMs));
      }, timeoutMs);
    };

    keepAlive();

    Promise.resolve()
      .then(() => upload(controller.signal, keepAlive))
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(timeoutId);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(timeoutId);
          if (controller.signal.aborted) {
            reject(new AttachmentUploadTimeoutError(timeoutMs));
            return;
          }
          reject(error);
        },
      );
  });
}
