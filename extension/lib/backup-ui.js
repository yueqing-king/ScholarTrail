import { $, ask, fullDate, toast, busy } from './ui.js';
import { MAX_BACKUP_BYTES } from './backup.js';

let pending = null, importing = false;
function download(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function preview(data) {
  $('#import-summary').textContent = `将添加 ${data.projects} 个项目、${data.records} 条论文记录、${data.notes} 条笔记、${data.tags} 个标签和 ${data.encounters} 条点击历史。`;
  $('#import-details').textContent = [data.exported_at ? `备份时间：${fullDate(data.exported_at)}。` : '', data.skipped_projects ? `${data.skipped_projects} 个项目已导入或与当前数据一致，将跳过。` : '', data.renamed_projects ? `${data.renamed_projects} 个同名项目会另建副本。` : '', data.removed_links ? `${data.removed_links} 条无效链接已移除，其他内容保留。` : ''].filter(Boolean).join(' ');
  $('#confirm-import').disabled = !data.projects && !data.papers;
  $('#confirm-import').textContent = data.projects || data.papers ? '确认导入' : '这份备份已在当前数据中';
}
export function bindBackupUI(refresh, state = {}) {
  $('#export-data')?.addEventListener('click', e => busy(e.currentTarget, async () => { download(await ask('EXPORT'), `scholartrail-${new Date().toISOString().slice(0,10)}.json`); toast('研究数据已导出。'); }));
  for (const selector of ['#import-data', '#welcome-import']) $(selector)?.addEventListener('click', () => { $('#backup-file').value = ''; $('#backup-file').click(); });
  const previous = $('#export-before-import');
  if (previous) {
    previous.disabled = !state.import_backup_available;
    previous.addEventListener('click', e => busy(e.currentTarget, async () => { download(await ask('EXPORT_IMPORT_BACKUP'), 'scholartrail-before-import.json'); toast('导入前备份已下载。'); }));
  }
  bindBackupUI.refresh = refresh;
}
$('#backup-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  pending = null;
  const button = $('#import-data') || $('#welcome-import');
  await busy(button, async () => {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件超过 20 MB，请选择较小的文件。');
    const text = await file.text(), data = await ask('IMPORT_PREVIEW', { text });
    pending = { text, revision: data.revision };
    $('#import-filename').textContent = file.name; $('#import-error').textContent = '';
    preview(data); $('#import-dialog').showModal();
  });
});
$('#cancel-import').addEventListener('click', () => { if (!importing) $('#import-dialog').close(); });
$('#import-dialog').addEventListener('cancel', e => { if (importing) e.preventDefault(); });
$('#import-dialog').addEventListener('close', () => { pending = null; });
$('#confirm-import').addEventListener('click', async () => {
  if (!pending || importing) return;
  importing = true;
  const button = $('#confirm-import'); button.disabled = true; button.textContent = '正在导入…'; $('#cancel-import').disabled = true; $('#import-error').textContent = '';
  try {
    const result = await ask('IMPORT', pending);
    $('#import-dialog').close(); await bindBackupUI.refresh(true);
    toast(`导入完成：添加 ${result.projects} 个项目和 ${result.records} 条论文记录，原有内容已保留。`);
  } catch (error) {
    $('#import-error').textContent = error.message;
    if (error.message.includes('数据已更新')) {
      try { const data = await ask('IMPORT_PREVIEW', { text: pending.text }); pending.revision = data.revision; preview(data); $('#import-error').textContent = '当前数据已更新，预览已刷新，请再次确认。'; }
      catch (refreshError) { $('#import-error').textContent = refreshError.message; }
    } else { button.disabled = false; button.textContent = '重试导入'; }
  } finally { importing = false; $('#cancel-import').disabled = false; }
});
