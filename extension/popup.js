import { $, esc, ask, toast } from './lib/ui.js';
const open = async settings => { await ask('OPEN_APP', { settings }); window.close(); };
async function render() {
  const s = await ask('GET_STATE'), projects = s.projects.filter(p => !p.archived_at), rows = s.project_papers.filter(p => p.project_id === s.active_project_id);
  $('#popup-content').innerHTML = projects.length ? `<div class="popup-label">当前项目</div><select id="current-project" aria-label="当前项目">${projects.map(p => `<option value="${p.id}" ${p.id === s.active_project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><div class="popup-stats"><div><strong>${rows.filter(p => Date.now() - Date.parse(p.last_clicked_at) < 7 * 86400000).length}</strong><span>近 7 天点击</span></div><div><strong>${rows.filter(p => s.zotero_links[p.paper_id]).length}</strong><span>已存入 Zotero</span></div></div><button class="button primary" id="open-project">打开项目 <span>→</span></button><button class="text-button popup-new" id="manage">管理项目</button>` : '<p class="popup-empty">创建研究项目，然后照常使用 Google Scholar。研究足迹从第一次点击开始。</p><button class="button primary" id="open-project">创建第一个项目 <span>→</span></button>';
  $('#open-project').addEventListener('click', () => open(false).catch(e => toast(e.message, true)));
  $('#manage')?.addEventListener('click', () => open(false).catch(e => toast(e.message, true)));
  $('#current-project')?.addEventListener('change', async e => { try { await ask('PROJECT_ACTION', { action: 'switch', project_id: e.target.value }); await render(); } catch (err) { toast(err.message, true); } });
}
$('#settings').addEventListener('click', () => open(true).catch(e => toast(e.message, true)));
chrome.runtime.onMessage.addListener(m => { if (m.type === 'REFRESH') render().catch(() => {}); });
render().catch(e => toast(e.message, true));
