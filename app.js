import { analyzeMatch, rankAnalyses } from './model.js';

const $ = id => document.getElementById(id);
const AUTO_REFRESH_MS = 5 * 60 * 1000;
let rows = [];
let currentId = '';
let meta = { updatedAt: new Date().toISOString(), mode: 'loading', sources: [] };
let loading = false;

function injectV2Style() {
  if (document.querySelector('link[href*="front-v2.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './front-v2.css?v=v2-pro';
  document.head.appendChild(link);
}

async function load(force = false) {
  if (loading) return;
  loading = true;
  injectV2Style();
  try {
    const query = force ? '?force=1&ts=' : '?ts=';
    let res = await fetch('/api/public-feed' + query + Date.now(), { cache: 'no-store' });
    if (!res.ok) res = await fetch('./data/matches.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('data not found');
    const payload = await res.json();
    meta = payload;
    rows = (payload.matches || []).map(analyzeMatch);
    if (!rows.find(x => x.id === currentId)) currentId = rows[0]?.id || '';
  } catch (err) {
    meta = { updatedAt: new Date().toISOString(), mode: 'error', sources: [{ name: '数据源', status: 'error', detail: '读取失败：' + err.message }] };
    rows = [];
    currentId = '';
  } finally {
    loading = false;
  }
  renderSources();
  render();
}

function renderSources() {
  const sources = meta.sources || [];
  $('sourceStatus').innerHTML = sources.map(s => `<div class="status-card"><strong>${safe(s.name)}</strong><p>${safe(s.detail || '')}</p><span class="status-pill status-${safe(s.status || 'demo')}">${safe(s.status || 'V2')}</span></div>`).join('');
  const sourceName = meta.live?.noKeySource ? '无Key公开数据源' : (meta.live?.enabled ? '实时接口' : '内部缓存');
  const liveText = `${sourceName}｜自动刷新：已开启｜${safe(meta.mode || '-')}`;
  setText('liveMode', liveText);
  setText('lastUpdated', `最近更新：${fmt(meta.updatedAt)}｜赛事 ${rows.length} 场｜下次自动刷新约 ${Math.round(AUTO_REFRESH_MS / 60000)} 分钟`);
  setText('matchCount', rows.length);
  setText('lowRiskCount', rows.filter(x => x.risk.key === 'low').length);
  setText('avgConfidence', rows.length ? Math.round(rows.reduce((s, x) => s + x.confidence, 0) / rows.length) + '%' : '0%');
  setText('listHint', `${rows.length} 场`);
}

function render() {
  const risk = $('riskFilter').value;
  const sort = $('sortBy').value;
  const visible = rankAnalyses(rows.filter(x => risk === 'all' || x.risk.key === risk), sort);
  $('matchList').innerHTML = visible.map(x => card(x)).join('') || '<p>暂无数据。</p>';
  document.querySelectorAll('.match-card').forEach(el => el.onclick = () => { currentId = el.dataset.id; render(); });
  show(rows.find(x => x.id === currentId) || visible[0]);
}

function teamLogo(team) {
  const src = team.logo || team.crest || team.flag || '';
  if (src) return `<img class="logo" src="${safe(src)}" alt="${safe(team.name)}" onerror="this.outerHTML='<div class=&quot;logo&quot;>${initial(team.name)}</div>'">`;
  return `<div class="logo">${initial(team.name)}</div>`;
}
function flag(team) { return team.flag ? `<img class="flag" src="${safe(team.flag)}" alt="flag">` : ''; }
function initial(name='') { return safe(String(name).slice(0,1) || '队'); }

function card(x) {
  const m = x.match;
  return `<article class="match-card ${x.id===currentId?'active':''}" data-id="${safe(x.id)}">
    <div class="card-teams">
      <div class="team-mini">${teamLogo(m.home)}<div><strong>${safe(m.home.name)}</strong><br>${flag(m.home)}</div></div>
      <div class="vs">VS</div>
      <div class="team-mini away">${teamLogo(m.away)}<div><strong>${safe(m.away.name)}</strong><br>${flag(m.away)}</div></div>
    </div>
    <div class="card-meta"><span>${safe(m.competition)}｜${fmt(m.kickoff)}</span><span class="badge ${x.risk.key}">${safe(x.risk.label)}</span></div>
    <div class="small">${safe(x.scheme.text)}｜信心 ${x.confidence}%</div>
  </article>`;
}

function marketCard(title, rows, primaryKey) {
  return `<div class="market-card ${primaryKey ? 'primary' : ''}"><h3>${safe(title)}</h3>${rows.map((r) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${safe(r.label)}</strong><span>${r.p}%</span></div><div class="progress"><span style="width:${clamp(r.p,0,100)}%"></span></div></div>`).join('')}</div>`;
}

function playerCards(team) {
  const players = team.keyPlayers || team.players || [];
  const list = players.length ? players.slice(0, 4) : [
    { name: '核心球员', role: '待接口补充' },
    { name: '关键替补', role: '待接口补充' }
  ];
  return list.map(p => `<div class="player-card">${p.photo ? `<img class="avatar" src="${safe(p.photo)}" onerror="this.outerHTML='<div class=&quot;avatar&quot;>${initial(p.name)}</div>'">` : `<div class="avatar">${initial(p.name)}</div>`}<div><strong>${safe(p.name)}</strong><p>${safe(p.role || p.position || '')}</p></div></div>`).join('');
}

function show(x) {
  if (!x) {
    $('matchDetail').innerHTML = '<div class="empty-state panel"><h2>暂无赛事数据</h2><p>请检查服务器数据源。</p></div>';
    return;
  }
  const m = x.match;
  const winRows = x.markets.winDrawLose;
  const doubleRows = x.markets.doubleChance;
  const goalRows = x.markets.totalGoals.bands;
  const exactGoalRows = x.markets.totalGoals.exact.slice(0, 7).map(v => ({ label: v.label + '球', p: v.p }));

  $('matchDetail').innerHTML = `<div class="detail-shell">
    <section class="match-hero">
      <div class="match-hero-top">
        <div><div class="eyebrow">MATCH ANALYSIS</div><h2>${safe(m.competition)}｜${safe(m.stage || '')}</h2><p class="kickoff">${fmt(m.kickoff)}｜${safe(m.venue?.name || '')}｜${safe(m.venue?.city || '')}</p></div>
        <span class="badge ${x.risk.key}">${safe(x.risk.label)} · 信心 ${x.confidence}%</span>
      </div>
      <div class="big-teams">
        <div class="big-team">${teamLogo(m.home)}<strong>${safe(m.home.name)}</strong>${flag(m.home)}</div>
        <div class="vs">VS</div>
        <div class="big-team">${teamLogo(m.away)}<strong>${safe(m.away.name)}</strong>${flag(m.away)}</div>
      </div>
    </section>

    <section class="scheme-box">
      <h2>最终综合方案：${safe(x.scheme.level)}</h2>
      <p><strong>${safe(x.scheme.primary)}</strong></p>
      <p>${safe(x.scheme.backup)}</p>
      <p class="small">${safe(x.risk.text)}</p>
    </section>

    <section class="market-grid">
      ${marketCard('胜平负概率', winRows, true)}
      ${marketCard('双选防线', doubleRows, false)}
      ${marketCard('总进球区间', goalRows, false)}
    </section>

    <section class="market-grid">
      ${marketCard('精确总进球', exactGoalRows, false)}
      <div class="market-card"><h3>大小球倾向</h3><div class="num">${x.markets.totalGoals.over25}%</div><p>大于2.5球概率</p><div class="progress"><span style="width:${x.markets.totalGoals.over25}%"></span></div><p class="small">小于2.5球：${x.markets.totalGoals.under25}%｜小于3.5球：${x.markets.totalGoals.under35}%</p></div>
      <div class="market-card"><h3>预期进球</h3><div class="num">${x.xg.home} : ${x.xg.away}</div><p>综合近期状态、排名、人员、疲劳、环境修正。</p></div>
    </section>

    <section class="two-col">
      <div class="panel"><h2>详细分析原因</h2><ul class="reason-list">${x.explanation.map(v=>`<li>${safe(v)}</li>`).join('')}</ul></div>
      <div class="panel"><h2>关键因子</h2><div class="factor-grid"><div class="factor-card"><h3>环境</h3><div class="num">${x.factors.environment}%</div></div><div class="factor-card"><h3>主队折损</h3><div class="num">${x.factors.homeDrag}%</div></div><div class="factor-card"><h3>客队折损</h3><div class="num">${x.factors.awayDrag}%</div></div><div class="factor-card"><h3>不确定性</h3><div class="num">${x.factors.uncertainty}%</div></div></div></div>
    </section>

    <section class="panel"><h2>队员照片 / 关键球员</h2><div class="player-grid">${playerCards(m.home)}${playerCards(m.away)}</div><p class="small">球员照片需要第三方数据源返回 photo 字段；未接入时显示占位头像。</p></section>

    <section class="panel"><h2>比分分布</h2><div class="score-grid">${x.scores.map(s=>`<div class="score-chip"><strong>${s.score}</strong><span>${s.p}%</span></div>`).join('')}</div></section>
  </div>`;
}

function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function fmt(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || ''); }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, Number(n)||0)); }

$('refreshBtn').onclick = () => load(true);
$('demoBtn').onclick = () => load(false);
$('riskFilter').onchange = render;
$('sortBy').onchange = render;
load(true);
setInterval(() => load(true), AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
