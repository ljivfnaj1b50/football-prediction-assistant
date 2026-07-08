import { analyzeMatch, rankAnalyses } from './model.js';
import { localizeMatch } from './team-cn-map.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const FINISHED_AFTER_MS = 2.2 * 60 * 60 * 1000;
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
    analyses = (data.matches || []).map(localizeMatch).filter(isTodayMatch).map(analyzeMatch);
    render();
  } catch (err) {
    $('matchList').innerHTML = `<div class="empty">实时数据读取失败：${safe(err.message)}</div>`;
    $('topPick').className = 'top-pick empty-panel';
    $('topPick').innerHTML = '<strong>今日可关注赛事暂未生成</strong><p>数据源暂时没有返回可用赛程。</p>';
  } finally {
    loading = false;
    $('refreshBtn').disabled = false;
    $('refreshBtn').textContent = '刷新实时数据';
  }
}

function render() {
  const sortBy = $('sortBy').value;
  const activeRows = analyses.filter(x => !isHistorical(x));
  const historyRows = analyses.filter(isHistorical);
  const visibleActive = rankAnalyses(activeRows.filter(x => riskFilter === 'all' || x.risk.key === riskFilter), sortBy);
  const visibleHistory = rankAnalyses(historyRows, 'kickoff');
  const focus = rankAnalyses(activeRows.filter(x => x.risk.key === 'low' || x.risk.key === 'medium'), 'confidence')[0] || rankAnalyses(activeRows, 'confidence')[0];

  $('matchCount').textContent = activeRows.length;
  $('bestCount').textContent = activeRows.filter(x => x.risk.key === 'low' || x.risk.key === 'medium').length;
  $('avgConfidence').textContent = activeRows.length ? Math.round(activeRows.reduce((s, x) => s + x.confidence, 0) / activeRows.length) + '%' : '0%';
  $('sourceName').textContent = sourceShort();
  $('liveMode').textContent = sourceText(activeRows.length, historyRows.length);
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)} ｜ 自动刷新：5分钟`;
  $('topPick').outerHTML = focus ? topPick(focus) : emptyTopPick(historyRows.length);
  $('matchList').innerHTML = renderSections(visibleActive, visibleHistory);
}

function renderSections(activeRows, historyRows) {
  const activeHtml = activeRows.length
    ? activeRows.map(x => matchCard(x, 'active')).join('')
    : '<div class="empty compact"><strong>暂无未开赛的今日赛事</strong><p>已结束的比赛已放到下面“历史比赛”板块，不再混到今日推荐里。</p></div>';
  const historyHtml = historyRows.length
    ? historyRows.map(x => matchCard(x, 'history')).join('')
    : '<div class="empty compact"><strong>暂无历史比赛</strong><p>今天已经结束的比赛会自动归档到这里。</p></div>';
  return `<section class="board-section"><div class="section-head"><div><b>今日可关注</b><span>只展示未开赛或临近开赛的比赛</span></div><em>${activeRows.length} 场</em></div>${activeHtml}</section>
  <section class="board-section history-section"><div class="section-head"><div><b>历史比赛</b><span>已结束或明显过时的比赛单独归档</span></div><em>${historyRows.length} 场</em></div>${historyHtml}</section>`;
}

function sourceShort() {
  if ((meta.mode || '').includes('sporttery')) return '竞彩';
  if ((meta.mode || '').includes('espn')) return '赛程';
  if ((meta.mode || '').includes('api')) return '接口';
  if ((meta.mode || '').includes('openliga')) return '公开';
  if ((meta.mode || '').includes('public')) return '公开';
  return '缓存';
}

function sourceText(activeCount, historyCount) {
  const countText = `今日可关注 ${activeCount} 场，历史 ${historyCount} 场`;
  if ((meta.mode || '').includes('sporttery')) return `中国竞彩网今日公开数据已同步｜${countText}`;
  if ((meta.mode || '').includes('espn')) return `今日公开赛程数据已同步｜${countText}`;
  if ((meta.mode || '').includes('api')) return `授权实时接口今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('openliga')) return `公开数据源今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('public')) return `公开 JSON 今日数据已同步｜${countText}`;
  return `今日缓存数据已载入｜${countText}`;
}

function emptyTopPick(historyCount) {
  return `<section id="topPick" class="top-pick empty-panel"><strong>今日暂时没有可推荐的未开赛赛事</strong><p>${historyCount ? '已经开完的比赛我放进了历史比赛板块，避免拿赛后比赛当今日推荐。' : '当前数据源没有返回今日赛程，稍后刷新即可。'}</p></section>`;
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
        <div class="pick-time">${matchCode(m, 'active')} ｜ ${safe(m.competition || '足球赛事')} ｜ ${fmt(m.kickoff)}</div>
      </div>
      <span class="pick-badge">${safe(x.risk.label)} · 信心 ${x.confidence}%</span>
    </div>
    <div class="pick-grid">
      <div class="pick-item"><span>落地方案</span><strong>${safe(planText(x))}</strong></div>
      <div class="pick-item"><span>胜平负</span><strong>${safe(spf.label)} ${spf.p}%</strong></div>
      <div class="pick-item"><span>让球参考</span><strong>${safe(handicap)}</strong></div>
      <div class="pick-item"><span>总进球 / 比分</span><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong></div>
    </div>
  </section>`;
}

function matchCard(x, bucket) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const doubleChance = x.markets.doubleChance[0];
  const handicap = handicapPick(x);
  const history = bucket === 'history';
  return `<article class="match-card ${history ? 'is-history' : ''}">
    <div class="match-main">
      <div class="match-meta">
        <div><span class="jc ${history ? 'history-tag' : ''}">${safe(matchCode(m, bucket))}</span></div>
        <div class="league">${safe(m.competition || '足球赛事')}<br><span class="time">${safe(m.stage || '今日赛程')}</span></div>
        <div class="time">${fmt(m.kickoff)}${history ? ' ｜ 已归档' : ''}</div>
      </div>
      <div class="teams">
        <div class="team">${teamLogo(m.home)}<div class="team-name">${safe(m.home?.name)}</div></div>
        <div class="vs">VS</div>
        <div class="team">${teamLogo(m.away)}<div class="team-name">${safe(m.away?.name)}</div></div>
      </div>
      <div class="prediction">
        <div class="result primary"><h3>${history ? '赛前判断回看' : '最终方案'}</h3><strong>${safe(planText(x))}</strong><p>${safe(x.scheme.backup)}</p></div>
        <div class="result"><h3>胜平负</h3><strong>${safe(spf.label)}</strong><p>${spf.p}% ｜ 防 ${safe(doubleChance.label)}</p></div>
        <div class="result"><h3>让球参考</h3><strong>${safe(handicap)}</strong><p>${history ? '仅作复盘参考' : '按强弱差和风险降级'}</p></div>
        <div class="result"><h3>总进球 / 比分</h3><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong><p>${goals.p}% ｜ ${score.p}%</p></div>
      </div>
    </div>
    <div class="analysis-panel">
      ${analysisSteps(x, history)}
      <div class="risk-box"><span class="risk-pill ${x.risk.key}">${safe(x.risk.label)} · ${x.confidence}%</span><h3>风险判断</h3><p>${riskCopy(x, history)}</p></div>
    </div>
  </article>`;
}

function analysisSteps(x, history) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const h = x.xg.home;
  const a = x.xg.away;
  const rows = [
    ['第一步：先看比赛状态', history ? `这场 ${fmt(m.kickoff)} 已经明显过了开赛时间，我把它放到历史比赛里，不再作为今日可买方向。` : `这场还在今日可关注区，先看开赛时间和临场信息，避免太早下结论。`],
    ['第二步：看双方底子', `${m.home?.name} 的预期进球在 ${h} 左右，${m.away?.name} 在 ${a} 左右，主客差距不是只看名气，而是看进攻效率和失球压力。`],
    ['第三步：看进球节奏', `总进球目前更靠近 ${goals.label}，参考比分落在 ${score.score} 一带，说明这场更适合围绕进球区间做防线。`],
    ['第四步：看方向和风险', `胜平负第一方向是 ${spf.label}，但这场风险标记为${x.risk.label}，所以不能只看一个结果，要一起看防守选项。`],
    ['第五步：给落地方案', planText(x)]
  ];
  return `<div class="reason"><h3>${history ? '历史复盘分析' : '逐步分析'}</h3><ol class="step-list">${rows.map(([title, text]) => `<li><b>${safe(title)}</b><span>${safe(text)}</span></li>`).join('')}</ol></div>`;
}

function planText(x) {
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  if (x.risk.key === 'avoid') return `这场不碰更舒服，方向太散，等临场阵容再说。`;
  if (x.risk.key === 'high') return `只适合观察：${spf.label}，总进球防 ${goals.label}，比分只看 ${score.score} 附近。`;
  if (x.risk.key === 'medium') return `谨慎：${spf.label}，防线带 ${x.markets.doubleChance[0].label}，总进球看 ${goals.label}，比分参考 ${score.score}。`;
  return `主线：${spf.label}，总进球 ${goals.label}，比分参考 ${score.score}，防 ${x.markets.doubleChance[0].label}。`;
}

function riskCopy(x, history) {
  if (history) return `这场已经归档，主要用于回看判断逻辑，不再作为今日方案。赛前风险约 ${x.factors.uncertainty}%，环境影响 ${x.factors.environment}%。`;
  return `${x.risk.text} 当前不确定性 ${x.factors.uncertainty}%，环境影响 ${x.factors.environment}%。临场阵容、伤停和赔率变化出来后，这个方向还要再过一遍。`;
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

function matchCode(match = {}, bucket = 'active') {
  const code = String(match.jcNum || '').trim();
  if (code && !/待编号/.test(code)) return code;
  return bucket === 'history' ? '历史赛程' : '公开赛程';
}

function isHistorical(x) {
  const m = x.match || x;
  const status = String(m.status || '').toLowerCase();
  if (/完|结束|full|final|finished|ft/.test(status)) return true;
  const t = new Date(m.kickoff).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > FINISHED_AFTER_MS;
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
