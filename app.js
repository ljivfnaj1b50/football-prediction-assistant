import { analyzeMatch, rankAnalyses } from './model.js';

const $ = id => document.getElementById(id);
let rows = [];
let currentId = '';
let meta = { updatedAt: new Date().toISOString(), mode: 'loading', sources: [] };

async function load() {
  try {
    const res = await fetch('./data/matches.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('data not found');
    const payload = await res.json();
    meta = payload;
    rows = (payload.matches || []).map(analyzeMatch);
  } catch (err) {
    meta = { updatedAt: new Date().toISOString(), mode: 'error', sources: [{ name: '数据文件', status: 'error', detail: '读取失败，请检查 data/matches.json' }] };
    rows = [];
  }
  currentId = rows[0]?.id || '';
  renderSources();
  render();
}

function renderSources() {
  const sources = meta.sources || [];
  $('sourceStatus').innerHTML = sources.map(s => `<div class="status-card"><strong>${safe(s.name)}</strong><p>${safe(s.detail || '')}</p><span class="status-pill status-${safe(s.status || 'demo')}">${safe(s.status || 'V2')}</span></div>`).join('');
  $('lastUpdated').textContent = `最近更新：${fmt(meta.updatedAt)}｜模式：${safe(meta.mode || 'server')}｜赛事 ${rows.length} 场`;
}

function render() {
  const risk = $('riskFilter').value;
  const sort = $('sortBy').value;
  const visible = rankAnalyses(rows.filter(x => risk === 'all' || x.risk.key === risk), sort);
  $('matchList').innerHTML = visible.map(x => card(x)).join('') || '<p>暂无数据。</p>';
  document.querySelectorAll('.match-card').forEach(el => el.onclick = () => { currentId = el.dataset.id; render(); });
  show(rows.find(x => x.id === currentId) || visible[0]);
}

function card(x) {
  return `<article class="match-card ${x.id===currentId?'active':''}" data-id="${x.id}"><div class="match-card-title"><div class="teams">${safe(x.match.home.name)}<br>vs ${safe(x.match.away.name)}</div><span class="badge ${x.risk.key}">${safe(x.risk.label)}</span></div><div class="meta">${safe(x.match.competition)}｜${fmt(x.match.kickoff)}<br>信心 ${x.confidence}%｜${safe(x.direction.label)}</div></article>`;
}

function show(x) {
  if (!x) {
    $('matchDetail').innerHTML = '<div class="empty-state"><h2>暂无赛事数据</h2><p>请检查服务器数据文件。</p></div>';
    return;
  }
  const m = x.match;
  $('matchDetail').innerHTML = `<div class="detail-header"><div><div class="detail-title">${safe(m.home.name)} vs ${safe(m.away.name)}</div><div class="kickoff">${safe(m.stage)}｜${fmt(m.kickoff)}｜${safe(m.venue.name)}</div></div><span class="badge ${x.risk.key}">${safe(x.risk.label)} · 信心 ${x.confidence}%</span></div>
  <div class="prob-grid"><div class="prob-card"><h3>主队</h3><div class="num">${x.probabilities.home}%</div><div class="progress"><span style="width:${x.probabilities.home}%"></span></div></div><div class="prob-card"><h3>平局</h3><div class="num">${x.probabilities.draw}%</div><div class="progress"><span style="width:${x.probabilities.draw}%"></span></div></div><div class="prob-card"><h3>客队</h3><div class="num">${x.probabilities.away}%</div><div class="progress"><span style="width:${x.probabilities.away}%"></span></div></div></div>
  <div class="edge-box"><strong>综合结论：</strong>${safe(x.direction.label)}｜高概率区间：${x.goals.main.join(' / ')}｜补充观察：${x.goals.backup.join(' / ')}<br><span class="small">${safe(x.risk.text)}</span></div>
  <div class="metric-grid"><div class="metric-card"><h3>预期进球</h3><div class="num">${x.xg.home} : ${x.xg.away}</div><p>近期状态、排名、人员、疲劳、环境综合修正。</p></div><div class="metric-card"><h3>环境折损</h3><div class="num">${x.factors.environment}%</div><p>温度、湿度、风速、降雨、海拔。</p></div><div class="metric-card"><h3>不确定性</h3><div class="num">${x.factors.uncertainty}%</div><p>数据缺失和信号冲突越多，数值越高。</p></div></div>
  <div class="factor-grid"><div class="factor-card"><h3>基本面</h3><ul><li>主队排名：${m.home.rank}</li><li>客队排名：${m.away.rank}</li></ul></div><div class="factor-card"><h3>人员状态</h3><ul><li>主队记录 ${(m.home.injuries||[]).length}，停赛 ${(m.home.suspensions||[]).length}</li><li>客队记录 ${(m.away.injuries||[]).length}，停赛 ${(m.away.suspensions||[]).length}</li></ul></div><div class="factor-card"><h3>天气/海拔</h3><ul><li>${m.weather.tempC}℃｜湿度 ${m.weather.humidity}%｜风速 ${m.weather.windKph}km/h</li><li>海拔 ${m.venue.altitudeM}m</li></ul></div><div class="factor-card"><h3>模型提醒</h3><ul>${x.explanation.map(v=>`<li>${safe(v)}</li>`).join('')}</ul></div></div>
  <h2>比分分布</h2><div class="score-grid">${x.scores.map(s=>`<div class="score-chip"><strong>${s.score}</strong><span>${s.p}%</span></div>`).join('')}</div>`;
}

function fmt(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : String(v || ''); }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('refreshBtn').onclick = load;
$('demoBtn').onclick = load;
$('riskFilter').onchange = render;
$('sortBy').onchange = render;
load();
