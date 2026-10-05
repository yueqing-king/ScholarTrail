(() => {
  if (window.__scholarTrail) return;
  window.__scholarTrail = true;
  const states = new WeakMap(), Tags = globalThis.ScholarTrailTags;
  let currentProject = null, revision = 0, timer;
  const ask = async message => {
    let result;
    try { result = await chrome.runtime.sendMessage(message); }
    catch { throw new Error('插件连接已失效，请刷新当前页面。'); }
    if (!result?.ok) throw new Error(result?.error || 'ScholarTrail 暂时不可用，请刷新页面。');
    return result.data;
  };
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  const button = (label, fn, cls) => { const b = el('button', label, cls); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const css = `:host{display:block;margin-top:9px;font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#4d5750}*{box-sizing:border-box}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button,a{font:inherit;color:#526957}button{border:0;background:transparent;cursor:pointer;padding:3px 5px;border-radius:4px}button:hover{background:#eaf0e8}button:focus-visible,a:focus-visible{outline:2px solid #456f4e;outline-offset:2px}.badge{color:#44664a;background:#eef3ec;padding:2px 7px;border-radius:4px}.muted{color:#7b756c;background:#f1efea}.zotero{color:#945347;text-decoration:none}.panel{margin:8px 0;padding:12px;background:#f7f8f4;border:1px solid #dce3d7;border-radius:7px;max-width:560px}.label{display:block;margin-bottom:6px;color:#5d675c}textarea{width:100%;min-height:82px;resize:vertical;font:13px/1.6 inherit;padding:9px;border:1px solid #cbd5c8;border-radius:4px;background:#fff;color:#26372a}textarea:focus{outline:2px solid #7f9a78}.save{background:#315c43;color:white;padding:5px 13px;margin:7px 6px 0 0}.error{color:#aa3529;margin-top:5px}button:disabled{opacity:.5;cursor:wait}`;
  function extract(result) {
    const title = result.querySelector('.gs_rt a');
    if (!title) return null;
    const meta = result.querySelector('.gs_a')?.textContent || '';
    const ids = [];
    if (result.dataset.cid) ids.push(`scholar:cid:${result.dataset.cid}`);
    for (const a of result.querySelectorAll('a[href]')) {
      try { const u = new URL(a.href); const id = u.searchParams.get('cites') || u.searchParams.get('cluster'); if (id && /^\d+$/.test(id)) ids.push(`scholar:cluster:${id}`); } catch {}
    }
    let url = title.href;
    try { const u = new URL(url); if (u.pathname === '/scholar_url' && u.searchParams.get('url')) url = u.searchParams.get('url'); } catch {}
    return { title: title.textContent.trim(), authors: meta.split(/\s[-–—]\s/)[0], year: meta.match(/\b(?:18|19|20|21)\d{2}\b/)?.[0] || '', primary_url: url, scholar_url: location.href, scholar_metadata: meta, external_ids: [...new Set(ids)] };
  }
  const toolbar = el('div'); toolbar.id = 'scholartrail-context';
  const barRoot = toolbar.attachShadow({ mode: 'open' });
  const barStyle = el('style'); barStyle.textContent = ':host{position:fixed;z-index:100000;right:20px;bottom:18px}button{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid #d9dfd5;border-radius:30px;background:#f9faf5;color:#355b40;box-shadow:0 3px 14px #00000012;padding:10px 15px;font:12px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer}button:focus-visible{outline:2px solid #355b40}';
  const barButton = button('ScholarTrail · 正在加载…', () => ask({ type: 'OPEN_APP' }).catch(showError));
  barRoot.append(barStyle, barButton); document.body.append(toolbar);
  function showError(e) { barButton.textContent = `ScholarTrail · ${e.message || e}`; barButton.title = e.message || String(e); }
  function render(result, data, project, tags) {
    let state = states.get(result);
    if (!state) {
      const host = el('div'); host.dataset.scholartrail = 'true';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = el('style'); style.textContent = css;
      Tags.installStyles(shadow);
      const row = el('div', '', 'row'); shadow.append(style, row);
      (result.querySelector('.gs_ri') || result).append(host);
      state = { host, shadow, row, panel: null, projectId: null }; states.set(result, state);
    }
    state.projectId = project?.id; state.data = data;
    const { record, zotero } = data;
    result.classList.toggle('scholartrail-excluded', !!record?.not_relevant);
    state.host.hidden = !project && !zotero;
    state.row.replaceChildren();
    if (record?.last_clicked_at) {
      const clicked = el('span', '✓ 之前点过', 'badge');
      clicked.title = `最近点击：${new Date(record.last_clicked_at).toLocaleString('zh-CN')} · ${project.name}`;
      state.row.append(clicked);
    }
    if (zotero) {
      const z = el(zotero.web_url ? 'a' : 'span', zotero.stale ? '✓ 已存入 Zotero · 缓存' : '✓ 已存入 Zotero', 'zotero');
      if (zotero.web_url) { z.href = zotero.web_url; z.target = '_blank'; z.rel = 'noopener noreferrer'; }
      z.title = `${zotero.web_url ? '打开 Zotero' : '已入库，请在设置中刷新文献库以获取网页链接'} · 上次检查：${new Date(zotero.checked_at).toLocaleString('zh-CN')}`;
      state.row.append(z);
    }
    if (project) {
      const tagRow = el('span', '', 'st-tags');
      Tags.renderChips(tagRow, tags, record?.tag_ids);
      const tagButton = button(record?.tag_ids?.length ? '+ 编辑标签' : '+ 添加标签', () => Tags.open({
        projectId: project.id, paperId: state.data.record ? state.data.paper_id : null, projectName: project.name,
        tags, selectedIds: state.data.record?.tag_ids || [],
        commit: (change, paperId) => ask({ type: 'SET_PAPER_TAG', ...change, project_id: project.id, ...(paperId ? { paper_id: paperId } : { paper: extract(result) }) }),
        onChange: () => refresh()
      }), 'st-tag-editor');
      tagRow.append(tagButton); state.row.append(tagRow);
      Tags.update(project.id, data.paper_id, tags, record?.tag_ids);
    }
    if (!record) return;
    state.row.append(button(record.note ? '▤ 笔记' : '+ 添加笔记', () => openNote(state, project, data)));
    const change = async (event) => {
      const control = event.currentTarget; control.disabled = true;
      try { await ask({ type: 'EDIT_RECORD', project_id: project.id, paper_id: data.paper_id, patch: { not_relevant: !record.not_relevant } }); await refresh(); } catch (e) { showError(e); control.disabled = false; }
    };
    if (record.not_relevant) state.row.append(el('span', '× 不相关', 'badge muted'), button('撤销', change));
    else state.row.append(button('× 不相关', change));
    state.row.append(button('历史 ↗', () => ask({ type: 'OPEN_APP', paper_id: data.paper_id }).catch(showError)));
  }
  function openNote(state, project, data) {
    if (state.panel) { state.panel.querySelector('textarea').focus(); return; }
    const panel = el('div', '', 'panel'); state.panel = panel;
    const label = el('label', `笔记 · ${project.name}`, 'label');
    const input = el('textarea'); input.value = data.record.note || ''; input.maxLength = 20000; input.placeholder = '有什么想留给下次的自己？'; input.setAttribute('aria-label', `${project.name}的笔记`); label.append(input);
    const error = el('div', '', 'error'); error.setAttribute('role', 'alert');
    const close = () => { panel.remove(); state.panel = null; };
    const save = button('保存笔记', async () => {
      save.disabled = true;
      try { await ask({ type: 'EDIT_RECORD', project_id: project.id, paper_id: data.paper_id, patch: { note: input.value } }); close(); await refresh(); } catch (e) { error.textContent = e.message; save.disabled = false; }
    }, 'save');
    const remove = button('删除笔记', async () => {
      remove.disabled = true;
      try { await ask({ type: 'EDIT_RECORD', project_id: project.id, paper_id: data.paper_id, patch: { note: '' } }); close(); await refresh(); } catch (e) { error.textContent = e.message; remove.disabled = false; }
    });
    panel.append(label, save, button('取消', close)); if (data.record.note) panel.append(remove); panel.append(error); state.shadow.append(panel); input.focus();
  }
  async function refresh() {
    const generation = ++revision;
    const results = [...document.querySelectorAll('.gs_r.gs_or')].filter(r => r.querySelector('.gs_rt a'));
    try {
      const response = await ask({ type: 'READ_RESULTS', papers: results.map(extract) });
      if (generation !== revision) return;
      currentProject = response.project;
      Tags.syncProject(currentProject?.id);
      barButton.textContent = currentProject ? `◈  ScholarTrail · ${currentProject.name}` : '◈  请先选择项目 · 暂未记录';
      barButton.title = currentProject ? `正在记录到“${currentProject.name}”，点击可切换项目。` : '创建项目后，开始自动记录点击。';
      results.slice(0, 100).forEach((r, i) => render(r, response.results[i], currentProject, response.tags || []));
    } catch (e) { showError(e); }
  }
  function track(event) {
    if ((event.type === 'click' && event.button !== 0) || (event.type === 'auxclick' && event.button !== 1)) return;
    const a = event.target.closest?.('.gs_rt a, .gs_or_ggsm a');
    if (!a || !currentProject) return;
    const result = a.closest('.gs_r.gs_or'), paper = result && extract(result);
    if (!paper) return;
    // Native navigation proceeds normally; the worker owns the durable write.
    ask({ type: 'RECORD_CLICK', project_id: currentProject.id, paper, context: { search_query: new URL(location.href).searchParams.get('q') || '', source_url: location.href } }).then(refresh).catch(showError);
  }
  document.addEventListener('click', track, true); document.addEventListener('auxclick', track, true);
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'REFRESH') refresh(); });
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
  new MutationObserver(mutations => {
    if (mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && (n.matches('.gs_r, .gs_ri, .gs_rt, .gs_a') || n.querySelector('.gs_r, .gs_rt'))))) { clearTimeout(timer); timer = setTimeout(refresh, 150); }
  }).observe(document.body, { childList: true, subtree: true });
  refresh();
})();
