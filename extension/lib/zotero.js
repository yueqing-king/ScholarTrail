import { zoteroPaper, findMatch, clean } from './core.js';

function saveError(code) {
  const status = Number(code);
  const descriptions = {
    400: 'Zotero 未保存文献：条目信息格式不符合要求，请检查文献信息（错误 400）。',
    403: 'Zotero 拒绝保存，请检查 API 密钥是否允许写入个人文献库（写入权限，错误 403）。',
    409: 'Zotero 文献库正在处理其他操作，请稍后重试（错误 409）。',
    412: '该条目可能已经存在，请先刷新文献库再重试，避免重复保存（错误 412）。',
    428: '保存请求缺少版本信息，请更新插件后重试（错误 428）。',
    429: 'Zotero 当前繁忙，请几分钟后重试（错误 429）。'
  };
  const suffix = Number.isInteger(status) && status >= 400 && status <= 599 ? `（错误 ${status}）` : '';
  return new Error(descriptions[status] || `Zotero 尚未确认保存成功${suffix}，请先刷新文献库再重试。`);
}
export class ZoteroClient {
  constructor(settings, fetcher = fetch, cache = {}) {
    this.settings = settings;
    // Native browser fetch requires the Window/WorkerGlobalScope receiver.
    this.fetcher = fetcher.bind(globalThis);
    this.cache = cache;
    this.until = settings.backoff_until || 0;
  }
  async request(path, options = {}) {
    if (Date.now() < this.until) throw new Error('Zotero 要求暂停请求，请几分钟后重试。');
    const response = await this.fetcher(`https://api.zotero.org${path}`, {
      ...options, signal: AbortSignal.timeout(20000),
      headers: { 'Zotero-API-Version': '3', 'Zotero-API-Key': this.settings.api_key, ...options.headers }
    });
    const delay = Number(response.headers.get('Backoff') || response.headers.get('Retry-After') || (response.status === 429 ? 60 : 0));
    if (delay > 0) this.until = Date.now() + delay * 1000;
    if (response.status === 304) return { unchanged: true };
    if (!response.ok) {
      if (options.method === 'POST') throw saveError(response.status);
      const descriptions = { 403: 'Zotero 拒绝访问，请检查 API 密钥及个人文献库权限。', 429: 'Zotero 当前繁忙，请几分钟后重试。', 412: '本次保存可能已经完成，请先刷新文献库再重试。', 404: '未找到该 Zotero 文献库或条目。' };
      throw new Error(descriptions[response.status] || `Zotero 请求失败（${response.status}），请重试。`);
    }
    return { data: await response.json(), version: response.headers.get('Last-Modified-Version'), total: Number(response.headers.get('Total-Results') || 0) };
  }
  async library() {
    const items = []; let version = null;
    for (let start = 0; start < 100000; start += 100) {
      // Older caches discarded links.alternate.href; fetch them once in full.
      const headers = start === 0 && this.cache.version && this.cache.web_links_version === 1 ? { 'If-Modified-Since-Version': String(this.cache.version) } : {};
      const r = await this.request(`/users/${this.settings.user_id}/items/top?format=json&limit=100&start=${start}`, { headers });
      if (r.unchanged) return { ...this.cache, checked_at: new Date().toISOString(), error: '' };
      if (!Array.isArray(r.data)) throw new Error('Zotero 返回的文献库数据格式异常。');
      if (version && r.version !== version) throw new Error('刷新期间 Zotero 文献库发生了变化，请重新刷新。');
      version = r.version;
      items.push(...r.data.map(zoteroPaper).filter(Boolean));
      if (r.data.length < 100 || (r.total && start + 100 >= r.total)) return { items, version, web_links_version: 1, checked_at: new Date().toISOString(), error: '', user_id: this.settings.user_id };
    }
    throw new Error('该文献库超过本版支持的上限（100,000 条文献）。');
  }
  async add(paper, itemKey) {
    const { data: template } = await this.request('/items/new?itemType=journalArticle');
    const creators = clean(paper.authors).split(/[,;，；]/).map(x => x.trim()).filter(x => x && !/…|\.\.\.|\bet al\b/.test(x)).map(name => ({ creatorType: 'author', name }));
    // Store exactly the available metadata; never invent journal or full author names.
    // With a locally assigned key, version 0 creates only if the item does not exist.
    // Retrying keeps the same key; an existing item must never be overwritten.
    const item = { ...template, key: itemKey, version: 0, itemType: 'journalArticle', title: paper.title, creators, date: paper.year, DOI: paper.doi, url: paper.primary_url, libraryCatalog: 'Google Scholar', extra: '由 ScholarTrail 保存的基础文献记录。请校对文献类型及 Google Scholar 中可能不完整的信息。' };
    const r = await this.request(`/users/${this.settings.user_id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([item]) });
    const saved = r.data.successful?.['0'];
    if (!saved?.key) throw saveError(r.data.failed?.['0']?.code);
    return zoteroPaper(saved);
  }
  async existing(key, paper) {
    try {
      const r = await this.request(`/users/${this.settings.user_id}/items/${key}`);
      const p = zoteroPaper(r.data);
      // This is a key reserved locally before our own write, not a heuristic lookup.
      return p && (findMatch([p], paper) || (p.normalized_title === paper.normalized_title && p.primary_url && p.primary_url === paper.primary_url)) ? p : null;
    } catch (e) { if (e.message.includes('未找到')) return null; throw e; }
  }
}
export function itemKey() {
  const chars = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
  return [...crypto.getRandomValues(new Uint8Array(8))].map(x => chars[x % chars.length]).join('');
}
