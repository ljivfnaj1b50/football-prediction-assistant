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
    const stamp = Date.now();
    const [liveRes, historyRes, fileRes] = await Promise.allSettled([
      fetch('/api/public-feed' + query + stamp, { cache: 'no-store' }),
      fetch('/api/history-latest?ts=' + stamp, { cache: 'no-store' }),
      fetch('./data/matches.json?ts=' + stamp, { cache: 'no-store' })
    ]);
    const live = await jsonFrom(liveRes, '实时数据读取失败');
    const history = await jsonFrom(historyRes, '', true);
    const file = await jsonFrom(fileRes, '', true);
    meta = live || { updatedAt: new Date().toISOString(), mode: 'empty', matches: [] };
    const rows = mergeRows(live?.matches || [], live?.historyMatches || [], history?.matches || [], file?.matches || []);
    analyses = rows.map(localizeMatch).map(analyzeMatch);
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

async function jsonFrom(result, message, optional = false) {
  if (result.status !== 'fulfilled') {
    if (optional) return null;
    throw new Error(message || result.reason?.message || '读取失败');
  }
  const res = result.value;
  if (!res.ok) {
    if (optional) return null;
    throw new Error(message || '读取失败');
  }
  return res.json();
}

function mergeRows(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach(row => {
    const key = row.id || row.sourceId || `${row.home?.name}-${row.away?.name}-${row.kickoff}`;
    if (!map.has(key)) map.set(key, row);
  });
  return [...map.values()].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

function render() {
  const sortBy = $('sortBy').value;
  const todayRows = analyses.filter(x => isTodayMatch(x.match));
  const activeRows = todayRows.filter(x => !isHistorical(x));
  const historyRows = analyses.filter(x => !isTodayMatch(x.match) || isHistorical(x));
  const visibleActive = rankAnalyses(activeRows.filter(x => riskFilter === 'all' || x.risk.key === riskFilter), sortBy);
  const visibleHistory = rankAnalyses(historyRows, 'kickoff').reverse();
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
  const activeWorld = activeRows.filter(isWorldCup);
  const activeOther = activeRows.filter(x => !isWorldCup(x));
  const historyWorld = historyRows.filter(isWorldCup);
  const historyOther = historyRows.filter(x => !isWorldCup(x));
  return section('今日可关注 · 世界杯赛事', '世界杯单独归类，未开赛和临近开赛才放这里', activeWorld, 'active') +
    section('今日可关注 · 其他赛事', '中国体育彩票公开赛事不只看世界杯，其他赛事放这里', activeOther, 'active') +
    section('历史比赛 · 世界杯赛事', '往期世界杯比赛，用来回看和复盘，不当今日方案', historyWorld, 'history') +
    section('历史比赛 · 其他赛事', '其他联赛和杯赛的往期记录', historyOther, 'history');
}

function section(title, desc, rows, bucket) {
  const html = rows.length
    ? rows.map(x => matchCard(x, bucket)).join('')
    : `<div class="empty compact"><strong>暂无数据</strong><p>${safe(bucket === 'active' ? '当前没有未开赛赛事。' : '历史数据会从服务器快照和内置数据文件里自动补充。')}</p></div>`;
  return `<section class="board-section ${bucket === 'history' ? 'history-section' : ''}"><div class="section-head"><div><b>${safe(title)}</b><span>${safe(desc)}</span></div><em>${rows.length} 场</em></div>${html}</section>`;
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
  if ((meta.mode || '').includes('sporttery')) return `中国体育彩票公开赛事已同步｜${countText}`;
  if ((meta.mode || '').includes('espn')) return `今日公开赛程数据已同步｜${countText}`;
  if ((meta.mode || '').includes('api')) return `授权实时接口今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('openliga')) return `公开数据源今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('public')) return `公开 JSON 今日数据已同步｜${countText}`;
  return `今日缓存和历史数据已载入｜${countText}`;
}

function emptyTopPick(historyCount) {
  return `<section id="topPick" class="top-pick empty-panel"><strong>今日暂时没有可推荐的未开赛赛事</strong><p>${historyCount ? '往期比赛已经放进历史比赛板块，避免拿赛后比赛当今日推荐。' : '当前公开数据源没有返回今日赛程，稍后刷新即可。'}</p></section>`;
}

function topPick(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const handicap = handicapPick(x);
  return `<section id="topPick" class="top-pick">
    <div class="pick-head"><div><div class="pick-label">今日重点推荐</div><div class="pick-title">${safe(m.home?.name)} vs ${safe(m.away?.name)}</div><div class="pick-time">${matchCode(m, 'active')} ｜ ${safe(m.competition || '足球赛事')} ｜ ${fmt(m.kickoff)}</div></div><span class="pick-badge">${safe(x.risk.label)} · 信心 ${x.confidence}%</span></div>
    <div class="pick-grid"><div class="pick-item"><span>落地方案</span><strong>${safe(planText(x))}</strong></div><div class="pick-item"><span>胜平负</span><strong>${safe(spf.label)} ${spf.p}%</strong></div><div class="pick-item"><span>让球参考</span><strong>${safe(handicap)}</strong></div><div class="pick-item"><span>总进球 / 比分</span><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong></div></div>
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
    <div class="match-main"><div class="match-meta"><div><span class="jc ${history ? 'history-tag' : ''}">${safe(matchCode(m, bucket))}</span></div><div class="league">${safe(m.competition || '足球赛事')}<br><span class="time">${safe(m.stage || '今日赛程')}</span></div><div class="time">${fmt(m.kickoff)}${history ? ' ｜ 历史记录' : ''}</div></div>
      <div class="teams"><div class="team">${teamLogo(m.home)}<div class="team-name">${safe(m.home?.name)}</div></div><div class="vs">VS</div><div class="team">${teamLogo(m.away)}<div class="team-name">${safe(m.away?.name)}</div></div></div>
      <div class="prediction"><div class="result primary"><h3>${history ? '赛前判断回看' : '最终方案'}</h3><strong>${safe(planText(x))}</strong><p>${safe(x.scheme.backup)}</p></div><div class="result"><h3>胜平负</h3><strong>${safe(spf.label)}</strong><p>${spf.p}% ｜ 防 ${safe(doubleChance.label)}</p></div><div class="result"><h3>让球参考</h3><strong>${safe(handicap)}</strong><p>${history ? '仅作复盘参考' : '按强弱差和风险降级'}</p></div><div class="result"><h3>总进球 / 比分</h3><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong><p>${goals.p}% ｜ ${score.p}%</p></div></div>
    </div><div class="analysis-panel">${analysisSteps(x, history)}<div class="risk-box"><span class="risk-pill ${x.risk.key}">${safe(x.risk.label)} · ${x.confidence}%</span><h3>风险判断</h3><p>${riskCopy(x, history)}</p></div></div>
  </article>`;
}

function analysisSteps(x, history) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const rows = [
    ['第一步：先看比赛状态', history ? `这场是 ${fmt(m.kickoff)} 的往期比赛，我把它放在历史记录里，用来回看当时的判断逻辑。` : `这场仍在今日可关注区，先看开赛时间和临场信息，避免太早下结论。`],
    ['第二步：看双方底子', `${m.home?.name} 的预期进球约 ${x.xg.home}，${m.away?.name} 约 ${x.xg.away}，这里看的是进攻效率、失球压力和主客位置，不只看名气。`],
    ['第三步：看进球节奏', `总进球更靠近 ${goals.label}，参考比分在 ${score.score} 一带，所以这场不能只看胜负，还要把进球区间一起带上。`],
    ['第四步：看方向和风险', `胜平负第一方向是 ${spf.label}，但风险是${x.risk.label}，所以要看防线，不能一把梭。`],
    ['第五步：给落地方案', planText(x)]
  ];
  return `<div class="reason"><h3>${history ? '历史复盘分析' : '逐步分析'}</h3><ol class="step-list">${rows.map(([title, text]) => `<li><b>${safe(title)}</b><span>${safe(text)}</span></li>`).join('')}</ol></div>`;
}

function planText(x) {
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  if (x.risk.key === 'avoid') return '这场不碰更舒服，方向太散，等临场阵容再说。';
  if (x.risk.key === 'high') return `只适合观察：${spf.label}，总进球防 ${goals.label}，比分只看 ${score.score} 附近。`;
  if (x.risk.key === 'medium') return `谨慎：${spf.label}，防线带 ${x.markets.doubleChance[0].label}，总进球看 ${goals.label}，比分参考 ${score.score}。`;
  return `主线：${spf.label}，总进球 ${goals.label}，比分参考 ${score.score}，防 ${x.markets.doubleChance[0].label}。`;
}

function riskCopy(x, history) {
  if (history) return `这场是历史记录，只用来复盘，不作为今日方案。赛前风险约 ${x.factors.uncertainty}%，环境影响 ${x.factors.environment}%。`;
  return `${x.risk.text} 当前不确定性 ${x.factors.uncertainty}%，环境影响 ${x.factors.environment}%。临场阵容、伤停和赔率变化出来后，这个方向还要再过一遍。`;
}

function handicapPick(x) {
  const p = x.probabilities || {};
  const h = Number(p.home || 0), a = Number(p.away || 0), d = Number(p.draw || 0);
  if (x.risk.key === 'avoid') return '不建议介入';
  if (h - a >= 18 && h >= 42) return d >= 27 ? '主 -1 防平' : '主让方向';
  if (a - h >= 18 && a >= 42) return d >= 27 ? '客 +1 优先' : '客队方向';
  if (h >= a && d >= 28) return '主队不败';
  if (a > h && d >= 28) return '客队不败';
  return '让球谨慎';
}
function matchCode(match = {}, bucket = 'active') { const code = String(match.jcNum || '').trim(); return code && !/待编号/.test(code) ? code : (bucket === 'history' ? '历史赛程' : '公开赛程'); }
function isHistorical(x) { const m = x.match || x; const status = String(m.status || '').toLowerCase(); if (/完|结束|full|final|finished|ft/.test(status)) return true; const t = new Date(m.kickoff).getTime(); return Number.isFinite(t) && Date.now() - t > FINISHED_AFTER_MS; }
function isWorldCup(x) { const m = x.match || x; return /世界杯|world cup|wm\s*20|fifa/i.test(`${m.competition || ''} ${m.stage || ''}`); }
function teamLogo(team = {}) { const src = team.logo || team.crest || team.flag || ''; if (!src) return `<div class="logo">${initial(team.name)}</div>`; return `<img class="logo" src="${safe(src)}" alt="${safe(team.name)}" onerror="this.outerHTML='<div class=&quot;logo&quot;>${initial(team.name)}</div>'">`; }
function isTodayMatch(match) { const day = chinaDay(new Date(match.kickoff)); return day === chinaDay(new Date()); }
function chinaDay(date) { if (!Number.isFinite(date.getTime())) return ''; return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function fmt(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || ''); }
function initial(name='') { return safe(String(name).trim().slice(0, 1) || '队'); }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('refreshBtn').onclick = () => load(true);
$('sortBy').onchange = render;
document.querySelectorAll('.tab').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); btn.classList.add('active'); riskFilter = btn.dataset.risk; render(); }; });
load(true);
setInterval(() => load(true), AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
