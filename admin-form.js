const $ = id => document.getElementById(id);
let data = null;
let currentId = '';

function status(text) { $('statusBox').textContent = text; }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function val(id, value) { if (value === undefined) return $(id).value.trim(); $(id).value = value ?? ''; }

async function loadData() {
  try {
    const res = await fetch('/api/matches', { cache: 'no-store' });
    if (!res.ok) throw new Error('api error');
    data = await res.json();
    currentId = data.matches?.[0]?.id || '';
    renderList();
    fillForm(getCurrent());
    status(`已从服务器读取\n模式：${data.mode}\n赛事：${data.matches.length} 场`);
  } catch (err) {
    status('读取失败：' + err.message);
  }
}

function getCurrent() { return data?.matches?.find(m => m.id === currentId); }

function renderList() {
  const box = $('matchList');
  box.innerHTML = (data.matches || []).map(m => `
    <button class="match-item ${m.id === currentId ? 'active' : ''}" data-id="${escapeHtml(m.id)}">
      <strong>${escapeHtml(m.home?.name || '-')} vs ${escapeHtml(m.away?.name || '-')}</strong>
      <span>${escapeHtml(m.competition || '')}｜${escapeHtml(m.kickoff || '')}</span>
    </button>
  `).join('');
  document.querySelectorAll('.match-item').forEach(btn => {
    btn.onclick = () => {
      currentId = btn.dataset.id;
      renderList();
      fillForm(getCurrent());
    };
  });
}

function formToText(rows = []) {
  return rows.map(x => `${x.result || 'D'},${x.gf ?? 0},${x.ga ?? 0}`).join('\n');
}
function textToForm(text) {
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const [result = 'D', gf = '0', ga = '0'] = line.split(',').map(x => x.trim());
    return { result: result.toUpperCase(), gf: num(gf), ga: num(ga) };
  });
}
function peopleToText(rows = []) {
  return rows.map(x => `${x.name || ''},${x.role || 'rotation'},${x.impact ?? 0.03}`).join('\n');
}
function textToPeople(text) {
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const [name = '', role = 'rotation', impact = '0.03'] = line.split(',').map(x => x.trim());
    return { name, role, impact: num(impact, 0.03) };
  });
}

function fillForm(m) {
  if (!m) return;
  val('id', m.id);
  val('competition', m.competition);
  val('stage', m.stage);
  val('kickoff', m.kickoff);
  val('neutral', String(Boolean(m.neutral)));
  val('venueName', m.venue?.name);
  val('venueCity', m.venue?.city);
  val('altitudeM', m.venue?.altitudeM);
  val('note', m.note || '');

  fillTeam('home', m.home || {});
  fillTeam('away', m.away || {});

  val('tempC', m.weather?.tempC);
  val('humidity', m.weather?.humidity);
  val('windKph', m.weather?.windKph);
  val('rainMm', m.weather?.rainMm);
  val('tempo', m.tactical?.tempo);
  val('press', m.tactical?.press);
}

function fillTeam(side, team) {
  val(side + 'Name', team.name);
  val(side + 'Rank', team.rank);
  val(side + 'LastPlayedAt', team.lastPlayedAt);
  val(side + 'TravelKm', team.travelKm);
  val(side + 'Form', formToText(team.form || []));
  val(side + 'Injuries', peopleToText(team.injuries || []));
  val(side + 'Suspensions', peopleToText(team.suspensions || []));
  val(side + 'SignalScore', team.publicSentiment?.score ?? 0);
  val(side + 'SignalReliability', team.publicSentiment?.reliability ?? 0);
  val(side + 'Memo', team.memo || '');
}

function collectMatch() {
  return {
    id: val('id') || `match-${Date.now()}`,
    competition: val('competition') || '国际足球',
    stage: val('stage') || '小组赛',
    kickoff: val('kickoff'),
    neutral: val('neutral') === 'true',
    venue: { name: val('venueName'), city: val('venueCity'), altitudeM: num(val('altitudeM')) },
    note: val('note'),
    home: collectTeam('home'),
    away: collectTeam('away'),
    weather: { tempC: num(val('tempC'), 22), humidity: num(val('humidity'), 55), windKph: num(val('windKph'), 8), rainMm: num(val('rainMm'), 0) },
    tactical: { tempo: num(val('tempo'), 0), press: num(val('press'), 0) }
  };
}
function collectTeam(side) {
  return {
    name: val(side + 'Name'),
    rank: num(val(side + 'Rank'), 60),
    lastPlayedAt: val(side + 'LastPlayedAt'),
    travelKm: num(val(side + 'TravelKm'), 0),
    form: textToForm(val(side + 'Form')),
    injuries: textToPeople(val(side + 'Injuries')),
    suspensions: textToPeople(val(side + 'Suspensions')),
    publicSentiment: { score: num(val(side + 'SignalScore'), 0), reliability: num(val(side + 'SignalReliability'), 0) },
    memo: val(side + 'Memo')
  };
}

function saveCurrentToMemory() {
  if (!data) return '请先读取数据';
  const m = collectMatch();
  if (!m.home.name || !m.away.name) return '请填写主队和客队';
  if (!m.kickoff) return '请填写开球时间';
  const idx = data.matches.findIndex(x => x.id === currentId);
  if (idx >= 0) data.matches[idx] = m;
  else data.matches.push(m);
  currentId = m.id;
  data.updatedAt = new Date().toISOString();
  data.mode = data.mode || 'internal-data-file';
  return '';
}

async function saveToServer() {
  const token = val('tokenInput');
  if (!token) return status('请先输入后台口令。');
  const err = saveCurrentToMemory();
  if (err) return status(err);
  try {
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok || !result.ok) return status('保存失败：' + (result.message || res.status));
    renderList();
    status(`保存成功\n更新时间：${result.updatedAt}\n赛事数量：${result.count}\n回前台点击自动刷新数据即可看到结果。`);
  } catch (err) {
    status('保存异常：' + err.message);
  }
}

function newMatch() {
  if (!data) data = { updatedAt: new Date().toISOString(), mode: 'internal-data-file', sources: [], matches: [] };
  const id = `internal-${Date.now()}`;
  const m = {
    id, competition: '国际足球', stage: '小组赛', kickoff: new Date().toISOString(), neutral: true,
    venue: { name: '待填写球场', city: '待填写城市', altitudeM: 0 },
    home: { name: '主队', rank: 60, lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 } },
    away: { name: '客队', rank: 60, lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 } },
    weather: { tempC: 22, humidity: 55, windKph: 8, rainMm: 0 },
    tactical: { tempo: 0, press: 0 }
  };
  data.matches.unshift(m);
  currentId = id;
  renderList();
  fillForm(m);
  status('已新增比赛，填写后点保存。');
}

function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$('loadBtn').onclick = loadData;
$('saveBtn').onclick = saveToServer;
$('newBtn').onclick = newMatch;
$('jsonBtn').onclick = () => location.href = './admin.html?admin2';
$('frontBtn').onclick = () => location.href = './?phase2';
loadData();
