import { analyzeMatch, rankAnalyses } from './model.js';
import { localizeMatch } from './team-cn-map.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
let analyses = [];
let riskFilter = 'all';
let meta = {};
let loading = false;

async function load(force = false) {
  if (loading) return;
  loading = true;
  $('refreshBtn').disabled = true;
  $('refreshBtn').textContent = '同步中...';
  try {
    const query = force ? '?force=1&ts=' : '?ts=';
    const res = await fetch('/api/public-feed' + query + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '实时数据读取失败');
    meta = data;
    const raw = (data.matches || []).map(localizeMatch).filter(isTodayMatch);
    analyses = raw.map(analyzeMatch);
    render();
  } catch (err) {
    $('matchList').innerHTML = `<div class="empty">实时数据读取失败：${safe(err.message)}</div>`;
    $('topPick').className = 'top-pick empty-panel';
    $('topPick').textContent = '今日实时数据暂未生成。';
  } finally {
    loading = false;
    $('refreshBtn').disabled = false;
    $('refreshBtn').textContent = '刷新实时数据';
  }
}

function render() {
  const sortBy = $('sortBy').value;
  const visible = rankAnalyses(analyses.filter(x => riskFilter === 'all' || x.risk.key === riskFilter), sortBy);
  const focus = rankAnalyses(analyses.filter(x => x.risk.key === 'low' || x.risk.key === 'medium'), 'confidence')[0] || rankAnalyses(analyses, 'confidence')[0];
  $('matchCount').textContent = analyses.length;
  $('bestCount').textContent = analyses.filter(x => x.risk.key === 'low' || x.risk.key === 'medium').length;
  $('avgConfidence').textContent = analyses.length ? Math.round(analyses.reduce((s, x) => s + x.confidence, 0) / analyses.length) + '%' : '0%';
  $('sourceName').textContent = sourceShort();
  $('liveMode').textContent = sourceText();
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)} ｜ 自动刷新：5分钟`;
  $('topPick').outerHTML = focus ? topPick(focus) : '<section id="topPick" class="top-pick empty-panel">暂无今日实时赛事数据，请稍后刷新。</section>';
  $('matchList').innerHTML = visible.length ? visible.map(card).join('') : '<div class="empty">暂无今日实时赛事数据。请确认服务器已部署 V4，并检查 /api/health。</div>';
}

function sourceShort() {
  if ((meta.mode || '').includes('sporttery')) return '竞彩';
  if ((meta.mode || '').includes('espn')) return '赛程';
  if ((meta.mode || '').includes('api')) return '接口';
  if ((meta.mode || '').includes('openliga')) return '公开';
  if ((meta.mode || '').includes('public')) return '公开';
  return '缓存';
}

function sourceText() {
  if ((meta.mode || '').includes('sporttery')) return '中国竞彩网今日公开数据已同步';
  if ((meta.mode || '').includes('espn')) return '今日公开赛程数据已同步';
  if ((meta.mode || '').includes('api')) return '授权实时接口今日数据已同步';
  if ((meta.mode || '').includes('openliga')) return '公开数据源今日数据已同步';
  if ((meta.mode || '').includes('public')) return '公开 JSON 今日数据已同步';
  return '今日缓存数据已载入';
}

function topPick(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const handicap = handicapPick(x);
  return `<section id="topPick" class="top-pick">
    <div class="pick-head">
      <div>
        <div class="pick-label">今日重点推荐</div>
        <div class="pick-title">${safe(m.home?.name)} vs ${safe(m.away?.name)}</div>
        <div class="pick-time">${safe(m.jcNum || '待编号')} ｜ ${safe(m.competition || '足球赛事')} ｜ ${fmt(m.kickoff)}</div>
      </div>
      <span class="pick-badge">${safe(x.risk.label)} · 信心 ${x.confidence}%</span>
    </div>
    <div class="pick-grid">
      <div class="pick-item"><span>最终方案</span><strong>${safe(x.scheme.primary)}</strong></div>
      <div class="pick-item"><span>胜平负</span><strong>${safe(spf.label)} ${spf.p}%</strong></div>
      <div class="pick-item"><span>让球参考</span><strong>${safe(handicap)}</strong></div>
      <div class="pick-item"><span>总进球 / 比分</span><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong></div>
    </div>
  </section>`;
}

function card(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const doubleChance = x.markets.doubleChance[0];
  const handicap = handicapPick(x);
  const reason = (x.explanation || []).slice(0, 3).join(' ');
  return `<article class="match-card">
    <div class="match-main">
      <div class="match-meta">
        <div><span class="jc">${safe(m.jcNum || '待编号')}</span></div>
        <div class="league">${safe(m.competition || '足球赛事')}<br><span class="time">${safe(m.stage || '今日赛程')}</span></div>
        <div class="time">${fmt(m.kickoff)}</div>
      </div>
      <div class="teams">
        <div class="team">${teamLogo(m.home)}<div class="team-name">${safe(m.home?.name)}</div></div>
        <div class="vs">VS</div>
        <div class="team">${teamLogo(m.away)}<div class="team-name">${safe(m.away?.name)}</div></div>
      </div>
      <div class="prediction">
        <div class="result primary"><h3>最终方案</h3><strong>${safe(x.scheme.level)}：${safe(x.scheme.primary)}</strong><p>${safe(x.scheme.backup)}</p></div>
        <div class="result"><h3>胜平负</h3><strong>${safe(spf.label)}</strong><p>${spf.p}% ｜ 防 ${safe(doubleChance.label)}</p></div>
        <div class="result"><h3>让球参考</h3><strong>${safe(handicap)}</strong><p>按强弱差和风险降级</p></div>
        <div class="result"><h3>总进球 / 比分</h3><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong><p>${goals.p}% ｜ ${score.p}%</p></div>
      </div>
    </div>
    <div class="card-bottom">
      <div class="reason"><h3>分析原因</h3><p>${safe(reason || '今日数据仍在补充，先按基础模型给出低权重参考。')}</p></div>
      <div class="risk-box"><span class="risk-pill ${x.risk.key}">${safe(x.risk.label)} · ${x.confidence}%</span><h3>风险判断</h3><p>${safe(x.risk.text)} 不确定性 ${x.factors.uncertainty}%，环境 ${x.factors.environment}%。</p></div>
    </div>
  </article>`;
}

function handicapPick(x) {
  const p = x.probabilities || {};
  const h = Number(p.home || 0);
  const a = Number(p.away || 0);
  const d = Number(p.draw || 0);
  if (x.risk.key === 'avoid') return '不建议介入';
  if (h - a >= 18 && h >= 42) return d >= 27 ? '主 -1 防平' : '主让方向';
  if (a - h >= 18 && a >= 42) return d >= 27 ? '客 +1 优先' : '客队方向';
  if (h >= a && d >= 28) return '主队不败';
  if (a > h && d >= 28) return '客队不败';
  return '让球谨慎';
}

function teamLogo(team = {}) {
  const src = team.logo || team.crest || team.flag || '';
  if (!src) return `<div class="logo">${initial(team.name)}</div>`;
  return `<img class="logo" src="${safe(src)}" alt="${safe(team.name)}" onerror="this.outerHTML='<div class=&quot;logo&quot;>${initial(team.name)}</div>'">`;
}

function isTodayMatch(match) {
  const day = chinaDay(new Date(match.kickoff));
  return day === chinaDay(new Date());
}

function chinaDay(date) {
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function fmt(v) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || '');
}
function initial(name='') { return safe(String(name).trim().slice(0, 1) || '队'); }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('refreshBtn').onclick = () => load(true);
$('sortBy').onchange = render;
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
