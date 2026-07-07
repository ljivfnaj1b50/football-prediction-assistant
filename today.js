import { analyzeMatch, rankAnalyses } from './model.js';
import { localizeMatch } from './team-cn-map.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
let analyses = [];
let riskFilter = 'all';
let meta = {};

async function load(force = false) {
  try {
    const query = force ? '?force=1&ts=' : '?ts=';
    const res = await fetch('/api/public-feed' + query + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    meta = data;
    analyses = (data.matches || []).map(localizeMatch).map(analyzeMatch);
    render();
  } catch (err) {
    $('matchList').innerHTML = `<div class="empty">数据读取失败：${safe(err.message)}</div>`;
  }
}

function render() {
  const list = rankAnalyses(analyses.filter(x => riskFilter === 'all' || x.risk.key === riskFilter), 'kickoff');
  $('matchCount').textContent = analyses.length;
  $('lowRiskCount').textContent = analyses.filter(x => x.risk.key === 'low').length;
  $('avgConfidence').textContent = analyses.length ? Math.round(analyses.reduce((s, x) => s + x.confidence, 0) / analyses.length) + '%' : '0%';
  $('liveMode').textContent = sourceText();
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)} ｜ 自动刷新：5分钟`;
  $('matchList').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">暂无今日赛事数据</div>';
}

function sourceText() {
  if ((meta.mode || '').includes('sporttery')) return '中国体育彩票官方口径优先';
  if ((meta.mode || '').includes('openliga')) return '公开数据源备用口径';
  return '今日赛事自动分析';
}

function card(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  return `<article class="match-card">
    <div class="match-top">
      <div>
        <div class="match-meta"><span class="pill">${safe(m.jcNum || '待编号')}</span><span>${safe(m.competition || '足球赛事')}</span><span>${fmt(m.kickoff)}</span></div>
      </div>
      <span class="pill ${x.risk.key}">${safe(x.risk.label)}｜${x.confidence}%</span>
    </div>
    <div class="teams"><div class="team">${safe(m.home?.name)}</div><div class="vs">VS</div><div class="team away">${safe(m.away?.name)}</div></div>
    <div class="result-grid">
      <div class="result"><h3>胜平负</h3><strong>${safe(spf.label)}</strong><p>${spf.p}%</p></div>
      <div class="result"><h3>总进球</h3><strong>${safe(goals.label)}</strong><p>${goals.p}%</p></div>
      <div class="result"><h3>比分</h3><strong>${safe(score.score)}</strong><p>${score.p}%</p></div>
      <div class="result"><h3>风险</h3><strong>${safe(x.risk.label)}</strong><p>信心 ${x.confidence}%</p></div>
    </div>
    <div class="gpt-box"><h3>GPT 综合结论</h3><p>${safe(x.scheme.primary)}。${safe(x.scheme.backup)}</p></div>
    <div class="reason">${safe((x.explanation || []).slice(0, 2).join(' '))}</div>
  </article>`;
}

function fmt(v) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || '');
}
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('refreshBtn').onclick = () => load(true);
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    riskFilter = btn.dataset.risk;
    render();
  };
});

load(true);
setInterval(() => load(true), AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
