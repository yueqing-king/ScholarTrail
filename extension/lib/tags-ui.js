(() => {
  if (globalThis.ScholarTrailTags) return;
  const colors = {
    blue: ['蓝色', '#e4edff', '#244b8b'], green: ['绿色', '#e4f2e8', '#285c3b'],
    amber: ['黄色', '#fff1ce', '#755413'], red: ['红色', '#fce4e1', '#903f36'],
    purple: ['紫色', '#eee6fa', '#64438a'], pink: ['粉色', '#f9e3ee', '#893c64'],
    gray: ['灰色', '#ebecea', '#535c53']
  };
  const colorCSS = Object.entries(colors).map(([key, [, bg, fg]]) => `[data-st-color="${key}"]{--st-bg:${bg};--st-fg:${fg}}`).join('');
  const chipCSS = `.st-tags{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.st-tag{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:3px 9px;border-radius:5px;background:var(--st-bg,#ebecea);color:var(--st-fg,#535c53);font:500 12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-wrap:anywhere}.st-tag::before{content:"";width:6px;height:6px;flex:none;border-radius:50%;background:currentColor}.st-tag-editor{font:inherit;color:#526957;border:1px dashed #bccbb9;border-radius:5px;background:transparent;padding:3px 9px;cursor:pointer}.st-tag-editor:hover{background:#f0f4ed}.st-tag-editor:focus-visible{outline:2px solid #315c43;outline-offset:2px}${colorCSS}`;
  const el = (name, text, cls) => { const node = document.createElement(name); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const button = (text, handler, cls) => { const node = el('button', text, cls); node.type = 'button'; node.addEventListener('click', handler); return node; };
  const key = name => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  function installStyles(root) {
    if (root.querySelector('style[data-scholartrail-tags]')) return;
    const style = el('style'); style.dataset.scholartrailTags = 'true'; style.textContent = chipCSS;
    (root.head || root).append(style);
  }
  function chip(tag) { const node = el('span', tag.name, 'st-tag'); node.dataset.stColor = colors[tag.color] ? tag.color : 'gray'; return node; }
  function renderChips(container, tags, ids = []) {
    container.classList.add('st-tags'); container.replaceChildren(...tags.filter(tag => ids.includes(tag.id)).map(chip));
  }
  let current = null;
  function open(options) {
    current?.close();
    let tags = options.tags || [], selected = options.selectedIds || [], paperId = options.paperId || null, color = 'blue', pending = false;
    const previousFocus = document.activeElement;
    const host = el('div'), root = host.attachShadow({ mode: 'open' });
    installStyles(root);
    const style = el('style'); style.textContent = `
      *{box-sizing:border-box}dialog{width:390px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;margin:auto;border:1px solid #dce3d7;border-radius:14px;background:#fffefb;color:#263e32;padding:22px;box-shadow:0 18px 70px #183b282b;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}dialog::backdrop{background:#172b2040}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible{outline:2px solid #315c43;outline-offset:2px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{margin:0;font-size:18px}.close{border:0;background:transparent;color:#596a5b;padding:3px 7px;font-size:22px}.hint{font-size:12px;color:#667563;margin:6px 0 14px;overflow-wrap:anywhere}input{display:block;width:100%;border:1px solid #cbd5c8;border-radius:7px;padding:10px 11px;background:white;color:#263e32}.list{max-height:230px;overflow:auto;display:grid;gap:5px;margin:12px 0}.choice{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;background:transparent;border:1px solid transparent;border-radius:6px;padding:5px;color:#315c43}.choice:hover{background:#f3f6ef}.choice[aria-pressed=true]{border-color:#c7d7c2;background:#f6f8f2}.check{font-weight:600;white-space:nowrap;font-size:12px}.empty{margin:7px 0;color:#78836f;font-size:13px}.create{border-top:1px solid #e4e8df;padding-top:14px}.preview{margin:0 0 10px;display:flex;gap:8px;align-items:center;font-size:12px}.palette{display:flex;flex-wrap:wrap;gap:9px;margin:9px 0 14px}.swatch{width:30px;height:30px;border-radius:7px;border:1px solid #ccd4c6;background:var(--st-bg);color:var(--st-fg);padding:0}.swatch[aria-pressed=true]{outline:2px solid var(--st-fg);outline-offset:2px}.primary{width:100%;background:#315c43;border:0;color:white;border-radius:7px;padding:9px 12px}.error{font-size:12px;color:#973f35;margin-top:10px}.error:empty{display:none}.footer{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #e4e8df;margin-top:14px;padding-top:12px;color:#77836f;font-size:12px}.done{border:1px solid #ced8c8;background:#f4f7ef;color:#315c43;border-radius:6px;padding:5px 13px}[hidden]{display:none!important}`;
    root.append(style);
    const dialog = el('dialog'); dialog.setAttribute('aria-label', '论文标签');
    const close = () => { dialog.close(); host.remove(); if (current?.host === host) current = null; if (previousFocus?.isConnected) previousFocus.focus(); };
    const top = el('div', '', 'top'); top.append(el('h2', '添加标签'), button('×', close, 'close')); top.lastChild.setAttribute('aria-label', '关闭标签选择');
    const hint = el('p', `项目：${options.projectName} · 可多选，名称和颜色会保留`, 'hint');
    const input = el('input'); input.type = 'search'; input.placeholder = '搜索或新建标签…'; input.maxLength = 40; input.setAttribute('aria-label', '搜索或新建标签');
    const list = el('div', '', 'list'); list.setAttribute('aria-label', '已有标签');
    const create = el('div', '', 'create'), preview = el('div', '', 'preview'), palette = el('div', '', 'palette'); palette.setAttribute('aria-label', '新标签颜色');
    const error = el('div', '', 'error'); error.setAttribute('role', 'alert');
    const status = el('span', '选择后自动保存'); status.setAttribute('role', 'status');
    const footer = el('div', '', 'footer'); footer.append(status, button('完成', close, 'done'));
    async function commit(change, created = false) {
      if (pending) return;
      pending = true; error.textContent = ''; status.textContent = '正在保存…'; render();
      try {
        const saved = await options.commit(change, paperId);
        tags = saved.tags; selected = saved.record.tag_ids || []; paperId = saved.paper_id;
        if (created) input.value = '';
        status.textContent = '已保存';
        await options.onChange?.(saved);
      } catch (e) { error.textContent = e.message || '标签未能保存，请重试。'; status.textContent = '保存未完成'; }
      finally {
        pending = false; render();
        if (host.isConnected) {
          const choice = [...list.children].find(node => node.dataset.tagId === change.tag_id);
          (created ? input : choice || input).focus();
        }
      }
    }
    for (const [id, [label]] of Object.entries(colors)) {
      const swatch = button('', () => { color = id; render(); }, 'swatch'); swatch.dataset.stColor = id;
      swatch.setAttribute('aria-label', label); swatch.title = label; palette.append(swatch);
    }
    const add = button('创建并添加', () => commit({ name: input.value, color, selected: true }, true), 'primary');
    create.append(preview, palette, add); dialog.append(top, hint, input, list, create, error, footer); root.append(dialog); document.body.append(host);
    function render() {
      const name = input.value.replace(/\s+/g, ' ').trim(), term = key(name), exact = tags.some(t => key(t.name) === term);
      const matches = tags.filter(t => key(t.name).includes(term));
      list.replaceChildren(...matches.map(tag => {
        const applied = selected.includes(tag.id);
        const choice = button('', () => commit({ tag_id: tag.id, selected: !selected.includes(tag.id) }), 'choice');
        choice.dataset.tagId = tag.id;
        choice.setAttribute('aria-pressed', String(applied)); choice.setAttribute('aria-label', `${applied ? '移除' : '添加'}标签：${tag.name}`); choice.disabled = pending;
        choice.append(chip(tag), el('span', applied ? '✓ 已选' : '+', 'check')); return choice;
      }));
      if (!matches.length) list.append(el('p', tags.length ? '没有同名标签，可以在下方新建。' : '还没有标签，输入名称创建第一个。', 'empty'));
      create.hidden = !name || exact;
      preview.replaceChildren(el('span', '新标签'), chip({ name, color }));
      for (const swatch of palette.children) { swatch.setAttribute('aria-pressed', String(swatch.dataset.stColor === color)); swatch.disabled = pending; }
      add.disabled = pending || !name || [...name].length > 40; input.disabled = pending;
    }
    input.addEventListener('input', () => { error.textContent = ''; render(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if (!create.hidden && !add.disabled) add.click(); } });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    current = { host, close, projectId: options.projectId, update(nextProject, nextPaper, nextTags, nextIds) {
      if (options.projectId === nextProject && paperId && paperId === nextPaper && !pending) { tags = nextTags; selected = nextIds || []; render(); }
    } };
    render(); dialog.showModal(); input.focus();
  }
  globalThis.ScholarTrailTags = {
    installStyles, renderChips, open,
    syncProject(id) { if (current && current.projectId !== id) current.close(); },
    update(...args) { current?.update(...args); }
  };
})();
