export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function ask(type, fields = {}) {
  let r;
  try { r = await chrome.runtime.sendMessage({ type, ...fields }); }
  catch { throw new Error('无法连接 ScholarTrail，请刷新当前页面。'); }
  if (!r?.ok) throw new Error(r?.error || 'ScholarTrail 未能完成此操作，请重试。');
  return r.data;
}
export const date = value => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
export const fullDate = value => value ? new Date(value).toLocaleString('zh-CN') : '尚未检查';
export function toast(message, error = false) {
  const e = $('#toast'); e.textContent = message; e.classList.toggle('error', error); e.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { e.hidden = true; }, error ? 9000 : 3500);
}
export async function busy(button, action) {
  button.disabled = true;
  try { return await action(); } catch (e) { toast(e.message, true); } finally { button.disabled = false; }
}
