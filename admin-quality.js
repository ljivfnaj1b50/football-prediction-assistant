const $ = id => document.getElementById(id);
const clean = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const present = v => v !== undefined && v !== null && v !== '';

function setSummary(text) {
  $('summaryBox').textContent = text;
}

function inspectOne(m) {
  const items = [
    ['主客队', present(m.home?.name) && present(m.away?.name)],
    ['开球时间', present(m.kickoff)],
    ['赛事阶段', present(m.competition) && present(m.stage)],
    ['球场城市', present(m.venue?.name) && present(m.venue?.city)],
    ['海拔', Number.isFinite(Number(m.venue?.altitudeM))],
    ['排名', Number.isFinite(Number(m.home?.rank)) && Number.isFinite(Number(m.away?.rank))],
    ['主队近5场', Array.isArray(m.home?.form) && m.home.form.length >= 5],
    ['客队近5场', Array.isArray(m.away?.form) && m.away.form.length >= 5],
    ['上场时间', present(m.home?.lastPlayedAt) && present(m.away?.lastPlayedAt)],
    ['旅行距离', Number.isFinite(Number(m.home?.travelKm)) && Number.isFinite(Number(m.away?.travelKm))],
    ['伤停数组', Array.isArray(m.home?.injuries) && Array.isArray(m.away?.injuries)],
    ['停赛数组', Array.isArray(m.home?.suspensions) && Array.isArray(m.away?.suspensions)],
    ['天气字段', Number.isFinite(Number(m.weather?.tempC)) && Number.isFinite(Number(m.weather?.humidity)) && Number.isFinite(Number(m.weather?.windKph))],
    ['战术字段', Number.isFinite(Number(m.tactical?.tempo)) && Number.isFinite(Number(m.tactical?.press))]
  ];
  const pass = items.filter(x => x[1]).length;
  return { score: Math.round(pass / items.length * 100), items };
}

async function runCheck() {
  try {
    const res = await fetch('./data/matches.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const rows = data.matches || [];
    const reports = rows.map(m => ({ match: m, ...inspectOne(m) }));
    const avg = reports.length ? Math.round(reports.reduce((s, r) => s + r.score, 0) / reports.length) : 0;
    setSummary(`读取来源：前台数据文件\n赛事数量：${reports.length}\n平均完整度：${avg}%`);
    $('reportBox').innerHTML = reports.map(r => {
      const cls = r.score >= 90 ? '' : (r.score >= 80 ? 'warn' : 'bad');
      return `<article class="report-item"><div class="report-title"><div><h2>${clean(r.match.home?.name)} vs ${clean(r.match.away?.name)}</h2><p>${clean(r.match.kickoff)}</p></div><span class="score ${cls}">${r.score}%</span></div><div class="check-grid">${r.items.map(x => `<div class="check ${x[1] ? 'ok' : 'bad'}">${x[1] ? '✓' : '✗'} ${clean(x[0])}</div>`).join('')}</div></article>`;
    }).join('');
  } catch (err) {
    setSummary('质检失败：' + err.message);
  }
}

$('loadBtn').onclick = runCheck;
$('formBtn').onclick = () => location.href = './admin-form.html?form2';
$('consoleBtn').onclick = () => location.href = './admin-home.html?console2';
setSummary('等待质检。');
