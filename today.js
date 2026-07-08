import { analyzeMatch, rankAnalyses } from './model.js';
import { localizeMatch } from './team-cn-map.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const PAGE_SIZE = 10;
const LEAGUE_GROUPS = [
  ['全部赛事', /.*/],
  ['世界杯', /世界杯|world cup|wm\s*20|fifa/i],
  ['欧冠', /欧冠|champions league|uefa champions/i],
  ['欧联', /欧联|europa league/i],
  ['韩职', /韩职|k league|k-league|韩国/i],
  ['日职', /日职|j league|j-league|日本职业/i],
  ['英超', /英超|premier league/i],
  ['西甲', /西甲|laliga|la liga/i],
  ['意甲', /意甲|serie a/i],
  ['德甲', /德甲|bundesliga/i],
  ['法甲', /法甲|ligue 1/i],
  ['美职联', /美职联|mls/i],
  ['其他', /.*/]
];
let analyses = [];
let riskFilter = 'all';
let meta = {};
let loading = false;
let viewMode = 'today';
let activeLeague = '全部赛事';
let currentPage = 1;
let selectedId = '';

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
    if (!selectedId && analyses[0]) selectedId = analyses[0].id;
    render();
  } catch (err) {
    $('matchList').innerHTML = `<div class="empty">实时数据读取失败：${safe(err.message)}</div>`;
    $('topPick').className = 'top-pick empty-panel';
    $('topPick').innerHTML = '<strong>今日赛事暂未生成</strong><p>数据源暂时没有返回可用赛程。</p>';
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
  const todayRows = analyses.filter(x => isTodayMatch(x.match));
  const historyRows = analyses.filter(x => !isTodayMatch(x.match));
  const baseRows = viewMode === 'today' ? todayRows : historyRows;
  const filteredRows = filterRows(baseRows);
  const sortedRows = rankAnalyses(filteredRows, $('sortBy').value);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  if (!pageRows.find(x => x.id === selectedId)) selectedId = pageRows[0]?.id || sortedRows[0]?.id || '';
  const selected = sortedRows.find(x => x.id === selectedId) || pageRows[0];
  const focus = rankAnalyses(todayRows.filter(x => !isClosed(x) && (x.risk.key === 'low' || x.risk.key === 'medium')), 'confidence')[0] || rankAnalyses(todayRows.filter(x => !isClosed(x)), 'confidence')[0];

  $('matchCount').textContent = todayRows.length;
  $('bestCount').textContent = todayRows.filter(x => !isClosed(x) && (x.risk.key === 'low' || x.risk.key === 'medium')).length;
  $('avgConfidence').textContent = todayRows.length ? Math.round(todayRows.reduce((s, x) => s + x.confidence, 0) / todayRows.length) + '%' : '0%';
  $('sourceName').textContent = sourceShort();
  $('liveMode').textContent = sourceText(todayRows.length, historyRows.length);
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)} ｜ 自动刷新：5分钟`;
  $('topPick').outerHTML = focus ? topPick(focus) : emptyTopPick(todayRows.length, historyRows.length);
  $('matchList').innerHTML = board(sortedRows, pageRows, selected, pageCount);
  bindBoardEvents();
}

function filterRows(rows) {
  return rows.filter(x => {
    if (riskFilter !== 'all' && x.risk.key !== riskFilter) return false;
    if (activeLeague === '全部赛事') return true;
    if (activeLeague === '其他') return !LEAGUE_GROUPS.slice(1, -1).some(([, re]) => re.test(leagueText(x)));
    const item = LEAGUE_GROUPS.find(([name]) => name === activeLeague);
    return item ? item[1].test(leagueText(x)) : true;
  });
}

function board(allRows, pageRows, selected, pageCount) {
  return `<section class="quick-board">
    <div class="mode-tabs">
      <button class="mode-tab ${viewMode === 'today' ? 'active' : ''}" data-mode="today">今日赛事</button>
      <button class="mode-tab ${viewMode === 'history' ? 'active' : ''}" data-mode="history">历史赛事</button>
    </div>
    <div class="league-tabs">${LEAGUE_GROUPS.map(([name]) => `<button class="league-tab ${activeLeague === name ? 'active' : ''}" data-league="${safe(name)}">${safe(name)}</button>`).join('')}</div>
    <div class="list-panel">
      <div class="list-head"><div><b>${viewMode === 'today' ? '今日赛事预览' : '历史赛事预览'}</b><span>每页 10 场，点击一场查看完整分析</span></div><em>${allRows.length} 场</em></div>
      ${table(pageRows)}
      ${pager(pageCount)}
    </div>
    ${selected ? detail(selected) : '<div class="empty compact"><strong>暂无赛事</strong><p>当前菜单下没有可展示的比赛。</p></div>'}
  </section>`;
}

function table(rows) {
  if (!rows.length) return '<div class="empty compact"><strong>暂无数据</strong><p>换一个赛事菜单看看，或稍后刷新实时数据。</p></div>';
  return `<div class="match-table">${rows.map(x => summaryRow(x)).join('')}</div>`;
}

function summaryRow(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const closed = isClosed(x);
  return `<button class="summary-row ${selectedId === x.id ? 'active' : ''}" data-id="${safe(x.id)}">
    <span class="summary-time">${fmt(m.kickoff)}</span>
    <span class="summary-league">${safe(m.competition || '足球赛事')}</span>
    <span class="summary-teams">${safe(m.home?.name)} vs ${safe(m.away?.name)}</span>
    <span class="summary-pick">${closed ? '已开赛/复盘' : safe(spf.label + ' · ' + goals.label)}</span>
    <span class="summary-risk ${x.risk.key}">${safe(x.risk.label)} ${x.confidence}%</span>
  </button>`;
}

function pager(pageCount) {
  return `<div class="pager"><button data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button><span>${currentPage} / ${pageCount}</span><button data-page="next" ${currentPage >= pageCount ? 'disabled' : ''}>下一页</button></div>`;
}

function detail(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const doubleChance = x.markets.doubleChance[0];
  const closed = isClosed(x);
  return `<article class="detail-card">
    <div class="detail-head"><div><span class="jc">${safe(matchCode(m, viewMode))}</span>${closed ? '<span class="state-tag">已开赛/待复盘</span>' : ''}<h2>${safe(m.home?.name)} vs ${safe(m.away?.name)}</h2><p>${safe(m.competition || '足球赛事')} ｜ ${safe(m.stage || '赛程')} ｜ ${fmt(m.kickoff)}</p></div><span class="detail-risk ${x.risk.key}">${safe(x.risk.label)} · ${x.confidence}%</span></div>
    <div class="detail-market"><div><span>胜平负</span><b>${safe(spf.label)}</b><em>${spf.p}% ｜ 防 ${safe(doubleChance.label)}</em></div><div><span>让球参考</span><b>${safe(handicapPick(x))}</b><em>${closed ? '仅复盘' : '按风险降级'}</em></div><div><span>总进球</span><b>${safe(goals.label)}</b><em>${goals.p}%</em></div><div><span>比分参考</span><b>${safe(score.score)}</b><em>${score.p}%</em></div></div>
    <section class="long-analysis"><h3>${viewMode === 'history' || closed ? '赛事复盘分析' : '赛事分析'}</h3>${analysisText(x, viewMode === 'history' || closed)}</section>
    ${factorMatrix(x)}
  </article>`;
}

function bindBoardEvents() {
  document.querySelectorAll('.mode-tab').forEach(btn => btn.onclick = () => { viewMode = btn.dataset.mode; currentPage = 1; selectedId = ''; render(); });
  document.querySelectorAll('.league-tab').forEach(btn => btn.onclick = () => { activeLeague = btn.dataset.league; currentPage = 1; selectedId = ''; render(); });
  document.querySelectorAll('.summary-row').forEach(btn => btn.onclick = () => { selectedId = btn.dataset.id; render(); });
  document.querySelectorAll('[data-page]').forEach(btn => btn.onclick = () => { currentPage += btn.dataset.page === 'next' ? 1 : -1; render(); });
}

function topPick(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  return `<section id="topPick" class="top-pick"><div class="pick-head"><div><div class="pick-label">今日重点推荐</div><div class="pick-title">${safe(m.home?.name)} vs ${safe(m.away?.name)}</div><div class="pick-time">${matchCode(m, 'today')} ｜ ${safe(m.competition || '足球赛事')} ｜ ${fmt(m.kickoff)}</div></div><span class="pick-badge">${safe(x.risk.label)} · 信心 ${x.confidence}%</span></div><div class="pick-grid"><div class="pick-item"><span>落地方案</span><strong>${safe(planText(x))}</strong></div><div class="pick-item"><span>胜平负</span><strong>${safe(spf.label)} ${spf.p}%</strong></div><div class="pick-item"><span>让球参考</span><strong>${safe(handicapPick(x))}</strong></div><div class="pick-item"><span>总进球 / 比分</span><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong></div></div></section>`;
}

function analysisText(x, history) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const copy = history
    ? `这场已经进入复盘口径，重点不是再给购买动作，而是回看赛前判断是否合理。${m.home?.name} 和 ${m.away?.name} 的模型预期进球分别是 ${x.xg.home} 和 ${x.xg.away}，方向上第一选择曾经落在 ${spf.label}，比分区域靠近 ${score.score}。如果结果偏离，优先检查临场阵容、红牌、天气和水位变化。`
    : `这场先不急着只看胜负。模型给到的预期进球是 ${m.home?.name} ${x.xg.home}，${m.away?.name} ${x.xg.away}，说明比赛节奏更接近 ${goals.label}。胜平负第一方向是 ${spf.label}，但我会把 ${x.markets.doubleChance[0].label} 当作防线一起看。真正落地前，还要补看临场阵容、主力伤停、停赛、球队休息时间、冷热程度和水位变化；这些信息没齐，方案就只能降级，不适合重仓。`;
  return `<p>${safe(copy)}</p><p>${safe(planText(x))}</p>`;
}

function factorMatrix(x) {
  const m = x.match;
  const homeForm = Array.isArray(m.home?.form) && m.home.form.length >= 3;
  const awayForm = Array.isArray(m.away?.form) && m.away.form.length >= 3;
  const injuries = hasRows(m.home?.injuries) || hasRows(m.away?.injuries);
  const suspensions = hasRows(m.home?.suspensions) || hasRows(m.away?.suspensions);
  const odds = Boolean(m.odds?.h2h);
  const market = Boolean(m.market?.volumeIndex || m.market?.publicBetPct?.home || m.market?.oddsMove?.home);
  const factors = [
    ['近期状态', homeForm && awayForm, homeForm && awayForm ? '已纳入近况' : '需要近5场数据'],['伤停名单', injuries, injuries ? '有伤停字段' : '需授权伤停源'],['红牌停赛', suspensions, suspensions ? '有停赛字段' : '需官方/数据商'],['休息时间', Boolean(m.home?.lastPlayedAt && m.away?.lastPlayedAt), '看上场时间和间隔'],['赛程连续性', Boolean(m.home?.lastPlayedAt || m.away?.lastPlayedAt), '连赛会拉高疲劳'],['更衣室关系', false, '公开数据无法稳定获取'],['教练私人关系', false, '不能编造，只能人工补充'],['主力私人关系', false, '需人工情报源'],['天气/海拔', Boolean(m.weather && m.venue), `环境影响 ${x.factors.environment}%`],['受注量', market, market ? '已读市场热度' : '需盘口/交易量源'],['热门程度', market, x.market?.hotSide || '需市场数据'],['水位变化', odds || market, odds ? '已有胜平负赔率' : '需外盘接口'],['疲劳值', Boolean(m.home?.travelKm || m.away?.travelKm || m.home?.lastPlayedAt), `不确定性 ${x.factors.uncertainty}%`],['教练战术', Boolean(m.tactical), '节奏/压迫已预留'],['联赛排名', Boolean(m.home?.rank && m.away?.rank), '用于强弱修正'],['外盘数据', odds, odds ? '已接基础赔率' : '需授权外盘源']
  ];
  return `<div class="factor-panel"><h3>赛事风控分析</h3><div class="factor-grid-v2">${factors.map(([name, ok, note]) => `<div class="factor-chip ${ok ? 'ok' : 'missing'}"><b>${safe(name)}</b><span>${ok ? '已接入' : '待接入'}</span><em>${safe(note)}</em></div>`).join('')}</div></div>`;
}

function emptyTopPick(todayCount, historyCount) { return `<section id="topPick" class="top-pick empty-panel"><strong>${todayCount ? '今日赛事已同步，点下方列表查看详情' : '今日暂时没有同步到官方售卖赛事'}</strong><p>${historyCount ? '历史赛事在顶部菜单中切换查看。' : '如果确认有赛事，需要检查服务器是否被竞彩网接口拦截。'}</p></section>`; }
function sourceShort() { if ((meta.mode || '').includes('sporttery')) return '竞彩'; if ((meta.mode || '').includes('espn')) return '赛程'; if ((meta.mode || '').includes('api')) return '接口'; if ((meta.mode || '').includes('openliga')) return '公开'; if ((meta.mode || '').includes('public')) return '公开'; return '缓存'; }
function sourceText(todayCount, historyCount) { const countText = `今日赛事 ${todayCount} 场，历史 ${historyCount} 场`; if ((meta.mode || '').includes('sporttery')) return `中国体育彩票公开赛事已同步｜${countText}`; if ((meta.mode || '').includes('espn')) return `今日公开赛程数据已同步｜${countText}`; if ((meta.mode || '').includes('api')) return `授权实时接口今日数据已同步｜${countText}`; if ((meta.mode || '').includes('openliga')) return `公开数据源今日数据已同步｜${countText}`; if ((meta.mode || '').includes('public')) return `公开 JSON 今日数据已同步｜${countText}`; return `缓存和历史数据已载入｜${countText}`; }
function planText(x) { const spf = x.markets.winDrawLose[0]; const goals = x.markets.totalGoals.bands[0]; const score = x.scores[0]; if (x.risk.key === 'avoid') return '这场不碰更舒服，方向太散，等临场阵容再说。'; if (x.risk.key === 'high') return `只适合观察：${spf.label}，总进球防 ${goals.label}，比分只看 ${score.score} 附近。`; if (x.risk.key === 'medium') return `谨慎：${spf.label}，防线带 ${x.markets.doubleChance[0].label}，总进球看 ${goals.label}，比分参考 ${score.score}。`; return `主线：${spf.label}，总进球 ${goals.label}，比分参考 ${score.score}，防 ${x.markets.doubleChance[0].label}。`; }
function handicapPick(x) { const p = x.probabilities || {}; const h = Number(p.home || 0), a = Number(p.away || 0), d = Number(p.draw || 0); if (x.risk.key === 'avoid') return '不建议介入'; if (h - a >= 18 && h >= 42) return d >= 27 ? '主 -1 防平' : '主让方向'; if (a - h >= 18 && a >= 42) return d >= 27 ? '客 +1 优先' : '客队方向'; if (h >= a && d >= 28) return '主队不败'; if (a > h && d >= 28) return '客队不败'; return '让球谨慎'; }
function matchCode(match = {}, bucket = 'today') { const code = String(match.jcNum || '').trim(); return code && !/待编号/.test(code) ? code : (bucket === 'history' ? '历史赛程' : '公开赛程'); }
function isClosed(x) { const m = x.match || x; const status = String(m.status || '').toLowerCase(); if (/完|结束|full|final|finished|ft/.test(status)) return true; const t = new Date(m.kickoff).getTime(); return Number.isFinite(t) && Date.now() - t > 2.2 * 60 * 60 * 1000; }
function hasRows(v) { return Array.isArray(v) && v.length > 0; }
function leagueText(x) { const m = x.match || x; return `${m.competition || ''} ${m.stage || ''}`; }
function teamLogo(team = {}) { const src = team.logo || team.crest || team.flag || ''; if (!src) return `<div class="logo">${initial(team.name)}</div>`; return `<img class="logo" src="${safe(src)}" alt="${safe(team.name)}" onerror="this.outerHTML='<div class=&quot;logo&quot;>${initial(team.name)}</div>'">`; }
function isTodayMatch(match) { const day = chinaDay(new Date(match.kickoff)); return day === chinaDay(new Date()); }
function chinaDay(date) { if (!Number.isFinite(date.getTime())) return ''; return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function fmt(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || ''); }
function initial(name='') { return safe(String(name).trim().slice(0, 1) || '队'); }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('refreshBtn').onclick = () => load(true);
$('sortBy').onchange = render;
document.querySelectorAll('.tab').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); btn.classList.add('active'); riskFilter = btn.dataset.risk; currentPage = 1; render(); }; });
load(true);
setInterval(() => load(true), AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
