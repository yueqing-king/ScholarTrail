import { blankDB, createProject, changeProject, recordClick, editRecord, setPaperTag, projectTags, paperData, findMatch, matchScore, clean, now, errorMessage, zoteroWebURL } from './lib/core.js';
import { ZoteroClient, itemKey } from './lib/zotero.js';

const ready = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
let queue = Promise.resolve();
function serial(fn) { const job = queue.then(fn); queue = job.catch(() => {}); return job; }
async function read() { await ready; const s = await chrome.storage.local.get(['db', 'settings', 'zotero']); return { db: s.db || blankDB(), settings: s.settings || {}, zotero: s.zotero || { items: [] } }; }
async function mutate(fn) { return serial(async () => { const { db } = await read(); const result = fn(db); await chrome.storage.local.set({ db }); return result; }); }
async function notify() {
  chrome.runtime.sendMessage({ type: 'REFRESH' }).catch(() => {});
  for (const tab of await chrome.tabs.query({})) if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'REFRESH' }).catch(() => {});
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.db || changes.zotero || changes.settings)) notify().catch(() => {}); });
chrome.runtime.onInstalled.addListener(async ({ reason }) => { await ready; await chrome.alarms.create('zotero-refresh', { periodInMinutes: 15 }); if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'zotero-refresh') syncZotero(false).catch(() => {}); });

let syncing = null, zoteroQueue = Promise.resolve();
function exclusiveZotero(fn) { const p = zoteroQueue.then(fn); zoteroQueue = p.catch(() => {}); return p; }
function syncZotero(force = true) {
  if (syncing) return syncing;
  syncing = exclusiveZotero(async () => {
    const { settings, zotero } = await read();
    if (!settings.api_key) { if (force) throw new Error('请先在设置中连接 Zotero 文献库。'); return; }
    if (!force && Date.now() - Date.parse(zotero.checked_at || 0) < 5 * 60000) return;
    const client = new ZoteroClient(settings, fetch, zotero);
    try {
      const result = await client.library();
      // A disconnect or account change while fetching must never restore old data.
      const current = (await read()).settings;
      if (current.api_key === settings.api_key && current.user_id === settings.user_id) await chrome.storage.local.set({ zotero: result });
      return { count: result.items.length };
    } catch (e) {
      const current = await read();
      if (current.settings.api_key === settings.api_key) await chrome.storage.local.set({ zotero: { ...current.zotero, error: errorMessage(e) } });
      throw e;
    } finally {
      await serial(async () => { const current = await read(); if (current.settings.api_key === settings.api_key) await chrome.storage.local.set({ settings: { ...current.settings, backoff_until: client.until } }); });
    }
  }).finally(() => { syncing = null; });
  return syncing;
}
function linkFor(paper, zotero, settings) {
  if (!settings.api_key || zotero.user_id !== settings.user_id) return null;
  const verifiedKey = settings.direct_links?.[paper.id];
  const match = (verifiedKey && zotero.items.find(i => i.key === verifiedKey)) || findMatch(zotero.items, paper);
  return match ? { key: match.key, checked_at: zotero.checked_at, stale: !!zotero.error || Date.now() - Date.parse(zotero.checked_at) > 3600000, web_url: zoteroWebURL(match.web_url, match.key), desktop_url: `zotero://select/library/items/${match.key}` } : null;
}
function summary(settings, zotero) { return { connected: !!settings.api_key, user_id: settings.user_id || '', checked_at: zotero.checked_at || null, count: zotero.items.length, error: zotero.error ? errorMessage(zotero.error) : '', syncing: !!syncing }; }
async function handle(m, trusted) {
  if (m.type === 'OPEN_APP') { const hash = m.paper_id ? `#paper/${encodeURIComponent(m.paper_id)}` : (m.settings ? '#settings' : ''); await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') + hash }); return; }
  if (m.type === 'RECORD_CLICK') return mutate(db => recordClick(db, m.paper, m.project_id || db.active_project_id, m.context));
  if (m.type === 'EDIT_RECORD') return mutate(db => editRecord(db, m.project_id, m.paper_id, m.patch || {}));
  if (m.type === 'SET_PAPER_TAG') return mutate(db => setPaperTag(db, m.project_id, m));
  if (m.type === 'READ_RESULTS') {
    const { db, settings, zotero } = await read();
    const project = db.projects.find(p => p.id === db.active_project_id) || null;
    const results = (Array.isArray(m.papers) ? m.papers : []).slice(0, 100).map(input => {
      const candidate = paperData(input), paper = findMatch(db.papers, candidate);
      return { paper_id: paper?.id || null, record: paper ? db.project_papers.find(p => p.project_id === project?.id && p.paper_id === paper.id) || null : null, zotero: linkFor(paper || candidate, zotero, settings) };
    });
    return { project, results, tags: projectTags(db, project?.id) };
  }
  if (!trusted) throw new Error('请在 ScholarTrail 内执行此操作。');
  if (m.type === 'GET_STATE') {
    const { db, settings, zotero } = await read();
    return { ...db, encounters: undefined, zotero_status: summary(settings, zotero), zotero_links: Object.fromEntries(db.papers.map(p => [p.id, linkFor(p, zotero, settings)])) };
  }
  if (m.type === 'GET_HISTORY') { const { db } = await read(); return db.encounters.filter(e => e.project_id === m.project_id && e.paper_id === m.paper_id).reverse(); }
  if (m.type === 'CREATE_PROJECT') return mutate(db => createProject(db, m.name));
  if (m.type === 'PROJECT_ACTION') return mutate(db => changeProject(db, m.action, m.project_id, m.name));
  if (m.type === 'EXPORT') { const { db } = await read(); return { app: 'ScholarTrail', exported_at: now(), ...db }; }
  if (m.type === 'ZOTERO_CONNECT') {
    const user_id = clean(m.user_id, 30), api_key = clean(m.api_key, 100);
    if (!/^\d+$/.test(user_id) || !/^[A-Za-z0-9]{16,100}$/.test(api_key)) throw new Error('请填写 Zotero 数字用户 ID 和有效的 API 密钥。');
    if (!await chrome.permissions.contains({ origins: ['https://api.zotero.org/*'] })) throw new Error('请在浏览器提示时允许连接 Zotero。');
    return exclusiveZotero(async () => {
      const settings = { user_id, api_key };
      const result = await new ZoteroClient(settings).library();
      await serial(() => chrome.storage.local.set({ settings, zotero: result, pending_saves: {} }));
      return { count: result.items.length };
    });
  }
  if (m.type === 'ZOTERO_DISCONNECT') { await exclusiveZotero(() => serial(() => chrome.storage.local.set({ settings: {}, zotero: { items: [] }, pending_saves: {} }))); await chrome.permissions.remove({ origins: ['https://api.zotero.org/*'] }); return; }
  if (m.type === 'ZOTERO_SYNC') return syncZotero(true);
  if (m.type === 'ZOTERO_ADD') return exclusiveZotero(async () => {
    let { db, settings, zotero } = await read();
    if (!settings.api_key) throw new Error('请先在设置中连接 Zotero。');
    const paper = db.papers.find(p => p.id === m.paper_id);
    if (!paper) throw new Error('这篇论文的记录已不存在。');
    const client = new ZoteroClient(settings, fetch, zotero);
    try {
    // Check the current library before creating a reference, including after a timeout.
    zotero = await client.library();
    const existing = linkFor(paper, zotero, settings);
    if (existing) { await chrome.storage.local.set({ zotero }); return existing; }
    if (zotero.items.filter(item => matchScore(item, paper) > 0).length > 1) throw new Error('Zotero 中有多条可能匹配的记录。请先检查已有条目，再决定是否添加。');
    const pending = (await chrome.storage.local.get('pending_saves')).pending_saves || {};
    const previous = pending[paper.id];
    const key = previous || itemKey();
    if (!previous) { pending[paper.id] = key; await chrome.storage.local.set({ pending_saves: pending }); }
    const saved = (previous ? await client.existing(key, paper) : null) || await client.add(paper, key);
    zotero.items = [...zotero.items.filter(i => i.key !== saved.key), saved];
    // Force a full snapshot on the next refresh so deletions cannot be missed.
    zotero.version = null; zotero.checked_at = now(); zotero.error = '';
    delete pending[paper.id];
    settings.direct_links = { ...settings.direct_links, [paper.id]: saved.key };
    await serial(() => chrome.storage.local.set({ zotero, pending_saves: pending, settings }));
    return linkFor(paper, zotero, settings);
    } finally {
      await serial(async () => { const current = await read(); if (current.settings.api_key === settings.api_key) await chrome.storage.local.set({ settings: { ...current.settings, backoff_until: client.until } }); });
    }
  });
  throw new Error('无法识别此 ScholarTrail 操作。');
}
const scholarHosts = new Set(chrome.runtime.getManifest().content_scripts[0].matches.map(m => new URL(m).hostname));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'REFRESH') return false;
  const trusted = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
  let scholar = false;
  try { const u = new URL(sender.url); scholar = sender.id === chrome.runtime.id && u.protocol === 'https:' && scholarHosts.has(u.hostname); } catch {}
  if (!trusted && !scholar) { sendResponse({ ok: false, error: '此请求来源不受支持。' }); return false; }
  handle(message || {}, trusted).then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});
