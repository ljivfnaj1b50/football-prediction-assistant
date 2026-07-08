const https = require('https');

const SPORTTERY_MATCH_URL = process.env.SPORTTERY_MATCH_URL || 'https://webapi.sporttery.cn/gateway/jc/football/getMatchListV1.qry?clientCode=3001';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 JingxiFootball/4.0',
        'Accept': 'application/json,text/plain,*/*',
        'Referer': 'https://www.sporttery.cn/'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('sporttery json parse failed')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('sporttery timeout')));
  });
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

function collectRows(input, rows = []) {
  if (!input) return rows;
  if (Array.isArray(input)) {
    input.forEach(item => collectRows(item, rows));
    return rows;
  }
  if (typeof input !== 'object') return rows;
  const home = pick(input, ['homeTeamName', 'homeTeam', 'h_cn', 'hostName', 'home', 'teamHName']);
  const away = pick(input, ['awayTeamName', 'awayTeam', 'a_cn', 'guestName', 'away', 'teamAName']);
  if (home && away) rows.push(input);
  Object.values(input).forEach(value => {
    if (value && typeof value === 'object') collectRows(value, rows);
  });
  return rows;
}

function toChinaDay(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function normalizeKickoff(row) {
  const raw = pick(row, ['kickoff', 'matchDateTime', 'matchDate', 'date'], '');
  const time = pick(row, ['matchTime', 'time', 'startTime'], '');
  let text = String(raw || '').trim();
  if (text && time && !/\d{1,2}:\d{2}/.test(text)) text = `${text} ${time}`;
  if (!text && time) text = `${toChinaDay()} ${time}`;
  if (/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/.test(text)) return text.replace(' ', 'T') + ':00+08:00';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text + 'T12:00:00+08:00';
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function normalizeOdds(raw) {
  const box = raw?.had || raw?.hhad || raw?.spf || raw?.odds || raw || {};
  const home = Number(pick(box, ['h', 'home', 'win', 'sp3', 'fixedOddsH'], 0));
  const draw = Number(pick(box, ['d', 'draw', 'sp1', 'fixedOddsD'], 0));
  const away = Number(pick(box, ['a', 'away', 'lose', 'sp0', 'fixedOddsA'], 0));
  return home && draw && away ? { h2h: { home, draw, away } } : {};
}

function normalizeLogo(v) {
  return String(v || '').replace(/^http:/, 'https:');
}

function mapSporttery(row, index = 0) {
  const matchId = pick(row, ['matchId', 'id', 'mid', 'matchNo'], `sporttery-${index}`);
  const num = pick(row, ['matchNumStr', 'matchNum', 'num', 'issueNum', 'matchSerialNo'], '待编号');
  const league = pick(row, ['leagueName', 'l_cn', 'league', 'competition'], '竞彩足球');
  const home = pick(row, ['homeTeamName', 'homeTeam', 'h_cn', 'hostName', 'home', 'teamHName'], '主队');
  const away = pick(row, ['awayTeamName', 'awayTeam', 'a_cn', 'guestName', 'away', 'teamAName'], '客队');
  return {
    id: `sporttery-${matchId}`,
    sourceId: matchId,
    jcNum: num,
    competition: league,
    stage: pick(row, ['matchWeek', 'round', 'stage'], '竞足'),
    kickoff: normalizeKickoff(row),
    status: pick(row, ['matchStatus', 'status', 'saleStatus'], '销售中'),
    neutral: false,
    venue: { name: pick(row, ['venue', 'stadium'], ''), city: '', altitudeM: 0 },
    home: { name: home, rank: 60, logo: normalizeLogo(pick(row, ['homeLogo', 'h_logo', 'homeTeamLogo'], '')), flag: '', lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 }, keyPlayers: [] },
    away: { name: away, rank: 60, logo: normalizeLogo(pick(row, ['awayLogo', 'a_logo', 'awayTeamLogo'], '')), flag: '', lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 }, keyPlayers: [] },
    weather: { tempC: 22, humidity: 55, windKph: 8, rainMm: 0 },
    tactical: { tempo: 0, press: 0 },
    odds: normalizeOdds(row),
    market: { volumeIndex: 0, publicBetPct: {}, oddsMove: {} },
    rawSporttery: row
  };
}

async function loadSporttery() {
  const payload = await getJson(SPORTTERY_MATCH_URL);
  const rows = collectRows(payload).map(mapSporttery).filter(m => m.home.name && m.away.name);
  return {
    updatedAt: new Date().toISOString(),
    mode: 'sporttery-official-live',
    source: '中国竞彩网公开数据',
    matches: rows,
    count: rows.length
  };
}

module.exports = { loadSporttery };
