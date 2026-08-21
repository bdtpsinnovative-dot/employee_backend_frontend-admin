import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/components/tasks/taskNotificationRefresh.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
  },
  fileName: sourceUrl.pathname,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
const { getTaskNotificationRefreshKey } = await import(moduleUrl);

const notification = (id, taskId, isRead = false) => ({
  id,
  is_read: isRead,
  metadata: JSON.stringify({ task_id: taskId, list_id: 'list-1' }),
});

test('a new notification for the open project changes its refresh key', () => {
  const before = getTaskNotificationRefreshKey([
    notification('notification-1', 'task-a'),
  ], 'task-a');
  const after = getTaskNotificationRefreshKey([
    notification('notification-1', 'task-a'),
    notification('notification-2', 'task-a'),
  ], 'task-a');

  assert.notEqual(after, before);
});

test('notifications from another project do not refresh the open project', () => {
  const before = getTaskNotificationRefreshKey([
    notification('notification-1', 'task-a'),
  ], 'task-a');
  const after = getTaskNotificationRefreshKey([
    notification('notification-1', 'task-a'),
    notification('notification-2', 'task-b'),
  ], 'task-a');

  assert.equal(after, before);
});

test('marking a notification as read does not cause a redundant refresh', () => {
  const before = getTaskNotificationRefreshKey([
    notification('notification-1', 'task-a', false),
  ], 'task-a');
  const after = getTaskNotificationRefreshKey([
    notification('notification-1', 'task-a', true),
  ], 'task-a');

  assert.equal(after, before);
});
