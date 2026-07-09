const analysisState = new Map();
let officialMatches = null;
let observerBusy = false;
function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
async function getOfficialMatches() { if (officialMatches) return officialMatches; const res = await fetch(`/api/public-feed?ts=${Date.now()}`, { cache: 'no-store' }); const data = await res.json(); officialMatches = data.matches || []; return officialMatches; }
async function resolveCurrentMatch() { const names = [...document.querySelectorAll('.detail-head .team-hero h2')].map(node => node.textContent.trim()); if (names.length < 2) return null; const rows = await getOfficialMatches(); return rows.find(match => match.home?.name === names[0] && match.away?.name === names[1]) || null; }
function panelHtml(state) {
  if (!state) return `<h3>GPT主分析</h3><p>由GPT联网核验公开资料后生成。没有可靠来源的项目会明确标注未知。</p><button class="refresh" data-real-gpt>生成真实分析</button>`;
  if (state.loading) return '<h3>GPT主分析</h3><p>正在联网核验赛事资料，请稍候...</p>';
  if (!state.ok) return `<h3>GPT主分析</h3><p>${esc(state.message || '暂未生成分析')}</p><button class="refresh" data-real-gpt>重新生成</button>`;
  const sources = (state.sources || []).map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>`).join('');
  return `<h3>GPT主分析 <small>${esc(state.model || '')}</small></h3><div class="gpt-copy">${esc(state.text).replace(/\n/g, '<br>')}</div>${sources ? `<div class="gpt-sources">${sources}</div>` : ''}<p class="gpt-time">生成时间：${new Date(state.generatedAt).toLocaleString('zh-CN')}</p>`;
}
async function installPanel() {
  if (observerBusy) return;
  const panel = document.querySelector('.detail-card .analyst-panel');
  if (!panel || panel.dataset.realGpt === '1') return;
  observerBusy = true;
  panel.dataset.realGpt = '1'; panel.classList.add('gpt-panel');
  const match = await resolveCurrentMatch().catch(() => null);
  panel.dataset.matchId = match?.id || '';
  panel.innerHTML = panelHtml(match ? analysisState.get(match.id) : { ok: false, message: '未匹配到中国体育彩票官方赛事，不能生成分析。' });
  observerBusy = false;
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-real-gpt]'); if (!button) return;
  const panel = button.closest('.gpt-panel'); const matchId = panel?.dataset.matchId; if (!matchId) return;
  analysisState.set(matchId, { loading: true }); panel.innerHTML = panelHtml(analysisState.get(matchId));
  try { const res = await fetch(`/api/gpt-analysis?matchId=${encodeURIComponent(matchId)}&ts=${Date.now()}`, { cache: 'no-store' }); analysisState.set(matchId, await res.json()); }
  catch (error) { analysisState.set(matchId, { ok: false, message: `GPT分析读取失败：${error.message}` }); }
  panel.innerHTML = panelHtml(analysisState.get(matchId));
});
const style = document.createElement('style');
style.textContent = '.gpt-panel{display:block}.gpt-panel h3{display:flex;align-items:center;gap:10px}.gpt-panel h3 small{font-size:12px;color:#777}.gpt-copy{font-size:14px;line-height:1.85;color:#282828}.gpt-sources{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.gpt-sources a{font-size:12px;color:#176a5d;text-decoration:none;border:1px solid #d8e7e3;padding:6px 9px;border-radius:6px}.gpt-time{margin-top:12px!important;font-size:12px!important;color:#777!important}';
document.head.appendChild(style);
new MutationObserver(installPanel).observe(document.getElementById('matchList'), { childList: true, subtree: true });
installPanel();
