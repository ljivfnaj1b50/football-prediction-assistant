const https = require('https');

const ESPN_SOCCER_LEAGUES = (process.env.ESPN_SOCCER_LEAGUES || 'fifa.world,fifa.wwc,uefa.euro,uefa.champions,uefa.europa,eng.1,eng.2,esp.1,ita.1,ger.1,fra.1,usa.1,mex.1,bra.1,arg.1,chn.1').split(',').map(s => s.trim()).filter(Boolean);
const ESPN_LEAGUE_NAMES = {
  '606': '世界杯',
  '620': '玻利维亚甲级联赛',
  '19887': '欧联杯资格赛',
  '20221': '欧协联资格赛'
};

function chinaDay(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function espnDate(date = new Date()) {
  return chinaDay(date).replace(/-/g, '');
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 JingxiFootball/4.0',
        'Accept': 'application/json,text/plain,*/*'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('espn json parse failed')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('espn timeout')));
  });
}

function defaultTeam(name, logo) {
  return { name, rank: 60, logo: logo || '', flag: '', lastPlayedAt: '', travelKm: 0, form: [], injuries: [], suspensions: [], publicSentiment: { score: 0, reliability: 0 }, keyPlayers: [] };
}

function eventLeagueName(event) {
  const leagueId = String(event.uid || '').match(/~l:(\d+)/)?.[1];
  return ESPN_LEAGUE_NAMES[leagueId] || event.league?.name || event.season?.name || '足球赛事';
}

function mapEvent(event, leagueName) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find(x => x.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find(x => x.homeAway === 'away') || competitors[1] || {};
  const homeTeam = home.team || {};
  const awayTeam = away.team || {};
  return {
    id: `espn-${event.id}`,
    sourceId: event.id,
    competition: leagueName || event.league?.name || '足球赛事',
    stage: event.season?.slug || event.name || '今日赛程',
    kickoff: event.date || new Date().toISOString(),
    status: event.status?.type?.description || event.status?.type?.name || '未开赛',
    neutral: Boolean(competition.neutralSite),
    venue: { name: competition.venue?.fullName || '', city: competition.venue?.address?.city || '', altitudeM: 0 },
    home: defaultTeam(homeTeam.displayName || homeTeam.name || homeTeam.shortDisplayName || '主队', homeTeam.logo || homeTeam.logos?.[0]?.href || ''),
    away: defaultTeam(awayTeam.displayName || awayTeam.name || awayTeam.shortDisplayName || '客队', awayTeam.logo || awayTeam.logos?.[0]?.href || ''),
    weather: { tempC: 22, humidity: 55, windKph: 8, rainMm: 0 },
    tactical: { tempo: 0, press: 0 },
    odds: {},
    market: { volumeIndex: 0, publicBetPct: {}, oddsMove: {} },
    rawEspn: { id: event.id, name: event.name, shortName: event.shortName }
  };
}

async function loadEspnToday() {
  const date = espnDate();
  const rows = [];
  const seen = new Set();
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${date}&limit=1000`;
    const payload = await getJson(url);
    (payload.events || []).forEach(event => {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        rows.push(mapEvent(event, eventLeagueName(event)));
      }
    });
  } catch {}

  // League feeds supplement the aggregate endpoint when a competition is missing.
  for (const league of ESPN_SOCCER_LEAGUES) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(league)}/scoreboard?dates=${date}`;
      const payload = await getJson(url);
      const leagueName = payload.leagues?.[0]?.name || league;
      (payload.events || []).forEach(event => {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          rows.push(mapEvent(event, leagueName));
        }
      });
    } catch {}
  }
  return {
    updatedAt: new Date().toISOString(),
    mode: 'espn-today-live',
    source: 'ESPN公开今日赛程',
    matches: rows,
    count: rows.length,
    leagues: ['all', ...ESPN_SOCCER_LEAGUES]
  };
}

module.exports = { loadEspnToday };
