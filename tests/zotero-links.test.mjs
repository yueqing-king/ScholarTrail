import test from 'node:test';
import assert from 'node:assert/strict';
import { zoteroPaper } from '../extension/lib/core.js';
import { ZoteroClient } from '../extension/lib/zotero.js';

const url = 'https://www.zotero.org/example-user/items/ABCD2345';
const item = {
  key: 'ABCD2345', version: 9,
  links: { alternate: { href: url, type: 'text/html' } },
  data: { itemType: 'journalArticle', title: 'A saved research article', date: '2024', creators: [{ creatorType: 'author', name: 'J Smith' }] }
};
const settings = { user_id: '123', api_key: 'testkeytestkeytestkey' };

test('preserve the canonical web-library URL returned by Zotero', () => {
  assert.equal(zoteroPaper(item).web_url, url);
});

test('do not turn item URIs, foreign URLs or missing links into clickable web URLs', () => {
  for (const href of ['', 'javascript:alert(1)', 'https://www.zotero.org.evil.example/items/ABCD2345', 'https://www.zotero.org/users/123/items/ABCD2345', 'https://api.zotero.org/users/123/items/ABCD2345', 'https://www.zotero.org/example-user/items/DIFFERENT']) {
    assert.equal(zoteroPaper({ ...item, links: { alternate: { href } } }).web_url, '');
  }
});

test('an old library cache is fetched in full to restore discarded canonical links', async () => {
  const oldItem = zoteroPaper(item); delete oldItem.web_url;
  const client = new ZoteroClient(settings, async (requestURL, options) => {
    assert.equal(options.headers['If-Modified-Since-Version'], undefined);
    return new Response(JSON.stringify([item]), { headers: { 'Last-Modified-Version': '9' } });
  }, { user_id: '123', items: [oldItem], version: '9' });
  const result = await client.library();
  assert.equal(result.items[0].web_url, url);
  assert.equal(result.web_links_version, 1);
});
