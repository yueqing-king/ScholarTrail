import { $, $$, esc, ask, date, fullDate, toast, busy } from './lib/ui.js';
import { filterPaperRows, tagsForRecord } from './lib/filters.js';
import { bindBackupUI } from './lib/backup-ui.js';
let state, filter = 'all', zoteroFilter = 'all', tagFilter = 'all', query = '', sort = 'recent', dialogAction = 'create', dialogProject = null, detail = null, detailProject = null, detailNote = '', drawerFocus = null, page = '', refreshTimer, renderedProject = null;
const Tags = globalThis.ScholarTrailTags;
Tags.installStyles(document);
const projectTagList = id => (state.tags || []).filter(t => t.project_id === id);
const recordTags = r => tagsForRecord(r, projectTagList(r.project_id));
function resetFilters() { filter = 'all'; zoteroFilter = 'all'; tagFilter = 'all'; query = ''; }
function clearLibraryFilters() { resetFilters(); if ($('#search')) $('#search').value = ''; renderList(); }
function renderTagField(container, record) {
  if (!container) return;
  Tags.renderChips(container, projectTagList(record.project_id), record.tag_ids);
  const button = document.createElement('button'); button.type = 'button'; button.className = 'st-tag-editor';
  button.textContent = record.tag_ids?.length ? '+ 编辑标签' : '+ 添加标签';
  button.addEventListener('click', () => Tags.open({
    projectId: record.project_id, paperId: record.paper_id,
    projectName: state.projects.find(p => p.id === record.project_id)?.name || '',
    tags: projectTagList(record.project_id), selectedIds: record.tag_ids || [],
    commit: change => ask('SET_PAPER_TAG', { ...change, project_id: record.project_id, paper_id: record.paper_id }),
    onChange: () => refresh()
  }));
  container.append(button);
}
const active = () => state.projects.find(p => p.id === state.active_project_id);
const projectRows = id => state.project_papers.filter(p => p.project_id === id).map(r => ({ ...r, paper: state.papers.find(p => p.id === r.paper_id), zotero: state.zotero_links[r.paper_id] }));
const tagHTML = r => ` ${r.last_clicked_at ? '<span class="tag">✓ 已点击</span>' : ''}${r.zotero ? `<span class="tag zotero" title="上次检查：${esc(fullDate(r.zotero.checked_at))}">↗ 已存入 Zotero${r.zotero.stale ? ' · 缓存' : ''}</span>` : ''}${r.note ? '<span class="tag note">▤ 笔记</span>' : ''}${r.not_relevant ? '<span class="tag excluded">× 不相关</span>' : ''}`;
function sidebar() {
  $('#projects').innerHTML = state.projects.filter(p => !p.archived_at).map(p => `<button class="project-link ${p.id === state.active_project_id && !['settings','archive'].includes(page) ? 'active' : ''}" data-project="${p.id}" title="${esc(p.name)}"><i class="project-dot"></i><span class="name">${esc(p.name)}</span><span class="project-count">${projectRows(p.id).length}</span></button>`).join('') || '<p class="muted" style="padding:12px;font-size:11px">从这里开启你的研究。</p>';
  $('#archive-count').textContent = state.projects.filter(p => p.archived_at).length || '';
  $('#settings-nav').classList.toggle('active', page === 'settings'); $('#archive-nav').classList.toggle('active', page === 'archive');
  $('#breadcrumb').innerHTML = `工作区 <span>/</span> ${esc(page === 'settings' ? '设置与连接' : page === 'archive' ? '已归档项目' : active()?.name || '欢迎')}`;
}
async function refresh(full = false) {
  state = await ask('GET_STATE');
  Tags.syncProject(state.active_project_id);
  if (detail) {
    const record = state.project_papers.find(r => r.project_id === detailProject && r.paper_id === detail);
    if (record) {
      $('#drawer .paper-status').innerHTML = tagHTML({ ...record, zotero: state.zotero_links[detail] });
      $('#detail-exclude').textContent = record.not_relevant ? '↶ 撤销排除' : '× 不相关';
      renderTagField($('#detail-tags'), record);
      Tags.update(record.project_id, record.paper_id, projectTagList(record.project_id), record.tag_ids);
    }
  }
  sidebar();
  if (page === 'settings' && !full) { renderConnection(); return; }
  if (page === 'library' && $('#paper-list') && active() && renderedProject === active().id && !full) { $('#main .page-heading h1').textContent = active().name; renderList(); return; }
  renderPage();
}
function renderPage() {
  if (page === 'settings') renderSettings();
  else if (page === 'archive') renderArchive();
  else if (!active()) renderOnboarding();
  else renderLibrary();
  sidebar();
}
function renderOnboarding() {
  page = 'library';
  $('#main').innerHTML = `<section class="onboarding"><span class="eyebrow">为文献检索保留研究记忆</span><h1>接着上次的线索，<br>继续你的研究。</h1><p class="muted">点开过的论文、当时的想法、排除过的方向。再次遇到时，让这些线索回到眼前。</p><div class="onboarding-box"><h3>创建你的第一个研究项目</h3><p class="muted" style="font-size:12px;margin-top:8px">用一个项目，收好一个研究主题的线索。</p><form id="welcome-form"><input aria-label="项目名称" name="name" required maxlength="100" placeholder="例如：文献综述"><button class="button primary">创建项目 <span>→</span></button></form><button type="button" id="welcome-import" class="text-button" style="margin-top:16px">已有备份？导入研究数据</button></div><div class="steps"><div><div class="step-number">01</div><h3>照常检索文献</h3><p>在 Google Scholar 点开论文，插件就会记住这次点击。</p></div><div><div class="step-number">02</div><h3>记下当时的想法</h3><p>写一条笔记，或把论文标记为与当前项目不相关。</p></div><div><div class="step-number">03</div><h3>下次遇到，接着研究</h3><p>再次看到同一篇论文时，找回之前的笔记和判断。</p></div></div></section>`;
  bindBackupUI(refresh, state);
  $('#welcome-form').addEventListener('submit', e => { e.preventDefault(); busy(e.submitter, async () => { await ask('CREATE_PROJECT', { name: new FormData(e.target).get('name') }); await refresh(true); toast('项目已创建，可以开始检索了。'); }); });
}
function renderLibrary() {
  page = 'library'; const p = active();
  if (renderedProject && renderedProject !== p.id) resetFilters();
  renderedProject = p.id;
  $('#main').innerHTML = `<div class="page-heading"><div><span class="eyebrow">研究足迹</span><h1>${esc(p.name)}</h1><p>再次遇到一篇论文，找回上次留下的线索。</p></div><div class="heading-actions"><div class="menu-wrap"><button class="button small" id="project-menu" aria-label="项目操作" aria-expanded="false">•••</button><div class="menu" id="project-options" hidden><button data-manage="rename">重命名项目</button><button data-manage="archive">归档项目</button><button data-manage="delete" class="danger-text">删除项目</button></div></div></div></div><div class="tools-row"><div class="search-wrap"><span aria-hidden="true">⌕</span><input type="search" id="search" aria-label="搜索论文" placeholder="搜索标题、作者、笔记或标签…" value="${esc(query)}"></div><div class="library-controls"><label class="library-control"><span>Zotero 入库状态</span><select id="zotero-filter" aria-label="Zotero 入库状态"><option value="all">不限入库状态</option><option value="saved">已存入 Zotero</option><option value="unmatched">未匹配到入库记录</option></select></label><label class="library-control tag-filter-control"><span>论文标签</span><select id="tag-filter" aria-label="按具体标签筛选"></select></label><label class="library-control sort-control"><span>排序</span><select id="sort" class="sort-select" aria-label="论文排序"><option value="recent">最近点击优先</option><option value="oldest">最早点击优先</option><option value="title">按标题排序</option></select></label></div></div><p class="filter-help" id="filter-help" hidden></p><nav class="filter-row" aria-label="筛选论文" id="filters"></nav><div class="list-label"><span>记录过的论文</span><span id="result-count" role="status" aria-live="polite"></span></div><div id="paper-list"></div>`;
  $('#search').addEventListener('input', e => { query = e.target.value; renderList(); });
  $('#zotero-filter').addEventListener('change', e => { zoteroFilter = e.target.value; renderList(); });
  $('#tag-filter').addEventListener('change', e => { tagFilter = e.target.value; renderList(); });
  $('#sort').value = sort; $('#sort').addEventListener('change', e => { sort = e.target.value; renderList(); });
  $('#project-menu').addEventListener('click', () => { $('#project-options').hidden = !$('#project-options').hidden; $('#project-menu').setAttribute('aria-expanded', String(!$('#project-options').hidden)); });
  renderList();
}
function renderList() {
  const rows = projectRows(state.active_project_id);
  const catalog = projectTagList(state.active_project_id);
  const available = !!state.zotero_status.connected && !!state.zotero_status.checked_at;
  if (!available) zoteroFilter = 'all';
  if (tagFilter.startsWith('tag:') && !catalog.some(t => t.id === tagFilter.slice(4))) tagFilter = 'all';
  $('#zotero-filter').disabled = !available; $('#zotero-filter').value = zoteroFilter;
  const tagOptions = '<option value="all">全部标签</option><option value="tagged">有标签（不限内容）</option><option value="untagged">无标签</option>' + catalog.slice().sort((a,b) => a.name.localeCompare(b.name, 'zh-CN')).map(t => `<option value="tag:${esc(t.id)}">${esc(t.name)}（${rows.filter(r => recordTags(r).some(x => x.id === t.id)).length}）</option>`).join('');
  const selector = $('#tag-filter');
  if (selector.dataset.options !== tagOptions) { selector.innerHTML = tagOptions; selector.dataset.options = tagOptions; }
  selector.value = tagFilter;
  const hint = $('#filter-help');
  hint.textContent = !available ? '连接 Zotero 并完成文献库刷新后，可按入库状态筛选。' : zoteroFilter === 'unmatched' ? '“未匹配到”依据最近一次文献库检查；桌面端尚未同步或文献信息不一致时，也可能未匹配到。' : zoteroFilter !== 'all' && state.zotero_status.error ? '当前按上次成功刷新时的入库状态筛选。' : '';
  hint.hidden = !hint.textContent;
  const constrained = filter !== 'all' || zoteroFilter !== 'all' || tagFilter !== 'all' || !!query.trim();
  const filters = [
    ['all', '全部论文', () => true, !constrained],
    ['clicked', '已点击', r => !!r.last_clicked_at, filter === 'clicked'],
    ['zotero', '已存入 Zotero', r => !!r.zotero, zoteroFilter === 'saved'],
    ['note', '有笔记', r => !!r.note, filter === 'note'],
    ['tagged', '有标签', r => !!recordTags(r).length, tagFilter === 'tagged' || tagFilter.startsWith('tag:')],
    ['excluded', '不相关', r => r.not_relevant, filter === 'excluded']
  ];
  $('#filters').innerHTML = filters.map(([id, label, test, pressed]) => `<button class="filter ${pressed ? 'active' : ''}" aria-pressed="${pressed}" data-filter="${id}" ${id === 'zotero' && !available ? 'disabled title="请先连接并刷新 Zotero 文献库"' : ''}>${label}<span>${rows.filter(test).length}</span></button>`).join('') + (constrained ? '<button class="text-button clear-filters" data-clear-filters>清除筛选</button>' : '');
  const filtered = filterPaperRows(rows, { record: filter, zotero: zoteroFilter, tag: tagFilter, query, sort, tags: catalog });
  $('#result-count').textContent = `${filtered.length} 篇论文${filtered.length !== rows.length ? ` / 共 ${rows.length} 篇` : ''}`;
  if (!filtered.length) {
    $('#paper-list').innerHTML = rows.length ? '<div class="no-results"><h2>没有找到符合条件的论文</h2><p>换个关键词，或试试其他筛选条件。</p><button class="button" id="clear-filter">清除筛选</button></div>' : `<div class="no-results"><div class="empty-art">↗</div><h2>从点开第一篇论文开始</h2><p>在 Google Scholar 中点开一篇论文。<br>插件会记住这次点击、搜索词，以及发现它的时间。</p><a class="button primary" href="https://scholar.google.com/" target="_blank" rel="noopener noreferrer">开始检索 <span>↗</span></a></div>`;
    $('#clear-filter')?.addEventListener('click', clearLibraryFilters); return;
  }
  $('#paper-list').innerHTML = filtered.map(r => `<article class="paper-card ${r.not_relevant ? 'excluded' : ''}" data-paper="${r.paper_id}"><button class="paper-title" data-detail="${r.paper_id}">${esc(r.paper.title)}</button><p class="paper-meta">${esc(r.paper.authors || '作者信息暂缺')}${r.paper.year ? ` <span>·</span> ${esc(r.paper.year)}` : ''}</p><div class="paper-status">${tagHTML(r)}</div><div class="paper-tags" data-tags-for="${r.paper_id}"></div>${r.note ? `<p class="paper-note">${esc(r.note)}</p>` : ''}<div class="paper-bottom"><span>${r.last_clicked_at ? `最近点击：${date(r.last_clicked_at)}` : '尚未点击 · 已手动记录'}</span><div class="paper-actions"><button class="text-button" data-detail="${r.paper_id}" data-tab="note">${r.note ? '编辑笔记' : '+ 添加笔记'}</button><button class="text-button" data-exclude="${r.paper_id}">${r.not_relevant ? '↶ 撤销排除' : '× 不相关'}</button><button class="text-button" data-detail="${r.paper_id}" data-tab="history">历史 ↗</button></div></div></article>`).join('');
  for (const row of filtered) {
    renderTagField($(`[data-tags-for="${row.paper_id}"]`), row);
    Tags.update(row.project_id, row.paper_id, projectTagList(row.project_id), row.tag_ids);
  }
}
function renderSettings() {
  $('#main').innerHTML = `<div class="page-heading"><div><span class="eyebrow">让研究更顺手</span><h1>设置与连接</h1><p>照常研究，让每次探索都有迹可循。</p></div></div><div class="settings-grid"><section class="settings-card"><div class="section-title"><h2>连接 Zotero</h2><span class="tag zotero">Z</span></div><p>识别个人 Zotero 文献库中已有的论文，打开已保存的条目，也可以添加基础文献记录。</p><div id="connection-status"></div><form id="zotero-form"><div class="form-row"><label>用户 ID<input name="user_id" inputmode="numeric" pattern="[0-9]+" required placeholder="填写数字用户 ID" autocomplete="off"></label><label>API 密钥<input name="api_key" type="password" required minlength="16" autocomplete="off" placeholder="粘贴为本插件创建的 API 密钥"></label></div><p class="help">查找你的用户 ID，并<a class="inline-link" href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noopener noreferrer">创建 API 密钥 ↗</a>。请允许访问个人文献库；如需保存文献，还需启用写入权限。本版暂不支持群组库。</p><div class="settings-actions"><button class="button primary" type="submit" id="connect-zotero">连接文献库</button></div></form><p class="help">密钥保存在当前浏览器中，仅发送给 Zotero。浏览器运行期间每 15 分钟刷新一次；桌面端的变更需要先同步到在线文献库。</p></section><section class="settings-card"><h2>研究数据留在你的浏览器</h2><p>项目、点击记录、笔记、标签和判断都保存在当前浏览器中，无需 ScholarTrail 账号，不收集使用分析，也不上传云端。卸载插件会删除本地数据。</p><div class="settings-actions"><button class="button" id="export-data">↓ 导出研究数据</button><button class="button primary" id="import-data">↑ 导入研究数据</button></div><p class="help">备份和恢复项目、论文、笔记、标签及点击历史。支持旧版 ScholarTrail JSON 备份；先预览再确认，已有内容保留。Zotero API 密钥不随备份导出或导入。</p><button class="text-button" id="export-before-import">下载最近一次导入前的备份</button><p class="help">导入前会自动保留当前数据的一份备份，方便核对或另行保存。</p></section><section class="settings-card"><h3>为研究保留恰到好处的记忆</h3><p>“已点击”只代表打开过，不代表已阅读；“已存入 Zotero”只代表已保存，不代表相关。笔记、标签和排除判断属于各自的研究项目，撤销排除会保留全部历史。</p><p class="help">ScholarTrail V1.4 中文版 · Chrome / Edge · Google Scholar</p></section></div>`;
  renderConnection();
  $('#zotero-form').addEventListener('submit', e => {
    e.preventDefault(); const data = new FormData(e.target), btn = e.submitter;
    // Permission requests must originate directly in this user gesture.
    const permission = chrome.permissions.request({ origins: ['https://api.zotero.org/*'] });
    busy(btn, async () => { if (!await permission) throw new Error('尚未允许连接 Zotero。'); btn.textContent = '正在连接…'; const result = await ask('ZOTERO_CONNECT', { user_id: data.get('user_id'), api_key: data.get('api_key') }); e.target.reset(); await refresh(true); toast(`连接成功，已识别 ${result.count} 条文献。`); }).finally(() => { btn.textContent = '连接文献库'; });
  });
  bindBackupUI(refresh, state);
}
function renderConnection() {
  const z = state.zotero_status, container = $('#connection-status'); if (!container) return;
  container.innerHTML = z.connected ? `<div class="connection-info ${z.error ? 'warning' : ''}"><b>${z.error ? '刷新失败，请检查连接' : '● 文献库已连接'}</b><br>用户 ${esc(z.user_id)} · ${z.count} 条文献<br>上次检查：${esc(fullDate(z.checked_at))}${z.error ? `<br>${esc(z.error)}` : ''}<div class="settings-actions"><button class="button small" id="refresh-zotero">立即刷新</button><button class="text-button" id="disconnect-zotero">断开连接</button></div></div>` : '<div class="connection-info">尚未连接。你可以先使用本地点击记录、笔记和排除功能。</div>';
  $('#refresh-zotero')?.addEventListener('click', e => busy(e.currentTarget, async () => { e.target.textContent = '正在刷新…'; await ask('ZOTERO_SYNC'); await refresh(); toast('Zotero 状态已更新。'); }));
  $('#disconnect-zotero')?.addEventListener('click', e => busy(e.currentTarget, async () => { await ask('ZOTERO_DISCONNECT'); await refresh(); toast('已断开 Zotero，研究历史仍然保留。'); }));
}
function renderArchive() {
  const projects = state.projects.filter(p => p.archived_at);
  $('#main').innerHTML = `<div class="page-heading"><div><span class="eyebrow">暂时搁置，随时回来</span><h1>已归档项目</h1><p>笔记和历史都在。恢复项目，就能继续上次的研究。</p></div></div>${projects.length ? projects.map(p => `<article class="paper-card archive-card"><div><h3>${esc(p.name)}</h3><p>${projectRows(p.id).length} 篇论文 · 归档于 ${date(p.archived_at)}</p></div><div class="archive-actions"><button class="button small" data-restore="${p.id}">恢复项目</button><button class="text-button danger-text" data-delete="${p.id}">删除</button></div></article>`).join('') : '<div class="no-results"><h2>还没有归档的项目</h2><p>归档后的项目会显示在这里。</p></div>'}`;
}
function openProjectDialog(action, id) {
  dialogAction = action; dialogProject = id; const p = state.projects.find(p => p.id === id);
  $('#dialog-title').textContent = { create: '创建研究项目', rename: '给项目换个名字', archive: '归档这个项目？', delete: '删除这个项目？' }[action];
  $('#dialog-description').textContent = { create: '给项目起个名字。每次点击、笔记和判断都会保留在这个项目中。', rename: '项目中的论文、笔记和历史都会保留。', archive: `“${p?.name}”将移到归档列表，你可以随时恢复。`, delete: `这会永久删除“${p?.name}”及其中的笔记、点击历史，其他项目和 Zotero 条目不受影响。` }[action];
  const named = ['create','rename'].includes(action); $('#name-label').hidden = !named; $('#project-name').required = named; $('#project-name').value = action === 'rename' ? p.name : '';
  $('#submit-project').textContent = { create: '创建项目', rename: '保存名称', archive: '归档项目', delete: '永久删除' }[action]; $('#submit-project').classList.toggle('danger', action === 'delete'); $('#dialog-error').textContent = ''; $('#project-dialog').showModal();
  if (named) $('#project-name').focus(); else $('#cancel-dialog').focus();
}
$('#project-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try {
    if (dialogAction === 'create') await ask('CREATE_PROJECT', { name: $('#project-name').value });
    else await ask('PROJECT_ACTION', { action: dialogAction, project_id: dialogProject, name: $('#project-name').value });
    $('#project-dialog').close(); resetFilters(); if (dialogAction === 'create') { page = 'library'; history.replaceState(null, '', 'app.html'); } await refresh(true);
    toast({ create: '新项目已创建。', rename: '项目已重命名。', archive: '项目已归档，历史记录已保留。', delete: '项目已删除。' }[dialogAction]);
  } catch (err) { $('#dialog-error').textContent = err.message; } finally { button.disabled = false; }
});
$('#new-project').addEventListener('click', () => openProjectDialog('create'));
$('#close-dialog').addEventListener('click', () => $('#project-dialog').close()); $('#cancel-dialog').addEventListener('click', () => $('#project-dialog').close());

function closeDrawer(force = false) {
  if (!force && $('#detail-note') && $('#detail-note').value !== detailNote && !confirm('放弃这条笔记尚未保存的修改？')) return false;
  $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true; $('.workspace').inert = false; $('.sidebar').inert = false; detail = null; drawerFocus?.focus();
  if (location.hash.startsWith('#paper/')) history.replaceState(null, '', 'app.html'); return true;
}
async function openDetail(id, tab) {
  if (detail && !closeDrawer()) return;
  const p = state.papers.find(p => p.id === id), r = state.project_papers.find(r => r.project_id === state.active_project_id && r.paper_id === id);
  if (!p || !r) { toast('当前项目中没有这篇论文的记录。', true); return; }
  drawerFocus = document.activeElement; detail = id; detailProject = state.active_project_id; detailNote = r.note;
  const z = state.zotero_links[id];
  $('#drawer').innerHTML = `<div class="drawer-top"><span class="eyebrow">论文与研究线索</span><button class="icon-button" id="close-drawer" aria-label="关闭论文详情">×</button></div><h2>${esc(p.title)}</h2><p class="paper-meta">${esc(p.authors || '作者信息暂缺')} ${esc(p.year)}</p><div class="paper-status">${tagHTML({ ...r, zotero: z })}</div><div class="settings-actions">${p.primary_url ? `<a href="${esc(p.primary_url)}" target="_blank" rel="noopener noreferrer" class="button small">打开论文 ↗</a>` : ''}<button id="detail-exclude" class="button small">${r.not_relevant ? '↶ 撤销排除' : '× 不相关'}</button></div><section class="drawer-section"><div class="section-title"><h3>我的标签</h3></div><div id="detail-tags"></div><p class="hint">标签保留在当前项目中，可多选，也可复用已有标签。</p></section><section class="drawer-section"><div class="section-title"><h3>我的笔记</h3><span class="muted" style="font-size:10px">${esc(active().name)}</span></div><textarea id="detail-note" aria-label="论文笔记" maxlength="20000" placeholder="有什么想留给下次的自己？">${esc(r.note)}</textarea><div class="settings-actions"><button class="button primary small" id="save-note">保存笔记</button><button class="text-button" id="delete-note">删除笔记</button><span id="note-saved" class="muted" role="status"></span></div></section><section class="drawer-section"><div class="section-title"><h3>ZOTERO 文献库</h3></div>${z ? `<div class="settings-actions">${z.web_url ? `<a href="${esc(z.web_url)}" target="_blank" rel="noopener noreferrer" class="button small">在 Zotero 网页中打开 ↗</a>` : '<button class="button small" id="go-settings">刷新文献库以获取网页链接 ↗</button>'}<a href="${esc(z.desktop_url)}" class="button small">打开 Zotero 桌面端 ↗</a></div><p class="hint">上次确认：${esc(fullDate(z.checked_at))}${z.stale ? '。当前显示缓存状态，可前往设置刷新文献库。' : ''}</p>` : state.zotero_status.connected ? `<p class="hint">使用已有标题、作者、年份、网址和 DOI 保存一条基础期刊文献记录。保存后请在 Zotero 校对文献类型与信息；此操作不会下载 PDF。</p><button class="button small" id="save-zotero" style="margin-top:12px">+ 保存文献到 Zotero</button>` : '<p class="hint">连接个人文献库，即可识别和保存文献。</p><button class="text-button" id="go-settings">连接 Zotero ↗</button>'}</section><section class="drawer-section" id="history-section"><div class="section-title"><h3>当时是怎么找到的</h3><span class="muted" style="font-size:10px">首次打开：${date(r.first_clicked_at)}</span></div><div id="timeline" class="timeline">正在读取历史…</div></section>`;
  renderTagField($('#detail-tags'), r);
  $('#drawer').hidden = false; $('#drawer-backdrop').hidden = false; $('.workspace').inert = true; $('.sidebar').inert = true; $('#close-drawer').focus();
  $('#close-drawer').addEventListener('click', () => closeDrawer());
  $('#save-note').addEventListener('click', e => busy(e.currentTarget, async () => { const note = $('#detail-note').value; await ask('EDIT_RECORD', { project_id: detailProject, paper_id: id, patch: { note } }); detailNote = note.trim(); $('#detail-note').value = detailNote; $('#note-saved').textContent = '已保存'; await refresh(); }));
  $('#detail-note').addEventListener('input', () => { $('#note-saved').textContent = '修改尚未保存'; });
  $('#delete-note').addEventListener('click', e => busy(e.currentTarget, async () => { await ask('EDIT_RECORD', { project_id: detailProject, paper_id: id, patch: { note: '' } }); detailNote = ''; $('#detail-note').value = ''; $('#note-saved').textContent = '笔记已删除'; await refresh(); }));
  $('#detail-exclude').addEventListener('click', e => busy(e.currentTarget, async () => { const rec = state.project_papers.find(x => x.project_id === detailProject && x.paper_id === id); await ask('EDIT_RECORD', { project_id: detailProject, paper_id: id, patch: { not_relevant: !rec.not_relevant } }); await refresh(); e.target.textContent = rec.not_relevant ? '× 不相关' : '↶ 撤销排除'; }));
  $('#go-settings')?.addEventListener('click', () => { if (closeDrawer()) location.hash = '#settings'; });
  $('#save-zotero')?.addEventListener('click', e => busy(e.currentTarget, async () => { e.target.textContent = '正在保存…'; await ask('ZOTERO_ADD', { paper_id: id }); await refresh(); toast('文献已保存到 Zotero。'); const draft = $('#detail-note').value; detailNote = draft; closeDrawer(true); await openDetail(id); $('#detail-note').value = draft; }).finally(() => { if ($('#save-zotero')) $('#save-zotero').textContent = '+ 保存文献到 Zotero'; }));
  const expectedProject = detailProject;
  const encounters = await ask('GET_HISTORY', { project_id: expectedProject, paper_id: id });
  if (detail !== id || detailProject !== expectedProject) return;
  $('#timeline').innerHTML = encounters.map(e => `<div class="timeline-item"><time>${esc(fullDate(e.clicked_at))}</time><p>${e.search_query ? `“${esc(e.search_query)}”` : '从 Google Scholar 打开'}</p>${e.source_url ? `<a class="inline-link" href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer"><small>Google Scholar ↗</small></a>` : ''}</div>`).join('') || '<p class="hint">还没有点击历史。添加标签不会记作打开论文。</p>';
  if (tab === 'note') $('#detail-note').focus(); else if (tab === 'history') $('#history-section').scrollIntoView({ block: 'start' });
}
$('#drawer-backdrop').addEventListener('click', () => closeDrawer());
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer();
  if (e.key === 'Tab' && !$('#drawer').hidden) {
    const nodes = $$('a[href],button:not(:disabled),textarea', $('#drawer')), first = nodes[0], last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.project) { if (!closeDrawer()) return; await ask('PROJECT_ACTION', { action: 'switch', project_id: b.dataset.project }); resetFilters(); page = 'library'; history.replaceState(null, '', 'app.html'); await refresh(true); }
    if (b.hasAttribute('data-clear-filters')) clearLibraryFilters();
    if (b.dataset.filter) {
      const selected = b.dataset.filter;
      if (selected === 'all') clearLibraryFilters();
      else {
        if (selected === 'zotero') zoteroFilter = zoteroFilter === 'saved' ? 'all' : 'saved';
        else if (selected === 'tagged') tagFilter = tagFilter === 'tagged' || tagFilter.startsWith('tag:') ? 'all' : 'tagged';
        else filter = filter === selected ? 'all' : selected;
        renderList();
      }
    }
    if (b.dataset.manage) openProjectDialog(b.dataset.manage, state.active_project_id);
    if (b.dataset.restore) { await ask('PROJECT_ACTION', { action: 'restore', project_id: b.dataset.restore }); await refresh(true); toast('项目已恢复。'); }
    if (b.dataset.delete) openProjectDialog('delete', b.dataset.delete);
    if (b.dataset.detail) await openDetail(b.dataset.detail, b.dataset.tab);
    if (b.dataset.exclude) await busy(b, async () => { const r = state.project_papers.find(r => r.project_id === state.active_project_id && r.paper_id === b.dataset.exclude); await ask('EDIT_RECORD', { project_id: r.project_id, paper_id: r.paper_id, patch: { not_relevant: !r.not_relevant } }); await refresh(); toast(r.not_relevant ? '已撤销排除，全部历史仍然保留。' : '已标记为与当前项目不相关。'); });
  } catch (err) { toast(err.message, true); }
});
async function route() {
  if (detail && !closeDrawer()) return;
  page = location.hash === '#settings' ? 'settings' : location.hash === '#archive' ? 'archive' : 'library';
  await refresh(true);
  if (location.hash.startsWith('#paper/')) await openDetail(decodeURIComponent(location.hash.slice(7)));
}
window.addEventListener('hashchange', () => route().catch(e => toast(e.message, true)));
chrome.runtime.onMessage.addListener(m => { if (m.type === 'REFRESH') { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh().catch(e => toast(e.message, true)), 80); } });
window.addEventListener('beforeunload', e => { if ($('#detail-note') && $('#detail-note').value !== detailNote) { e.preventDefault(); e.returnValue = ''; } });
route().catch(e => toast(e.message, true));
