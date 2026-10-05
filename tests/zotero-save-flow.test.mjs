import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDB, createProject, recordClick } from '../extension/lib/core.js';

for (const scenario of ['new save', 'retry an earlier rejected save', 'recover a lost success response']) {
  test(`background save flow: ${scenario} produces one item and an in-library badge`, async t => {
    const db = blankDB(), project = createProject(db, 'Test research');
    // Sparse Scholar metadata exercises the verified direct link on recovery.
    const candidate = { title: 'A test paper for reliable research memory', primary_url: 'https://example.org/paper', external_ids: ['scholar:cid:1234'] };
    const { paper } = recordClick(db, candidate, project.id);
    const stored = {
      db,
      settings: { user_id: '123', api_key: 'testkeytestkeytestkey' },
      zotero: { items: [], user_id: '123', version: '1', checked_at: new Date().toISOString() },
      pending_saves: scenario === 'retry an earlier rejected save' ? { [paper.id]: 'ABCD2345' } : {}
    };
    let listener, writes = 0, version = 1, lost = false;
    const remote = new Map();
    const clone = value => structuredClone(value);
    const noEvent = { addListener() {} };
    const extensionURL = 'chrome-extension://test-extension/';
    const fakeChrome = {
      storage: {
        local: {
          async setAccessLevel() {},
          async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, clone(stored[key])])); },
          async set(values) { Object.assign(stored, clone(values)); }
        },
        onChanged: noEvent
      },
      runtime: {
        id: 'test-extension',
        getURL: path => extensionURL + path,
        getManifest: () => ({ content_scripts: [{ matches: ['https://scholar.google.com/*'] }] }),
        onMessage: { addListener(fn) { listener = fn; } },
        onInstalled: noEvent,
        async sendMessage() {}
      },
      tabs: { async query() { return []; }, async sendMessage() {} },
      alarms: { onAlarm: noEvent, async create() {} }
    };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Last-Modified-Version': String(version) } });
    const fakeFetch = async (url, options) => {
      assert.equal(new URL(url).hostname, 'api.zotero.org');
      if (url.includes('/items/top?')) return reply([...remote.values()]);
      if (url.includes('/items/new?')) return reply({ itemType: 'journalArticle', tags: [], collections: [], relations: {} });
      if (options.method === 'POST') {
        const item = JSON.parse(options.body)[0];
        assert.equal(item.version, 0);
        assert.ok(!remote.has(item.key), 'an existing item must not be posted again');
        writes++;
        const saved = { key: item.key, version: ++version, data: item, links: { alternate: { href: `https://www.zotero.org/test-user/items/${item.key}` } } };
        remote.set(item.key, saved);
        if (scenario === 'recover a lost success response' && !lost) {
          lost = true;
          throw new TypeError('Failed to fetch');
        }
        return reply({ successful: { 0: saved }, failed: {} });
      }
      const key = new URL(url).pathname.split('/').at(-1);
      return remote.has(key) ? reply(remote.get(key)) : reply({}, 404);
    };
    t.mock.method(globalThis, 'fetch', fakeFetch);
    const originalChrome = globalThis.chrome;
    globalThis.chrome = fakeChrome;
    t.after(() => { if (originalChrome === undefined) delete globalThis.chrome; else globalThis.chrome = originalChrome; });
    await import(`../extension/background.js?test=${encodeURIComponent(scenario)}`);
    const send = message => new Promise(resolve => listener(message, { id: 'test-extension', url: extensionURL + 'app.html' }, resolve));
    const add = () => send({ type: 'ZOTERO_ADD', paper_id: paper.id });
    if (scenario === 'recover a lost success response') {
      assert.equal((await add()).ok, false);
      assert.ok(stored.pending_saves[paper.id]);
      assert.equal(remote.size, 1);
    }
    const saved = await add();
    assert.equal(saved.ok, true, saved.error);
    if (scenario === 'retry an earlier rejected save') assert.equal(saved.data.key, 'ABCD2345');
    assert.equal((await add()).data.key, saved.data.key);
    assert.equal(writes, 1);
    assert.equal(remote.size, 1);
    assert.deepEqual(stored.pending_saves, {});
    const state = await send({ type: 'GET_STATE' });
    assert.equal(state.data.zotero_links[paper.id].key, saved.data.key);
    assert.equal(state.data.zotero_links[paper.id].web_url, `https://www.zotero.org/test-user/items/${saved.data.key}`);
    const results = await send({ type: 'READ_RESULTS', papers: [candidate] });
    assert.equal(results.data.results[0].zotero.key, saved.data.key);
    assert.equal(results.data.results[0].zotero.web_url, state.data.zotero_links[paper.id].web_url);
  });
}
