// Combine criteria with AND; tagging a paper never implies it was opened or saved.
export function tagsForRecord(record, tags = []) {
  const selected = new Set(record.tag_ids || []);
  return tags.filter(tag => tag.project_id === record.project_id && selected.has(tag.id));
}
export function filterPaperRows(rows, { record = 'all', zotero = 'all', tag = 'all', query = '', sort = 'recent', tags = [] } = {}) {
  const term = query.normalize('NFKC').toLocaleLowerCase().trim();
  const result = rows.filter(row => {
    if (record === 'clicked' && !row.last_clicked_at) return false;
    if (record === 'note' && !row.note) return false;
    if (record === 'excluded' && !row.not_relevant) return false;
    if (zotero === 'saved' && !row.zotero) return false;
    if (zotero === 'unmatched' && row.zotero) return false;
    const selectedTags = tagsForRecord(row, tags);
    if (tag === 'tagged' && !selectedTags.length) return false;
    if (tag === 'untagged' && selectedTags.length) return false;
    if (tag.startsWith('tag:') && !selectedTags.some(t => t.id === tag.slice(4))) return false;
    const text = [row.paper.title, row.paper.authors, row.note, ...selectedTags.map(t => t.name)].filter(Boolean).join(' ');
    return !term || text.normalize('NFKC').toLocaleLowerCase().includes(term);
  });
  return result.sort((a, b) => {
    if (sort === 'title') return a.paper.title.localeCompare(b.paper.title, 'zh-CN');
    const left = a.last_clicked_at || a.created_at || '', right = b.last_clicked_at || b.created_at || '';
    return sort === 'oldest' ? left.localeCompare(right) : right.localeCompare(left);
  });
}
