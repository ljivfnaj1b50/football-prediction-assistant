const https = require('https');

const SPORTTERY_MATCH_URL = process.env.SPORTTERY_MATCH_URL || 'https://webapi.sporttery.cn/gateway/jc/football/getMatchListV1.qry?clientCode=3001';
const SPORTTERY_BONUS_URL = process.env.SPORTTERY_BONUS_URL || 'https://webapi.sporttery.cn/gateway/jc/football/getFixedBonusV1.qry?clientCode=3001';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 JingxiFootball/1.0',
        'Accept': 'application/json,text/plain,*/*',
        'Referer': 'https://www.sporttery.cn/'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(new Error('sporttery json parse failed')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('sporttery timeout')));
  });
}

function findList(payload) {
  if (Array.isArray(payload)) return payload;
  const value = payload?.value || payload?.data || payload?.result || payload;
  if (Array.isArray(value)) return value;
  const keys = ['matchInfoList', 'matchList', 'list', 'rows'];
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  for (const v of Object.values(value || {})) if (Array.isArray(v)) return v;
  return [];
}

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

function normalizeOdds(raw) {
  const spf = raw?.had || raw?.hhad || raw?.spf || raw?.odds || raw || {};
  const win = Number(pick(spf, ['h', 'home', 'a', 'win', 'sp3'], 0));
  const draw = Number(pick(spf, ['d', 'draw', 'sp1'], 0));
  const away = Number(pick(spf, ['a', 'away', 'lose', 'sp0'], 0));
  return win && draw && away ? { h2h: { home: win, draw, away } } : {};
}

function mapSporttery(row, index = 0) {
  const matchId = pick(row, ['matchId', 'id', 'mid'], `sporttery-${index}`);
  const num = pick(row, ['matchNumStr', 'matchNum', 'num', 'issueNum'], '待编号');
  const league = pick(row, ['leagueName', 'l_cn', 'league', 'competition'], '竞彩足球');
  const kickoff = pick(row, ['matchDate', 'matchTime', 'businessDate', 'kickoff'], '');
  const home = pick(row, ['homeTeamName', 'homeTeam', 'h_cn', 'hostName', 'home'], '主队');
  const away = pick(row, ['awayTeamName', 'awayTeam', 'a_cn', 'guestName', 'away'], '客队');
  return {
    id: `sporttery-${matchId}`,
    sourceId: matchId,
    jcNum: num,
    competition: league,
    stage: pick(row, ['matchWeek', 'round', 'stage'], '竞足'),
    kickoff: kickoff || new Date().toISOString(),
    status: pick(row, ['matchStatus', 'status'], '销售中'),
    neutral: false,
    venue: { name: '', city: '', altitudeM: 0 },
    home: { name: home, rank: 60, logo: '', flag: '', lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 }, keyPlayers: [] },
    away: { name: away, rank: 60, logo: '', flag: '', lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 }, keyPlayers: [] },
    weather: { tempC: 22, humidity: 55, windKph: 8, rainMm: 0 },
    tactical: { tempo: 0, press: 0 },
    odds: normalizeOdds(row),
    market: { volumeIndex: 0, publicBetPct: {}, oddsMove: {} },
    rawSporttery: row
  };
}

async function loadSporttery() {
  const matchesPayload = await getJson(SPORTTERY_MATCH_URL);
  const rows = findList(matchesPayload).map(mapSporttery).filter(m => m.home.name && m.away.name);
  return {
    updatedAt: new Date().toISOString(),
    mode: 'sporttery-official',
    source: '中国竞彩网公开数据',
    matches: rows,
    count: rows.length
  };
}

module.exports = { loadSporttery };
