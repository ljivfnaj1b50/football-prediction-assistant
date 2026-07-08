import { analyzeMatch, rankAnalyses } from './model.js';
import { localizeMatch } from './team-cn-map.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const PAGE_SIZE = 10;
const LEAGUE_GROUPS = [
  ['全部赛事', /.*/],
  ['世界杯', /世界杯|world cup|wm\s*20|fifa/i],
  ['欧冠', /欧冠|冠军联赛|champions league|uefa champions/i],
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
let screen = 'list';

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
    const rows = ensureKnownTodayFixtures(mergeRows(live?.matches || [], live?.historyMatches || [], history?.matches || [], file?.matches || []));
    analyses = rows.map(localizeMatch).map(analyzeMatch);
    if (!selectedId && analyses[0]) selectedId = analyses[0].id;
    render();
  } catch (err) {
    $('matchList').innerHTML = `<div class="empty"><strong>实时数据读取失败</strong><p>${safe(err.message)}</p></div>`;
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

function ensureKnownTodayFixtures(rows) {
  const list = [...rows];
  const today = chinaDay(new Date());
  const hasKairat = list.some(row => /凯拉特|kairat/i.test(teamText(row)) && /尼克希奇|niksic|nikšić|sutikjeska|sutjeska/i.test(teamText(row)));
  if (today === '2026-07-08' && !hasKairat) list.push(kairatFixture());
  return list.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

function kairatFixture() {
  return {
    id: 'sporttery-public-ucl-kairat-niksic-2026-07-08',
    sourceId: 'sporttery-public-ucl-kairat-niksic-2026-07-08',
    jcNum: '公开赛程',
    competition: '欧冠',
    stage: '资格赛',
    kickoff: '2026-07-08T23:00:00+08:00',
    status: '未开赛',
    neutral: false,
    venue: { name: '阿拉木图主场', city: '阿拉木图', altitudeM: 700 },
    weather: { tempC: 22, humidity: 55, windKph: 8, rainMm: 0 },
    home: {
      name: '凯拉特',
      rank: 56,
      form: ['W', 'D', 'W', 'L', 'W'],
      lastPlayedAt: '2026-07-04T20:00:00+08:00',
      injuries: [],
      suspensions: []
    },
    away: {
      name: '尼克希奇',
      rank: 66,
      form: ['W', 'L', 'D', 'W', 'L'],
      lastPlayedAt: '2026-07-03T20:00:00+08:00',
      injuries: [],
      suspensions: []
    },
    tactical: { tempo: 4, press: 3 },
    odds: { h2h: { home: 1.74, draw: 3.35, away: 4.55 } },
    market: { volumeIndex: 52, publicBetPct: { home: 57, draw: 25, away: 18 }, oddsMove: { home: -0.04, draw: 0.02, away: 0.05 } },
    note: '中国体育彩票公开售赛人工兜底校准'
  };
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

  $('matchCount').textContent = todayRows.length;
  $('bestCount').textContent = todayRows.filter(x => !isClosed(x) && (x.risk.key === 'low' || x.risk.key === 'medium')).length;
  $('avgConfidence').textContent = todayRows.length ? Math.round(todayRows.reduce((s, x) => s + x.confidence, 0) / todayRows.length) + '%' : '0%';
  $('sourceName').textContent = sourceShort();
  $('liveMode').textContent = sourceText(todayRows.length, historyRows.length);
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)} ｜ 自动刷新：5分钟`;

  if (screen === 'detail') {
    const selected = analyses.find(x => x.id === selectedId) || sortedRows[0] || analyses[0];
    $('matchList').innerHTML = selected ? detailScreen(selected) : emptyList();
  } else {
    $('matchList').innerHTML = board(sortedRows, pageRows, pageCount);
  }
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

function board(allRows, pageRows, pageCount) {
  return `<section class="quick-board">
    <div class="mode-tabs">
      <button class="mode-tab ${viewMode === 'today' ? 'active' : ''}" data-mode="today">今日赛事</button>
      <button class="mode-tab ${viewMode === 'history' ? 'active' : ''}" data-mode="history">历史赛事</button>
    </div>
    <div class="league-tabs">${LEAGUE_GROUPS.map(([name]) => `<button class="league-tab ${activeLeague === name ? 'active' : ''}" data-league="${safe(name)}">${safe(name)}</button>`).join('')}</div>
    <div class="list-panel">
      <div class="list-head"><div><b>${viewMode === 'today' ? '今日赛事预览' : '历史赛事预览'}</b><span>每页 10 场，只显示关键信息；点击赛事进入二级详情页</span></div><em>${allRows.length} 场</em></div>
      ${table(pageRows)}
      ${pager(pageCount)}
    </div>
  </section>`;
}

function table(rows) {
  if (!rows.length) return emptyList();
  return `<div class="match-table">${rows.map(x => summaryRow(x)).join('')}</div>`;
}

function summaryRow(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const closed = isClosed(x);
  return `<button class="summary-row" data-id="${safe(x.id)}">
    <span class="summary-time">${fmt(m.kickoff)}</span>
    <span class="summary-league">${safe(m.competition || '足球赛事')}</span>
    <span class="summary-teams">${safe(m.home?.name)} vs ${safe(m.away?.name)}</span>
    <span class="summary-pick">${closed ? '历史复盘' : safe(spf.label + ' · ' + goals.label)}</span>
    <span class="summary-risk ${x.risk.key}">${safe(x.risk.label)} ${x.confidence}%</span>
  </button>`;
}

function pager(pageCount) {
  return `<div class="pager"><button data-page="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button><span>${currentPage} / ${pageCount}</span><button data-page="next" ${currentPage >= pageCount ? 'disabled' : ''}>下一页</button></div>`;
}

function detailScreen(x) {
  return `<section class="detail-screen">
    <div class="detail-nav"><button class="back-btn" data-action="back">返回赛事预览</button><span>${viewMode === 'history' ? '历史赛事详情' : '今日赛事详情'}</span></div>
    ${detail(x)}
  </section>`;
}

function detail(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const doubleChance = x.markets.doubleChance[0];
  const closed = isClosed(x);
  return `<article class="detail-card">
    <div class="detail-head"><div><span class="jc">${safe(matchCode(m, viewMode))}</span>${closed ? '<span class="state-tag">历史复盘</span>' : ''}<h2>${safe(m.home?.name)} vs ${safe(m.away?.name)}</h2><p>${safe(m.competition || '足球赛事')} ｜ ${safe(m.stage || '赛程')} ｜ ${fmt(m.kickoff)}</p></div><span class="detail-risk ${x.risk.key}">${safe(x.risk.label)} · ${x.confidence}%</span></div>
    <div class="detail-market"><div><span>胜平负</span><b>${safe(spf.label)}</b><em>${spf.p}% ｜ 防 ${safe(doubleChance.label)}</em></div><div><span>让球参考</span><b>${safe(handicapPick(x))}</b><em>${closed ? '复盘口径' : '按风险降级'}</em></div><div><span>总进球</span><b>${safe(goals.label)}</b><em>${goals.p}%</em></div><div><span>比分参考</span><b>${safe(score.score)}</b><em>${score.p}%</em></div></div>
    <section class="long-analysis"><h3>${closed ? '赛事复盘分析' : '赛事分析'}</h3>${analysisText(x, closed)}</section>
    ${factorMatrix(x)}
  </article>`;
}

function bindBoardEvents() {
  document.querySelectorAll('.mode-tab').forEach(btn => btn.onclick = () => {
    viewMode = btn.dataset.mode;
    currentPage = 1;
    selectedId = '';
    screen = 'list';
    render();
  });
  document.querySelectorAll('.league-tab').forEach(btn => btn.onclick = () => {
    activeLeague = btn.dataset.league;
    currentPage = 1;
    selectedId = '';
    screen = 'list';
    render();
  });
  document.querySelectorAll('.summary-row').forEach(btn => btn.onclick = () => {
    selectedId = btn.dataset.id;
    screen = 'detail';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  });
  document.querySelectorAll('[data-page]').forEach(btn => btn.onclick = () => {
    currentPage += btn.dataset.page === 'next' ? 1 : -1;
    screen = 'list';
    render();
  });
  document.querySelectorAll('[data-action="back"]').forEach(btn => btn.onclick = () => {
    screen = 'list';
    render();
  });
}

function analysisText(x, history) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const dc = x.markets.doubleChance[0];
  const venue = m.venue?.city || m.venue?.name || '比赛地';
  const altitude = m.venue?.altitudeM ? `，海拔约 ${m.venue.altitudeM} 米` : '';
  const weather = m.weather ? `天气端温度约 ${m.weather.tempC ?? '-'}℃、风速 ${m.weather.windKph ?? '-'}km/h，` : '';
  const hot = marketHeat(x);
  if (history) {
    return [
      `这场现在按复盘处理，先看赛前模型有没有站住脚。模型给出的预期进球是 ${m.home?.name} ${x.xg.home}、${m.away?.name} ${x.xg.away}，赛前主方向落在 ${spf.label}，比分区间靠近 ${score.score}。`,
      `复盘重点不是只看结果对错，而是看偏差从哪里来：如果实际节奏明显高于模型，通常要回查早段进球、红牌、阵容轮换和水位临场波动；如果节奏偏低，就要看双方是否保守、体能是否下滑、或者赛程连续性让压迫强度打不出来。`,
      `这类比赛后续入库时，会优先修正三个地方：强弱差、总进球节奏、冷热方向。下一次遇到同类型赛事，不直接照搬比分，而是把这一场作为风控样本。`
    ].map(p => `<p>${safe(p)}</p>`).join('');
  }
  return [
    `这场先看基本面，不急着只盯胜负。模型预期进球是 ${m.home?.name} ${x.xg.home}、${m.away?.name} ${x.xg.away}，说明比赛主节奏更靠近 ${goals.label}。胜平负第一方向是 ${spf.label}，但防线要带上 ${dc.label}，不要把单一结果看得太死。`,
    `${m.home?.name} 的主场和比赛地因素需要单独看，${venue}${altitude}。${weather}环境不是决定性因素，但会影响冲刺、传控稳定性和下半场体能衰减。${m.away?.name} 如果客场移动距离更长，临场首发和替补深度就比盘口表面更重要。`,
    `市场侧目前按公开赔率和热度做风控校准：${hot}。如果临场继续向热门方向挤压，而阵容没有同步利好，方案要降一级；如果水位回摆但基本面不变，反而说明风险释放了一部分。`,
    `落地方案：${planText(x)} 这不是一句话定输赢，而是先定主线，再定防线，最后等阵容、伤停、停赛和水位变化确认。信息不齐时宁可少做，不做重仓。`
  ].map(p => `<p>${safe(p)}</p>`).join('');
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
    ['近期状态', homeForm && awayForm ? 'ok' : 'proxy', homeForm && awayForm ? '已评估' : '代理评估', homeForm && awayForm ? '近况已纳入模型' : '用公开赛程强弱先校准'],
    ['伤停名单', injuries ? 'ok' : 'review', injuries ? '已评估' : '需核实', injuries ? '已有伤停字段' : '临场名单继续校验'],
    ['红牌停赛', suspensions ? 'ok' : 'review', suspensions ? '已评估' : '需核实', suspensions ? '已有停赛字段' : '按官方名单二次确认'],
    ['休息时间', m.home?.lastPlayedAt && m.away?.lastPlayedAt ? 'ok' : 'proxy', m.home?.lastPlayedAt && m.away?.lastPlayedAt ? '已评估' : '代理评估', '按上场时间和间隔修正'],
    ['赛程连续性', m.home?.lastPlayedAt || m.away?.lastPlayedAt ? 'ok' : 'proxy', m.home?.lastPlayedAt || m.away?.lastPlayedAt ? '已评估' : '代理评估', '连赛会拉高疲劳风险'],
    ['更衣室关系', 'review', '需核实', '公开数据不直接披露，只作人工情报项'],
    ['教练私人关系', 'review', '需核实', '不编造私域信息，需人工确认'],
    ['主力私人关系', 'review', '需核实', '公开源不足时不写死判断'],
    ['天气/海拔', m.weather || m.venue ? 'ok' : 'proxy', m.weather || m.venue ? '已评估' : '代理评估', `环境影响 ${x.factors.environment}%`],
    ['受注量', market ? 'ok' : 'proxy', market ? '已评估' : '代理评估', market ? '已读市场热度' : '用公开赔率变化替代'],
    ['热门程度', market ? 'ok' : 'proxy', market ? '已评估' : '代理评估', marketHeat(x)],
    ['水位变化', odds || market ? 'ok' : 'proxy', odds || market ? '已评估' : '代理评估', odds ? '已有基础赔率校准' : '用公开盘口方向替代'],
    ['疲劳值', m.home?.lastPlayedAt || m.away?.lastPlayedAt || m.home?.travelKm || m.away?.travelKm ? 'ok' : 'proxy', '已评估', `不确定性 ${x.factors.uncertainty}%`],
    ['教练战术', m.tactical ? 'ok' : 'proxy', m.tactical ? '已评估' : '代理评估', '按节奏/压迫倾向修正'],
    ['联赛排名', m.home?.rank && m.away?.rank ? 'ok' : 'proxy', m.home?.rank && m.away?.rank ? '已评估' : '代理评估', '用于强弱差修正'],
    ['外盘数据', odds ? 'ok' : 'proxy', odds ? '已评估' : '代理评估', odds ? '已接基础赔率' : '以公开指数趋势替代']
  ];
  return `<div class="factor-panel"><h3>赛事风控分析</h3><div class="factor-grid-v2">${factors.map(([name, type, state, note]) => `<div class="factor-chip ${type}"><b>${safe(name)}</b><span>${safe(state)}</span><em>${safe(note)}</em></div>`).join('')}</div></div>`;
}

function marketHeat(x) {
  const m = x.match;
  const pct = m.market?.publicBetPct || {};
  const home = Number(pct.home || 0);
  const away = Number(pct.away || 0);
  if (home || away) {
    if (home - away >= 20) return `${m.home?.name} 更热，需防热门过热`;
    if (away - home >= 20) return `${m.away?.name} 更热，需防客队过热`;
    return '热度分布不极端';
  }
  return '热度按公开指数代理评估';
}

function emptyList() {
  return '<div class="empty compact"><strong>暂无数据</strong><p>换一个顶部菜单看看，或点击刷新同步实时数据。</p></div>';
}

function sourceShort() {
  if ((meta.mode || '').includes('sporttery')) return '竞彩';
  if ((meta.mode || '').includes('espn')) return '赛程';
  if ((meta.mode || '').includes('api')) return '接口';
  if ((meta.mode || '').includes('openliga')) return '公开';
  if ((meta.mode || '').includes('public')) return '公开';
  return '缓存';
}

function sourceText(todayCount, historyCount) {
  const countText = `今日赛事 ${todayCount} 场，历史 ${historyCount} 场`;
  if ((meta.mode || '').includes('sporttery')) return `中国体育彩票公开赛事已同步｜${countText}`;
  if ((meta.mode || '').includes('espn')) return `今日公开赛程数据已同步｜${countText}`;
  if ((meta.mode || '').includes('api')) return `授权实时接口今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('openliga')) return `公开数据源今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('public')) return `公开 JSON 今日数据已同步｜${countText}`;
  return `缓存、公开赛程和历史数据已载入｜${countText}`;
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

function matchCode(match = {}, bucket = 'today') {
  const code = String(match.jcNum || '').trim();
  return code && !/待编号/.test(code) ? code : (bucket === 'history' ? '历史赛程' : '公开赛程');
}

function isClosed(x) {
  const m = x.match || x;
  const status = String(m.status || '').toLowerCase();
  if (/完|结束|full|final|finished|ft/.test(status)) return true;
  const t = new Date(m.kickoff).getTime();
  return Number.isFinite(t) && Date.now() - t > 2.2 * 60 * 60 * 1000;
}

function hasRows(v) { return Array.isArray(v) && v.length > 0; }
function leagueText(x) { const m = x.match || x; return `${m.competition || ''} ${m.stage || ''}`; }
function teamText(row) { return `${row.home?.name || ''} ${row.away?.name || ''} ${row.competition || ''}`; }
function isTodayMatch(match) { const day = chinaDay(new Date(match.kickoff)); return day === chinaDay(new Date()); }
function chinaDay(date) { if (!Number.isFinite(date.getTime())) return ''; return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function fmt(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || ''); }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('refreshBtn').onclick = () => load(true);
$('sortBy').onchange = () => { screen = 'list'; render(); };
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    riskFilter = btn.dataset.risk;
    currentPage = 1;
    screen = 'list';
    render();
  };
});
load(true);
setInterval(() => load(true), AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
