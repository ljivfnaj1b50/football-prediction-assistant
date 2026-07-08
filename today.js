import { analyzeMatch, rankAnalyses } from './model.js';
import { localizeMatch } from './team-cn-map.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const LEAGUE_GROUPS = [
  ['世界杯赛事', /世界杯|world cup|wm\s*20|fifa/i],
  ['欧冠赛事', /欧冠|champions league|uefa champions/i],
  ['欧联赛事', /欧联|europa league/i],
  ['韩职赛事', /韩职|k league|k-league|韩国/i],
  ['日职赛事', /日职|j league|j-league|日本职业/i],
  ['英超赛事', /英超|premier league/i],
  ['西甲赛事', /西甲|laliga|la liga/i],
  ['意甲赛事', /意甲|serie a/i],
  ['德甲赛事', /德甲|bundesliga/i],
  ['法甲赛事', /法甲|ligue 1/i],
  ['美职联赛事', /美职联|mls/i],
  ['其他赛事', /.*/]
];
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
  const sortBy = $('sortBy').value;
  const todayRows = analyses.filter(x => isTodayMatch(x.match));
  const historyRows = analyses.filter(x => !isTodayMatch(x.match));
  const visibleToday = rankAnalyses(todayRows.filter(x => riskFilter === 'all' || x.risk.key === riskFilter), sortBy);
  const visibleHistory = rankAnalyses(historyRows, 'kickoff').reverse();
  const focus = rankAnalyses(todayRows.filter(x => !isClosed(x) && (x.risk.key === 'low' || x.risk.key === 'medium')), 'confidence')[0] || rankAnalyses(todayRows.filter(x => !isClosed(x)), 'confidence')[0];

  $('matchCount').textContent = todayRows.length;
  $('bestCount').textContent = todayRows.filter(x => !isClosed(x) && (x.risk.key === 'low' || x.risk.key === 'medium')).length;
  $('avgConfidence').textContent = todayRows.length ? Math.round(todayRows.reduce((s, x) => s + x.confidence, 0) / todayRows.length) + '%' : '0%';
  $('sourceName').textContent = sourceShort();
  $('liveMode').textContent = sourceText(todayRows.length, historyRows.length);
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)} ｜ 自动刷新：5分钟`;
  $('topPick').outerHTML = focus ? topPick(focus) : emptyTopPick(todayRows.length, historyRows.length);
  $('matchList').innerHTML = renderSections(visibleToday, visibleHistory);
}

function renderSections(todayRows, historyRows) {
  return renderLeagueSections('今日中国体育彩票公开赛事', '今天售卖或公开赛程里的比赛都会放这里，不因为已开赛就消失', todayRows, 'today') +
    renderLeagueSections('历史赛事记录', '往期数据、缓存数据和历史快照放这里，用于复盘和模型沉淀', historyRows, 'history');
}

function renderLeagueSections(prefix, desc, rows, bucket) {
  const chunks = [];
  const used = new Set();
  LEAGUE_GROUPS.forEach(([name, re]) => {
    const part = rows.filter((x, idx) => !used.has(idx) && re.test(leagueText(x)));
    if (!part.length && name !== '其他赛事') return;
    part.forEach(x => used.add(rows.indexOf(x)));
    chunks.push(section(`${prefix} · ${name}`, descForLeague(name, desc), part, bucket));
  });
  return chunks.join('');
}

function descForLeague(name, fallback) {
  if (name === '其他赛事') return '欧冠、韩职、日职、联赛杯赛等没有单独命中的赛事，会统一放这里。';
  return fallback;
}

function section(title, desc, rows, bucket) {
  const html = rows.length
    ? rows.map(x => matchCard(x, bucket)).join('')
    : `<div class="empty compact"><strong>暂无数据</strong><p>${safe(bucket === 'today' ? '当前数据源没有返回这个板块的今日赛事。' : '历史数据会从服务器快照和内置数据文件里自动补充。')}</p></div>`;
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

function sourceText(todayCount, historyCount) {
  const countText = `今日赛事 ${todayCount} 场，历史 ${historyCount} 场`;
  if ((meta.mode || '').includes('sporttery')) return `中国体育彩票公开赛事已同步｜${countText}`;
  if ((meta.mode || '').includes('espn')) return `今日公开赛程数据已同步｜${countText}`;
  if ((meta.mode || '').includes('api')) return `授权实时接口今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('openliga')) return `公开数据源今日数据已同步｜${countText}`;
  if ((meta.mode || '').includes('public')) return `公开 JSON 今日数据已同步｜${countText}`;
  return `缓存和历史数据已载入｜${countText}`;
}

function emptyTopPick(todayCount, historyCount) {
  return `<section id="topPick" class="top-pick empty-panel"><strong>${todayCount ? '今日赛事已同步，但暂无可作为主推的未开赛比赛' : '今日暂时没有同步到官方售卖赛事'}</strong><p>${historyCount ? '历史比赛已经在下方归档；今日比赛会按中国体育彩票公开赛事优先读取。' : '如果你确认中国体育彩票今天有赛事，需要检查服务器是否被竞彩网接口拦截。'}</p></section>`;
}

function topPick(x) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const handicap = handicapPick(x);
  return `<section id="topPick" class="top-pick">
    <div class="pick-head"><div><div class="pick-label">今日重点推荐</div><div class="pick-title">${safe(m.home?.name)} vs ${safe(m.away?.name)}</div><div class="pick-time">${matchCode(m, 'today')} ｜ ${safe(m.competition || '足球赛事')} ｜ ${fmt(m.kickoff)}</div></div><span class="pick-badge">${safe(x.risk.label)} · 信心 ${x.confidence}%</span></div>
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
  const closed = isClosed(x);
  return `<article class="match-card ${history ? 'is-history' : ''}">
    <div class="match-main"><div class="match-meta"><div><span class="jc ${history ? 'history-tag' : ''}">${safe(matchCode(m, bucket))}</span>${closed && !history ? '<span class="state-tag">已开赛/待复盘</span>' : ''}</div><div class="league">${safe(m.competition || '足球赛事')}<br><span class="time">${safe(m.stage || '今日赛程')}</span></div><div class="time">${fmt(m.kickoff)}${history ? ' ｜ 历史记录' : ''}</div></div>
      <div class="teams"><div class="team">${teamLogo(m.home)}<div class="team-name">${safe(m.home?.name)}</div></div><div class="vs">VS</div><div class="team">${teamLogo(m.away)}<div class="team-name">${safe(m.away?.name)}</div></div></div>
      <div class="prediction"><div class="result primary"><h3>${history ? '赛前判断回看' : closed ? '赛后归档提示' : '最终方案'}</h3><strong>${safe(closed && !history ? '这场已经开赛或结束，只做今日记录，不再建议购买。' : planText(x))}</strong><p>${safe(x.scheme.backup)}</p></div><div class="result"><h3>胜平负</h3><strong>${safe(spf.label)}</strong><p>${spf.p}% ｜ 防 ${safe(doubleChance.label)}</p></div><div class="result"><h3>让球参考</h3><strong>${safe(handicap)}</strong><p>${history || closed ? '仅作复盘参考' : '按强弱差和风险降级'}</p></div><div class="result"><h3>总进球 / 比分</h3><strong>${safe(goals.label)} ｜ ${safe(score.score)}</strong><p>${goals.p}% ｜ ${score.p}%</p></div></div>
    </div><div class="analysis-panel">${analysisSteps(x, history || closed)}<div class="risk-box"><span class="risk-pill ${x.risk.key}">${safe(x.risk.label)} · ${x.confidence}%</span><h3>风险判断</h3><p>${riskCopy(x, history || closed)}</p></div></div>${factorMatrix(x)}
  </article>`;
}

function analysisSteps(x, history) {
  const m = x.match;
  const spf = x.markets.winDrawLose[0];
  const goals = x.markets.totalGoals.bands[0];
  const score = x.scores[0];
  const rows = [
    ['第一步：比赛状态', history ? `这场 ${fmt(m.kickoff)} 已经进入复盘口径，不能再当作临场购买方案。` : `这场仍在今日赛事里，先确认开赛时间、是否停售、有没有临场阵容。`],
    ['第二步：基本面', `${m.home?.name} 预期进球约 ${x.xg.home}，${m.away?.name} 约 ${x.xg.away}。这里先看进攻效率、失球压力、主客位置和赛程连续性。`],
    ['第三步：盘口思路', `胜平负第一方向是 ${spf.label}，总进球靠近 ${goals.label}，参考比分在 ${score.score} 附近。方向有了，但还要看水位和热度。`],
    ['第四步：风控过滤', `当前风险是${x.risk.label}。伤停、红牌停赛、休息时间、疲劳、天气、受注热度、水位变化这些因子，缺一项都要降权。`],
    ['第五步：落地方案', history ? '历史比赛只做回看，不再给购买动作。' : planText(x)]
  ];
  return `<div class="reason"><h3>${history ? '历史复盘分析' : '逐步分析'}</h3><ol class="step-list">${rows.map(([title, text]) => `<li><b>${safe(title)}</b><span>${safe(text)}</span></li>`).join('')}</ol></div>`;
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
    ['近期状态', homeForm && awayForm, homeForm && awayForm ? '已纳入近况' : '需要近5场数据'],
    ['伤停名单', injuries, injuries ? '有伤停字段' : '需授权伤停源'],
    ['红牌停赛', suspensions, suspensions ? '有停赛字段' : '需官方/数据商'],
    ['休息时间', Boolean(m.home?.lastPlayedAt && m.away?.lastPlayedAt), '看上场时间和间隔'],
    ['赛程连续性', Boolean(m.home?.lastPlayedAt || m.away?.lastPlayedAt), '连赛会拉高疲劳'],
    ['更衣室关系', false, '公开数据无法稳定获取'],
    ['教练私人关系', false, '不能编造，只能人工补充'],
    ['主力私人关系', false, '需人工情报源'],
    ['天气/海拔', Boolean(m.weather && m.venue), `环境影响 ${x.factors.environment}%`],
    ['受注量', market, market ? '已读市场热度' : '需盘口/交易量源'],
    ['热门程度', market, x.market?.hotSide || '需市场数据'],
    ['水位变化', odds || market, odds ? '已有胜平负赔率' : '需外盘接口'],
    ['疲劳值', Boolean(m.home?.travelKm || m.away?.travelKm || m.home?.lastPlayedAt), `不确定性 ${x.factors.uncertainty}%`],
    ['教练战术', Boolean(m.tactical), '节奏/压迫已预留'],
    ['联赛排名', Boolean(m.home?.rank && m.away?.rank), '用于强弱修正'],
    ['外盘数据', odds, odds ? '已接基础赔率' : '需授权外盘源']
  ];
  return `<div class="factor-panel"><h3>博彩风控因子</h3><div class="factor-grid-v2">${factors.map(([name, ok, note]) => `<div class="factor-chip ${ok ? 'ok' : 'missing'}"><b>${safe(name)}</b><span>${ok ? '已接入' : '待接入'}</span><em>${safe(note)}</em></div>`).join('')}</div></div>`;
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
  if (history) return `这场只做复盘，不作为今日购买方案。赛前风险约 ${x.factors.uncertainty}%，环境影响 ${x.factors.environment}%。`;
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
document.querySelectorAll('.tab').forEach(btn => { btn.onclick = () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); btn.classList.add('active'); riskFilter = btn.dataset.risk; render(); }; });
load(true);
setInterval(() => load(true), AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
