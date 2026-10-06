import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDB, createProject, recordClick, editRecord } from '../extension/lib/core.js';
import { createBackup } from '../extension/lib/backup.js';

async function setup(t) {
  const db = blankDB(), project = createProject(db, '现有项目');
  const { paper } = recordClick(db, { title: 'A paper already in the browser', doi: '10.1000/current' }, project.id);
  editRecord(db, project.id, paper.id, { note: 'Current note' });
  const stored = { db, settings: { user_id: '123', api_key: 'testkeytestkeytestkey' }, zotero: { items: [] }, pending_saves: { keep: 'ABCD2345' } };
  let listener, failStorage = false;
  const noEvent = { addListener() {} }, extensionURL = 'chrome-extension://test-extension/';
  const original = globalThis.chrome;
  globalThis.chrome = {
    storage: { local: { async setAccessLevel() {}, async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(stored[k])])); }, async set(values) { if (failStorage) throw new Error('模拟存储失败'); Object.assign(stored, structuredClone(values)); } }, onChanged: noEvent },
    runtime: { id: 'test-extension', getURL: path => extensionURL + path, getManifest: () => ({ content_scripts: [{ matches: ['https://scholar.google.com/*'] }] }), onMessage: { addListener(fn) { listener = fn; } }, onInstalled: noEvent, async sendMessage() {} },
    tabs: { async query() { return []; }, async sendMessage() {} }, alarms: { onAlarm: noEvent, async create() {} }
  };
  t.after(() => { if (original === undefined) delete globalThis.chrome; else globalThis.chrome = original; });
  await import(`../extension/background.js?backup=${crypto.randomUUID()}`);
  const send = (message, trusted = true) => new Promise(resolve => listener(message, { id: 'test-extension', url: trusted ? extensionURL + 'app.html' : 'https://scholar.google.com/scholar' }, resolve));
  const incoming = blankDB(), importedProject = createProject(incoming, '备份项目');
  recordClick(incoming, { title: 'A paper in the backup', doi: '10.1000/backup' }, importedProject.id);
  return { stored, send, text: JSON.stringify(createBackup(incoming)), setFailure: value => { failStorage = value; }, project, paper };
}
test('import background flow previews without writing, commits once, preserves connection and saves pre-import backup', async t => {
  const { stored, send, text } = await setup(t), before = structuredClone(stored);
  const preview = await send({ type: 'IMPORT_PREVIEW', text }); assert.equal(preview.ok, true, preview.error); assert.deepEqual(stored, before);
  const imported = await send({ type: 'IMPORT', text, revision: preview.data.revision }); assert.equal(imported.ok, true, imported.error);
  assert.equal(stored.db.projects.length, 2); assert.deepEqual(stored.settings, before.settings); assert.deepEqual(stored.pending_saves, before.pending_saves);
  const backup = await send({ type: 'EXPORT_IMPORT_BACKUP' }); assert.equal(backup.data.projects.length, 1); assert.equal(backup.data.project_papers[0].note, 'Current note');
  assert.ok(!JSON.stringify(backup.data).includes(before.settings.api_key));
  assert.equal((await send({ type: 'GET_STATE' })).data.import_backup_available, true);
  const repeat = await send({ type: 'IMPORT_PREVIEW', text });
  await send({ type: 'IMPORT', text, revision: repeat.data.revision });
  assert.equal(stored.db.projects.length, 2); assert.deepEqual(stored.import_backup, backup.data);
});
test('a write between preview and import requires a fresh preview and preserves the new note', async t => {
  const { stored, send, text, project, paper } = await setup(t);
  const preview = await send({ type: 'IMPORT_PREVIEW', text });
  const results = await Promise.all([send({ type: 'EDIT_RECORD', project_id: project.id, paper_id: paper.id, patch: { note: 'Work done after preview' } }), send({ type: 'IMPORT', text, revision: preview.data.revision })]);
  assert.equal(results[0].ok, true); assert.equal(results[1].ok, false); assert.match(results[1].error, /数据已更新/);
  assert.equal(stored.db.project_papers[0].note, 'Work done after preview'); assert.equal(stored.db.projects.length, 1);
});
test('invalid input and failed storage leave all original data unchanged', async t => {
  const { stored, send, text, setFailure } = await setup(t), before = structuredClone(stored);
  assert.equal((await send({ type: 'IMPORT_PREVIEW', text: '{}' })).ok, false);
  assert.equal((await send({ type: 'IMPORT', text, revision: 'invalid' })).ok, false);
  const preview = await send({ type: 'IMPORT_PREVIEW', text }); setFailure(true);
  const failed = await send({ type: 'IMPORT', text, revision: preview.data.revision }); assert.equal(failed.ok, false);
  assert.deepEqual(stored, before);
});
test('Scholar content scripts cannot import, preview backups or retrieve the pre-import backup', async t => {
  const { send, text } = await setup(t);
  for (const type of ['IMPORT_PREVIEW', 'IMPORT', 'EXPORT_IMPORT_BACKUP']) assert.equal((await send({ type, text, revision: 'anything' }, false)).ok, false);
});
