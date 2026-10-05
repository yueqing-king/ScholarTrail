import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoteroClient } from '../extension/lib/zotero.js';
import { errorMessage } from '../extension/lib/core.js';

const settings = { user_id: '123', api_key: 'testkeytestkeytestkey' };
const paper = { title: 'Test article about research memory', authors: 'J Smith', year: '2024', doi: '', primary_url: 'https://example.org/paper' };
const response = data => new Response(JSON.stringify(data));

test('API contract: a client-assigned new item key requires version zero', async () => {
  const c = new ZoteroClient(settings, async (url, options) => {
    if (url.includes('/items/new?')) return response({ itemType: 'journalArticle', tags: [], collections: [], relations: {} });
    const item = JSON.parse(options.body)[0];
    // Zotero v3 JSON version property: a supplied key must have a version.
    if (item.version !== 0) return response({ successful: {}, failed: { 0: { code: 428, message: 'Version not provided for item with key' } } });
    assert.equal(item.key, 'ABCD2345');
    assert.equal(options.headers['Zotero-Write-Token'], undefined);
    return response({ successful: { 0: { key: item.key, version: 1, data: item } }, failed: {} });
  });
  const saved = await c.add(paper, 'ABCD2345');
  assert.equal(saved.key, 'ABCD2345');
  assert.equal(saved.title, paper.title);
});

for (const [code, message, expected] of [
  [428, 'Version not provided for item with key', /版本|请求不完整/],
  [403, 'Write access denied', /写入权限/],
  [412, 'Item already exists', /刷新/]
]) {
  test(`per-item ${code} failure reaches the UI with actionable Chinese text`, async () => {
    const c = new ZoteroClient(settings, async url => response(url.includes('/items/new?') ? {} : { successful: {}, failed: { 0: { code, message } } }));
    await assert.rejects(c.add(paper, 'ABCD2345'), error => {
      assert.match(errorMessage(error), expected);
      return true;
    });
  });
}

test('HTTP 403 during saving identifies the required write permission', async () => {
  const c = new ZoteroClient(settings, async url => url.includes('/items/new?') ? response({}) : new Response('', { status: 403 }));
  await assert.rejects(c.add(paper, 'ABCD2345'), error => {
    assert.match(errorMessage(error), /写入权限/);
    return true;
  });
});
