import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoteroClient } from '../extension/lib/zotero.js';
import { errorMessage } from '../extension/lib/core.js';

const settings = { user_id: '123', api_key: 'testkeytestkeytestkey' };
function browserLikeFetch(url, options) {
  if (this !== globalThis) {
    throw new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation");
  }
  assert.equal(new URL(url).host, 'api.zotero.org');
  assert.equal(options.headers['Zotero-API-Key'], settings.api_key);
  return Promise.resolve(new Response('[]', { headers: { 'Last-Modified-Version': '1' } }));
}

test('initial connection preserves the native fetch receiver', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = browserLikeFetch;
  try {
    const result = await new ZoteroClient(settings).library();
    assert.deepEqual(result.items, []);
    assert.equal(result.user_id, '123');
  } finally { globalThis.fetch = saved; }
});

test('refresh with explicitly supplied fetch preserves its native receiver', async () => {
  const result = await new ZoteroClient(settings, browserLikeFetch, {}).library();
  assert.deepEqual(result.items, []);
});

test('illegal invocation is distinguished from connection and authentication errors', () => {
  assert.equal(errorMessage(new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation")), '插件请求调用异常，请更新插件后重试。');
  assert.equal(errorMessage(new TypeError('Failed to fetch')), '网络连接失败，请检查网络后重试。');
  assert.equal(errorMessage(new Error('Zotero 拒绝访问，请检查 API 密钥及个人文献库权限。')), 'Zotero 拒绝访问，请检查 API 密钥及个人文献库权限。');
});
