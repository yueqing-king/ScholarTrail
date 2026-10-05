export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const clean = (s, max = 2000) => String(s ?? '').trim().slice(0, max);
export function errorMessage(error) {
  const message = clean(error?.message || error, 500);
  if (/\p{Script=Han}/u.test(message)) return message;
  if (/illegal invocation|incompatible receiver|invalid this/i.test(message)) return '插件请求调用异常，请更新插件后重试。';
  if (/fetch|network|offline/i.test(message)) return '网络连接失败，请检查网络后重试。';
  if (/timeout|timed out|aborted/i.test(message)) return '请求超时，请稍后重试。';
  if (/permission|access|forbidden/i.test(message)) return '访问未获授权，请检查连接权限。';
  return '操作未完成，请重试；如果问题持续出现，请重新加载插件。';
}
export const normalize = s => clean(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function doiOf(s) {
  let text = clean(s);
  try { text = decodeURIComponent(text); } catch {}
  return (text.match(/10\.\d{4,9}\/[^\s<>"?#]+/i)?.[0] || '').replace(/[.,;]+$/, '').toLowerCase();
}
export function safeURL(s) {
  try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function authorKey(s) {
  const first = clean(s).split(/[,;，；]|\band\b|&/)[0].replace(/…|\.\.\.|\bet al\.?/g, '').trim();
  const parts = normalize(first).split(' ').filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0][0]}:${parts.at(-1)}` : parts[0];
}
export function paperData(input) {
  const title = clean(input?.title, 1500).replace(/^\[(PDF|HTML|BOOK|CITATION|图书|引用)\]\s*/i, '');
  if (!title) throw new Error('未能提取这条结果的论文标题。');
  const url = safeURL(input.primary_url || input.url);
  const year = clean(input.year).match(/\b(?:18|19|20|21)\d{2}\b/)?.[0] || '';
  const ids = Array.isArray(input.external_ids) ? input.external_ids.filter(x => typeof x === 'string' && /^(scholar|arxiv|pmid):[\w:.-]+$/.test(x)).slice(0, 12) : [];
  const arxiv = url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+?)(?:\.pdf)?$/i)?.[1]?.replace(/v\d+$/, '');
  if (arxiv) ids.push(`arxiv:${arxiv}`);
  return { title, normalized_title: normalize(title), authors: clean(input.authors, 1500), year, doi: doiOf(input.doi) || doiOf(url), primary_url: url, scholar_url: safeURL(input.scholar_url), external_ids: [...new Set(ids)], scholar_metadata: clean(input.scholar_metadata, 2000) };
}
export function matchScore(a, b) {
  // Conflicting strong identifiers must never inherit a project decision.
  if (a.doi && b.doi && a.doi !== b.doi) return 0;
  if (a.doi && a.doi === b.doi) return 100;
  if ((a.external_ids || []).some(id => (b.external_ids || []).includes(id))) return 90;
  const title = a.normalized_title || normalize(a.title);
  if (!title || title !== (b.normalized_title || normalize(b.title))) return 0;
  if (a.year && b.year && a.year !== b.year) return 0;
  const aa = authorKey(a.authors), ba = authorKey(b.authors);
  if (aa && ba && aa !== ba) return 0;
  // Title alone, and a shared publisher URL, are deliberately insufficient.
  if (title.length >= 12 && a.year && a.year === b.year && aa.length >= 2 && aa === ba) return 70;
  return 0;
}
export function findMatch(items, candidate) {
  let best = null, score = 0, ambiguous = false;
  for (const item of items) {
    const n = matchScore(item, candidate);
    if (n > score) { best = item; score = n; ambiguous = false; }
    else if (n && n === score) ambiguous = true;
  }
  return ambiguous ? null : best;
}
export const blankDB = () => ({ version: 1, active_project_id: null, projects: [], papers: [], project_papers: [], encounters: [], tags: [] });
export const TAG_COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'pink', 'gray'];
const tagKey = name => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const projectTags = (db, projectId) => (db.tags || []).filter(t => t.project_id === projectId);
export function projectById(db, id, editable = false) {
  const p = db.projects.find(p => p.id === id);
  if (!p) throw new Error('请先选择一个研究项目。');
  if (editable && p.archived_at) throw new Error('请先恢复已归档的项目，再进行编辑。');
  return p;
}
export function createProject(db, name) {
  name = clean(name, 100);
  if (!name) throw new Error('请填写项目名称。');
  if (db.projects.some(p => normalize(p.name) === normalize(name))) throw new Error('已存在同名项目，请换个名称。');
  const p = { id: uid(), name, created_at: now(), updated_at: now(), archived_at: null };
  db.projects.push(p); db.active_project_id = p.id; return p;
}
export function changeProject(db, action, id, name) {
  const p = projectById(db, id);
  if (action === 'switch') { projectById(db, id, true); db.active_project_id = id; }
  else if (action === 'rename') {
    name = clean(name, 100);
    if (!name) throw new Error('请填写项目名称。');
    if (db.projects.some(x => x.id !== id && normalize(x.name) === normalize(name))) throw new Error('已存在同名项目，请换个名称。');
    p.name = name;
  } else if (action === 'archive') p.archived_at = now();
  else if (action === 'restore') { p.archived_at = null; if (!db.active_project_id) db.active_project_id = id; }
  else if (action === 'delete') {
    db.projects = db.projects.filter(x => x.id !== id);
    db.project_papers = db.project_papers.filter(x => x.project_id !== id);
    db.encounters = db.encounters.filter(x => x.project_id !== id);
    db.tags = (db.tags || []).filter(x => x.project_id !== id);
    const used = new Set(db.project_papers.map(x => x.paper_id));
    db.papers = db.papers.filter(x => used.has(x.id));
  } else throw new Error('无法识别该项目操作。');
  p.updated_at = now();
  if (!db.projects.some(x => x.id === db.active_project_id && !x.archived_at)) db.active_project_id = db.projects.find(x => !x.archived_at)?.id || null;
}
function ensurePaperRecord(db, input, projectId) {
  projectById(db, projectId, true);
  const data = paperData(input), time = now();
  let paper = findMatch(db.papers, data);
  if (!paper) { paper = { ...data, id: uid(), created_at: time, updated_at: time }; db.papers.push(paper); }
  else {
    for (const key of ['doi', 'authors', 'year', 'primary_url', 'scholar_url', 'scholar_metadata']) if (!paper[key] && data[key]) paper[key] = data[key];
    paper.external_ids = [...new Set([...(paper.external_ids || []), ...data.external_ids])]; paper.updated_at = time;
  }
  let pp = db.project_papers.find(x => x.project_id === projectId && x.paper_id === paper.id);
  if (!pp) {
    pp = { id: uid(), project_id: projectId, paper_id: paper.id, first_clicked_at: null, last_clicked_at: null, note: '', tag_ids: [], not_relevant: false, not_relevant_at: null, created_at: time, updated_at: time };
    db.project_papers.push(pp);
  }
  return { paper, record: pp };
}
export function recordClick(db, input, projectId, context = {}) {
  const { paper, record: pp } = ensurePaperRecord(db, input, projectId), time = now();
  pp.first_clicked_at ||= time; pp.last_clicked_at = time; pp.updated_at = time;
  db.encounters.push({ id: uid(), project_id: projectId, paper_id: paper.id, source: 'google_scholar', search_query: clean(context.search_query, 1000), source_url: safeURL(context.source_url), clicked_at: time });
  return { paper, record: pp };
}
export function setPaperTag(db, projectId, input) {
  projectById(db, projectId, true);
  const catalog = projectTags(db, projectId), selected = input.selected !== false;
  let tag;
  if (input.tag_id) {
    tag = catalog.find(t => t.id === input.tag_id);
    if (!tag) throw new Error('这个标签不属于当前项目，请重新选择。');
  } else {
    const name = clean(input.name).replace(/\s+/g, ' ');
    if (!name || [...name].length > 40) throw new Error('标签名称请填写 1–40 个字。');
    if (!selected) throw new Error('请选择要移除的标签。');
    tag = catalog.find(t => tagKey(t.name) === tagKey(name));
    if (!tag) {
      const color = input.color || 'blue';
      if (!TAG_COLORS.includes(color)) throw new Error('请选择提供的标签颜色。');
      tag = { id: uid(), project_id: projectId, name, color, created_at: now() };
    }
  }
  let record = db.project_papers.find(r => r.project_id === projectId && r.paper_id === input.paper_id);
  if (!record) {
    if (input.paper_id) throw new Error('当前项目中没有这篇论文的记录，请刷新页面。');
    if (!selected || !input.paper) throw new Error('未找到要标记的论文。');
    record = ensurePaperRecord(db, input.paper, projectId).record;
  }
  db.tags ||= [];
  if (!db.tags.some(t => t.id === tag.id)) db.tags.push(tag);
  const ids = new Set(record.tag_ids || []);
  if (selected) ids.add(tag.id); else ids.delete(tag.id);
  record.tag_ids = [...ids]; record.updated_at = now();
  return { paper_id: record.paper_id, record, tags: projectTags(db, projectId) };
}
export function editRecord(db, projectId, paperId, patch) {
  projectById(db, projectId, true);
  const pp = db.project_papers.find(x => x.project_id === projectId && x.paper_id === paperId);
  if (!pp) throw new Error('请先从 Google Scholar 点开这篇论文，建立记录。');
  if ('note' in patch) pp.note = clean(patch.note, 20000);
  if ('not_relevant' in patch) { pp.not_relevant = patch.not_relevant === true; pp.not_relevant_at = pp.not_relevant ? now() : null; }
  pp.updated_at = now(); return pp;
}
export function zoteroWebURL(value, key) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || !['www.zotero.org', 'zotero.org'].includes(url.host) || url.username || url.password) return '';
    if (parts.length !== 3 || parts[1] !== 'items' || parts[2] !== key) return '';
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return ''; }
}
export function zoteroPaper(item) {
  const d = item.data || {};
  if (['attachment', 'note', 'annotation'].includes(d.itemType) || !d.title || d.deleted) return null;
  const authors = (d.creators || []).filter(c => c.creatorType === 'author').map(c => c.name || [c.firstName, c.lastName].filter(Boolean).join(' ')).join(', ');
  const p = paperData({ title: d.title, authors, year: d.date, doi: d.DOI, url: d.url });
  const key = item.key || d.key;
  return { ...p, key, version: item.version, item_type: d.itemType, web_url: zoteroWebURL(item.links?.alternate?.href, key) };
}
