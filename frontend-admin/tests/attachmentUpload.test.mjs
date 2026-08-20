import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/components/tasks/attachmentUpload.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
const { uploadWithTimeout } = await import(moduleUrl);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('a stalled attachment upload exits instead of loading forever', async () => {
  let wasAborted = false;
  const result = await Promise.race([
    uploadWithTimeout((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        wasAborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    }), 20).then(
      () => 'resolved',
      (error) => error,
    ),
    delay(80).then(() => 'still-pending'),
  ]);

  assert.notEqual(result, 'still-pending', 'upload stayed pending after its deadline');
  assert.equal(result?.name, 'AttachmentUploadTimeoutError');
  assert.equal(wasAborted, true, 'the pending network request was not aborted');
});

test('a completed attachment upload keeps its response', async () => {
  const response = await uploadWithTimeout(async () => ({ ok: true, url: 'r2://example.webp' }), 50);
  assert.deepEqual(response, { ok: true, url: 'r2://example.webp' });
});

test('upload progress extends the inactivity deadline for a slow valid file', async () => {
  const response = await uploadWithTimeout((_signal, keepAlive) => new Promise((resolve) => {
    setTimeout(keepAlive, 15);
    setTimeout(keepAlive, 30);
    setTimeout(() => resolve({ ok: true }), 45);
  }), 20);

  assert.deepEqual(response, { ok: true });
});
