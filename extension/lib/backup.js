import { blankDB, normalize, paperData, safeURL, findMatch, TAG_COLORS, uid, now } from './core.js';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const fields = ['projects', 'papers', 'project_papers', 'encounters', 'tags'];
const fail = message => { throw new Error(`备份无法导入：${message}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function string(value, label, max, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) fail(`${label}格式不正确。`);
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) fail('记录标识格式不正确。');
  return value;
}
function date(value, label, optional = false) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'string' || value.length > 50 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label}格式不正确。`);
  return value;
}
function array(value, label, optional = false) {
  if (optional && value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100000 || value.some(v => !object(v))) fail(`${label}格式不正确或记录过多。`);
  const ids = new Set();
  for (const row of value) { const key = id(row.id); if (ids.has(key)) fail(`${label}包含重复记录标识。`); ids.add(key); }
  return value;
}
export function createBackup(db) {
  return { app: 'ScholarTrail', backup_version: 1, exported_at: now(), version: 1, active_project_id: db.active_project_id || null, ...Object.fromEntries(fields.map(key => [key, structuredClone(db[key] || [])])) };
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) fail('文件超过 20 MB，请使用较小的备份文件。');
  let input;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { fail('不是有效的 JSON 文件，请选择 ScholarTrail 导出的备份。'); }
  if (!object(input) || input.app !== 'ScholarTrail') fail('请选择 ScholarTrail 导出的 JSON 备份。');
  if (input.version !== 1 || (input.backup_version !== undefined && input.backup_version !== 1)) fail('这个备份版本暂不支持，请先更新插件。');
  const db = blankDB(); let removed_links = 0;
  const url = value => { const raw = string(value, '链接', 10000, ''); const safe = safeURL(raw); if (raw && !safe) removed_links++; return safe; };
  db.projects = array(input.projects, '项目').map(p => {
    const name = string(p.name, '项目名称', 100);
    if (!name.trim()) fail('项目名称不能为空。');
    return { id: id(p.id), name, created_at: date(p.created_at, '创建时间'), updated_at: date(p.updated_at, '更新时间'), archived_at: date(p.archived_at, '归档时间', true) };
  });
  db.papers = array(input.papers, '论文').map(p => {
    const external_ids = p.external_ids === undefined ? [] : p.external_ids;
    if (!Array.isArray(external_ids) || external_ids.length > 256 || external_ids.some(v => typeof v !== 'string' || v.length > 256 || !/^(scholar|arxiv|pmid):[\w:.-]+$/.test(v))) fail('论文标识格式不正确。');
    const data = paperData({ title: string(p.title, '论文标题', 1500), authors: string(p.authors, '作者', 1500, ''), year: string(p.year, '年份', 4, ''), doi: string(p.doi, 'DOI', 2000, ''), primary_url: url(p.primary_url), scholar_url: url(p.scholar_url), scholar_metadata: string(p.scholar_metadata, '论文信息', 2000, ''), external_ids });
    return { ...data, external_ids: [...new Set(external_ids)], id: id(p.id), created_at: date(p.created_at, '论文创建时间'), updated_at: date(p.updated_at, '论文更新时间') };
  });
  db.tags = array(input.tags, '标签', true).map(t => {
    const name = string(t.name, '标签名称', 160);
    if (!name.trim() || [...name].length > 40 || !TAG_COLORS.includes(t.color)) fail('标签名称或颜色格式不正确。');
    return { id: id(t.id), project_id: id(t.project_id), name, color: t.color, created_at: date(t.created_at, '标签创建时间') };
  });
  db.project_papers = array(input.project_papers, '项目论文记录').map(r => {
    if (typeof r.not_relevant !== 'boolean') fail('论文判断格式不正确。');
    const tag_ids = r.tag_ids === undefined ? [] : r.tag_ids;
    if (!Array.isArray(tag_ids) || tag_ids.length > 100000) fail('论文标签格式不正确。');
    return { id: id(r.id), project_id: id(r.project_id), paper_id: id(r.paper_id), first_clicked_at: date(r.first_clicked_at, '首次点击时间', true), last_clicked_at: date(r.last_clicked_at, '最近点击时间', true), note: string(r.note, '笔记', 20000, ''), tag_ids: [...new Set(tag_ids.map(id))], not_relevant: r.not_relevant, not_relevant_at: date(r.not_relevant_at, '排除时间', true), created_at: date(r.created_at, '记录创建时间'), updated_at: date(r.updated_at, '记录更新时间') };
  });
  db.encounters = array(input.encounters, '点击历史').map(e => ({ id: id(e.id), project_id: id(e.project_id), paper_id: id(e.paper_id), source: string(e.source, '来源', 100, 'google_scholar'), search_query: string(e.search_query, '检索词', 1000, ''), source_url: url(e.source_url), clicked_at: date(e.clicked_at, '点击时间') }));
  const projects = new Map(db.projects.map(p => [p.id, p])), papers = new Set(db.papers.map(p => p.id)), tags = new Map(db.tags.map(t => [t.id, t])), pairs = new Set();
  for (const t of db.tags) if (!projects.has(t.project_id)) fail('标签引用了不存在的项目。');
  for (const r of db.project_papers) {
    if (!projects.has(r.project_id) || !papers.has(r.paper_id)) fail('论文记录引用了不存在的项目或论文。');
    const pair = `${r.project_id}/${r.paper_id}`;
    if (pairs.has(pair)) fail('同一项目包含重复的论文记录。'); pairs.add(pair);
    if (r.tag_ids.some(key => tags.get(key)?.project_id !== r.project_id)) fail('论文标签不属于对应项目。');
    if (!!r.first_clicked_at !== !!r.last_clicked_at || (r.first_clicked_at && Date.parse(r.first_clicked_at) > Date.parse(r.last_clicked_at))) fail('论文点击时间不一致。');
  }
  for (const e of db.encounters) if (!pairs.has(`${e.project_id}/${e.paper_id}`)) fail('点击历史引用了不存在的论文记录。');
  if (input.active_project_id !== null && input.active_project_id !== undefined && !projects.has(id(input.active_project_id))) fail('当前项目引用不正确。');
  db.active_project_id = projects.get(input.active_project_id)?.archived_at ? null : input.active_project_id || null;
  return { db, removed_links, exported_at: date(input.exported_at, '导出时间', true) };
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function groups(db) {
  const group = rows => { const result = new Map(); for (const row of rows || []) { if (!result.has(row.project_id)) result.set(row.project_id, []); result.get(row.project_id).push(row); } return result; };
  return { records: group(db.project_papers), tags: group(db.tags), encounters: group(db.encounters), papers: new Map(db.papers.map(p => [p.id, p])) };
}
function snapshot(p, grouped) {
  const { import_fingerprint, ...project } = p;
  const records = grouped.records.get(p.id) || [];
  const sort = rows => [...rows].sort((a,b) => a.id.localeCompare(b.id));
  return { project, records: sort(records), tags: sort(grouped.tags.get(p.id) || []), encounters: sort(grouped.encounters.get(p.id) || []), papers: sort([...new Set(records.map(r => r.paper_id))].map(key => grouped.papers.get(key))) };
}
export async function planImport(current, text) {
  const parsed = parseBackup(text), incoming = parsed.db, db = structuredClone(current), sourceGroups = groups(incoming), currentGroups = groups(db);
  db.tags ||= [];
  const stats = { projects: 0, papers: 0, records: 0, notes: 0, tags: 0, encounters: 0, skipped_projects: 0, renamed_projects: 0, removed_links: parsed.removed_links, exported_at: parsed.exported_at };
  const currentProjects = new Map(db.projects.map(p => [p.id,p])), fingerprints = new Set(db.projects.map(p => p.import_fingerprint).filter(Boolean));
  const names = new Set(db.projects.map(p => normalize(p.name))), added = [], projectMap = new Map();
  const projectIDs = new Set(db.projects.map(p => p.id)), paperIDs = new Set(db.papers.map(p => p.id)), tagIDs = new Set(db.tags.map(t => t.id)), recordIDs = new Set(db.project_papers.map(r => r.id)), encounterIDs = new Set(db.encounters.map(e => e.id));
  const nextID = (key, used) => { const result = used.has(key) ? uid() : key; used.add(result); return result; };
  for (const project of incoming.projects) {
    const fingerprint = await digest(snapshot(project, sourceGroups)), existing = currentProjects.get(project.id);
    if (fingerprints.has(fingerprint) || (existing && await digest(snapshot(existing, currentGroups)) === fingerprint)) { stats.skipped_projects++; continue; }
    let name = project.name;
    if (names.has(normalize(name))) {
      let count = 1;
      do { const suffix = count === 1 ? '（导入）' : `（导入 ${count}）`; name = project.name.slice(0, 100 - suffix.length) + suffix; count++; } while (names.has(normalize(name)));
      stats.renamed_projects++;
    }
    names.add(normalize(name));
    const imported = { ...project, id: nextID(project.id, projectIDs), name, import_fingerprint: fingerprint };
    db.projects.push(imported); added.push(project); projectMap.set(project.id, imported.id); stats.projects++;
  }
  const usedPapers = new Set(added.flatMap(p => (sourceGroups.records.get(p.id) || []).map(r => r.paper_id)));
  // Empty installations recover the complete backup, including any unattached metadata.
  if (!current.projects.length && !current.papers.length) for (const p of incoming.papers) usedPapers.add(p.id);
  const paperMap = new Map(), currentPapers = new Map(db.papers.map(p => [p.id,p])), usedTargets = new Set();
  for (const paper of incoming.papers) {
    if (!usedPapers.has(paper.id)) continue;
    const same = currentPapers.get(paper.id);
    const identity = p => ({ title: p.normalized_title || normalize(p.title), authors: p.authors, year: p.year, doi: p.doi, primary_url: p.primary_url, external_ids: p.external_ids || [] });
    let matched = same && canonical(identity(same)) === canonical(identity(paper)) ? same : findMatch(current.papers, paper);
    if (matched && usedTargets.has(matched.id)) matched = null;
    if (!matched) { matched = { ...paper, id: nextID(paper.id, paperIDs) }; db.papers.push(matched); stats.papers++; }
    paperMap.set(paper.id, matched.id); usedTargets.add(matched.id);
  }
  const tagMap = new Map();
  for (const tag of incoming.tags) {
    if (!projectMap.has(tag.project_id)) continue;
    const imported = { ...tag, id: nextID(tag.id, tagIDs), project_id: projectMap.get(tag.project_id) };
    db.tags.push(imported); tagMap.set(tag.id, imported.id); stats.tags++;
  }
  for (const record of incoming.project_papers) {
    if (!projectMap.has(record.project_id)) continue;
    db.project_papers.push({ ...record, id: nextID(record.id, recordIDs), project_id: projectMap.get(record.project_id), paper_id: paperMap.get(record.paper_id), tag_ids: record.tag_ids.map(key => tagMap.get(key)) });
    stats.records++; if (record.note) stats.notes++;
  }
  for (const encounter of incoming.encounters) {
    if (!projectMap.has(encounter.project_id)) continue;
    db.encounters.push({ ...encounter, id: nextID(encounter.id, encounterIDs), project_id: projectMap.get(encounter.project_id), paper_id: paperMap.get(encounter.paper_id) }); stats.encounters++;
  }
  if (!db.projects.some(p => p.id === db.active_project_id && !p.archived_at)) {
    const restored = projectMap.get(incoming.active_project_id);
    db.active_project_id = db.projects.find(p => p.id === restored && !p.archived_at)?.id || db.projects.find(p => !p.archived_at)?.id || null;
  }
  return { db, stats, revision: await digest(current) };
}
