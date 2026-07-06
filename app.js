import { analyzeMatch, rankAnalyses } from './model.js';

const $ = id => document.getElementById(id);
let rows = [];
let currentId = '';

const demoMatches = [
  {
    id: 'm1', competition: '国际足球', stage: '小组赛', neutral: false,
    kickoff: new Date(Date.now() + 6 * 3600000).toISOString(),
    venue: { name: '阿兹特克球场', city: 'Mexico City', altitudeM: 2240 },
    home: { name: '墨西哥', rank: 15, lastPlayedAt: new Date(Date.now() - 5 * 86400000).toISOString(), travelKm: 120, form: [{result:'W',gf:2,ga:0},{result:'D',gf:1,ga:1},{result:'W',gf:3,ga:1},{result:'L',gf:0,ga:1},{result:'W',gf:2,ga:1}], injuries: [{ role:'starter', impact:.05 }], suspensions: [], publicSentiment: { score:.12, reliability:.35 } },
    away: { name: '南非', rank: 58, lastPlayedAt: new Date(Date.now() - 4 * 86400000).toISOString(), travelKm: 4100, form: [{result:'D',gf:1,ga:1},{result:'W',gf:1,ga:0},{result:'L',gf:0,ga:2},{result:'D',gf:0,ga:0},{result:'L',gf:1,ga:3}], injuries: [], suspensions: [{ role:'starter', impact:.07 }], publicSentiment: { score:-.08, reliability:.3 } },
    weather: { tempC: 22, humidity: 45, windKph: 11, rainMm: 0 }, tactical: { tempo: -.3, press: .2 }
  },
  {
    id: 'm2', competition: '国际足球', stage: '小组赛', neutral: true,
    kickoff: new Date(Date.now() + 9 * 3600000).toISOString(),
    venue: { name: 'BMO Field', city: 'Toronto', altitudeM: 76 },
    home: { name: '韩国', rank: 23, lastPlayedAt: new Date(Date.now() - 3 * 86400000).toISOString(), travelKm: 3200, form: [{result:'W',gf:2,ga:1},{result:'W',gf:3,ga:0},{result:'D',gf:1,ga:1},{result:'L',gf:0,ga:1},{result:'W',gf:2,ga:0}], injuries: [{ role:'rotation', impact:.03 }], suspensions: [], publicSentiment: { score:.05, reliability:.25 } },
    away: { name: '捷克', rank: 35, lastPlayedAt: new Date(Date.now() - 6 * 86400000).toISOString(), travelKm: 1100, form: [{result:'D',gf:1,ga:1},{result:'L',gf:0,ga:1},{result:'W',gf:2,ga:0},{result:'W',gf:3,ga:1},{result:'D',gf:1,ga:1}], injuries: [], suspensions: [], publicSentiment: { score:.02, reliability:.2 } },
    weather: { tempC: 18, humidity: 64, windKph: 19, rainMm: 1.2 }, tactical: { tempo: .2, press: .1 }
  },
  {
    id: 'm3', competition: '国际足球', stage: '小组赛', neutral: false,
    kickoff: new Date(Date.now() + 12 * 3600000).toISOString(),
    venue: { name: 'BC Place', city: 'Vancouver', altitudeM: 2 },
    home: { name: '加拿大', rank: 31, lastPlayedAt: new Date(Date.now() - 4 * 86400000).toISOString(), travelKm: 300, form: [{result:'W',gf:2,ga:0},{result:'L',gf:1,ga:2},{result:'D',gf:1,ga:1},{result:'W',gf:2,ga:1},{result:'W',gf:3,ga:2}], injuries: [], suspensions: [], publicSentiment: { score:.18, reliability:.4 } },
    away: { name: '波黑', rank: 62, lastPlayedAt: new Date(Date.now() - 4 * 86400000).toISOString(), travelKm: 8400, form: [{result:'L',gf:0,ga:2},{result:'D',gf:1,ga:1},{result:'L',gf:1,ga:3},{result:'W',gf:2,ga:1},{result:'L',gf:1,ga:2}], injuries: [{ role:'starter', impact:.11 }], suspensions: [], publicSentiment: { score:-.16, reliability:.42 } },
    weather: { tempC: 16, humidity: 70, windKph: 9, rainMm: .5 }, tactical: { tempo: .4, press: .35 }
  }
];

function load() {
  rows = demoMatches.map(analyzeMatch);
  currentId = rows[0].id;
  renderSources();
  render();
}

function renderSources() {
  $('sourceStatus').innerHTML = [
    ['赛程排名', '已接入模型输入层'], ['近期状态', '近场战绩自动计算'], ['伤停疲劳', '支持接口字段'], ['天气海拔', '支持环境修正']
  ].map(x => `<div class="status-card"><strong>${x[0]}</strong><p>${x[1]}</p><span class="status-pill status-demo">V2</span></div>`).join('');
  $('lastUpdated').textContent = `最近更新：${new Date().toLocaleString()}｜当前为演示数据，接入接口后自动刷新真实赛事`;
}

function render() {
  const risk = $('riskFilter').value;
  const sort = $('sortBy').value;
  const visible = rankAnalyses(rows.filter(x => risk === 'all' || x.risk.key === risk), sort);
  $('matchList').innerHTML = visible.map(x => `<article class="match-card ${x.id===currentId?'active':''}" data-id="${x.id}"><div class="match-card-title"><div class="teams">${x.match.home.name}<br>vs ${x.match.away.name}</div><span class="badge ${x.risk.key}">${x.risk.label}</span></div><div class="meta">${x.match.competition}｜${fmt(x.match.kickoff)}<br>信心 ${x.confidence}%｜${x.direction.label}</div></article>`).join('');
  document.querySelectorAll('.match-card').forEach(el => el.onclick = () => { currentId = el.dataset.id; render(); });
  showDetail(rows.find(x => x.id === currentId) || visible[0]);
}

function showDetail(x) {
  if (!x) return;
  const m = x.match;
  $('matchDetail').innerHTML = `<div class="detail-header"><div><div class="detail-title">${m.home.name} vs ${m.away.name}</div><div class="kickoff">${m.stage}｜${fmt(m.kickoff)}｜${m.venue.name}</div></div><span class="badge ${x.risk.key}">${x.risk.label} · 信心 ${x.confidence}%</span></div>
  <div class="prob-grid"><div class="prob-card"><h3>主队方向</h3><div class="num">${x.probabilities.home}%</div><div class="progress"><span style="width:${x.probabilities.home}%"></span></div></div><div class="prob-card"><h3>平局</h3><div class="num">${x.probabilities.draw}%</div><div class="progress"><span style="width:${x.probabilities.draw}%"></span></div></div><div class="prob-card"><h3>客队方向</h3><div class="num">${x.probabilities.away}%</div><div class="progress"><span style="width:${x.probabilities.away}%"></span></div></div></div>
  <div class="edge-box"><strong>主结论：</strong>${x.direction.label}｜总进球高概率区间：${x.goals.main.join(' / ')} 球｜补充观察：${x.goals.backup.join(' / ')} 球<br><span class="small">${x.risk.text}。模型输出概率与风险，不承诺确定赛果。</span></div>
  <div class="metric-grid"><div class="metric-card"><h3>预期进球</h3><div class="num">${x.xg.home} : ${x.xg.away}</div><p>由近期状态、排名、伤停、疲劳、天气修正。</p></div><div class="metric-card"><h3>环境折损</h3><div class="num">${x.factors.environment}%</div><p>温度、湿度、风速、降雨、海拔。</p></div><div class="metric-card"><h3>不确定性</h3><div class="num">${x.factors.uncertainty}%</div><p>数据缺失和信号冲突越多，数值越高。</p></div></div>
  <div class="factor-grid"><div class="factor-card"><h3>基本面</h3><ul><li>主队排名：${m.home.rank}</li><li>客队排名：${m.away.rank}</li></ul></div><div class="factor-card"><h3>伤停/停赛</h3><ul><li>主队伤停 ${m.home.injuries.length}，停赛 ${m.home.suspensions.length}</li><li>客队伤停 ${m.away.injuries.length}，停赛 ${m.away.suspensions.length}</li></ul></div><div class="factor-card"><h3>天气/海拔</h3><ul><li>${m.weather.tempC}℃｜湿度 ${m.weather.humidity}%｜风速 ${m.weather.windKph}km/h</li><li>海拔 ${m.venue.altitudeM}m</li></ul></div><div class="factor-card"><h3>公开信号</h3><ul>${x.explanation.map(v=>`<li>${v}</li>`).join('')}</ul></div></div>
  <h2>最可能比分</h2><div class="score-grid">${x.scores.map(s=>`<div class="score-chip"><strong>${s.score}</strong><span>${s.p}%</span></div>`).join('')}</div>`;
}

function fmt(v) { return new Date(v).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
$('refreshBtn').onclick = load;
$('demoBtn').onclick = load;
$('riskFilter').onchange = render;
$('sortBy').onchange = render;
load();
