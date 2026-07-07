const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'jingxi-admin-2026';
const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const LIVE_CACHE_FILE = path.join(__dirname, 'data', 'live-cache.json');
const PUBLIC_DATA_FILE = process.env.PUBLIC_DATA_FILE || '/var/www/jingxi-football/data/matches.json';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || '';
const API_FOOTBALL_HOST = process.env.API_FOOTBALL_HOST || 'api-football-v1.p.rapidapi.com';
const LIVE_TTL_MS = Number(process.env.LIVE_TTL_MS || 10 * 60 * 1000);

function send(res, code, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-token'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024 * 2) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
function hasAdmin(req) { return safeEqual(req.headers['x-admin-token'], ADMIN_TOKEN); }
function requireAdmin(req, res) {
  if (hasAdmin(req)) return true;
  send(res, 401, { ok: false, message: '权限校验失败' });
  return false;
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '数据必须是对象';
  if (!Array.isArray(payload.matches)) return 'matches 必须是数组';
  for (const item of payload.matches) {
    if (!item.id) return '每场比赛必须有 id';
    if (!item.home || !item.away) return `${item.id} 缺少 home/away`;
    if (!item.home.name || !item.away.name) return `${item.id} 缺少球队名称`;
    if (!item.kickoff) return `${item.id} 缺少 kickoff`;
    if (!item.venue) return `${item.id} 缺少 venue`;
    if (!item.weather) return `${item.id} 缺少 weather`;
  }
  return '';
}

function backupCurrentData() {
  if (!fs.existsSync(DATA_FILE)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `matches-${stamp}.json`);
  fs.copyFileSync(DATA_FILE, backupFile);
  return backupFile;
}
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(name => name.endsWith('.json')).sort().reverse().slice(0, 30).map(name => ({ name, file: path.join(BACKUP_DIR, name) }));
}
function isSafeBackupName(name) { return /^matches-[0-9TZ\-]+\.json$/.test(String(name || '')); }

function requestJson(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (err) { reject(new Error('third party json parse failed')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('third party timeout')));
    req.end();
  });
}

function defaultWeather() { return { tempC: 22, humidity: 55, windKph: 8, rainMm: 0 }; }
function defaultTeam(name, logo, country) {
  return {
    name,
    rank: 60,
    logo: logo || '',
    flag: country || '',
    lastPlayedAt: '',
    travelKm: 0,
    form: [],
    injuries: [],
    suspensions: [],
    publicSentiment: { score: 0, reliability: 0 },
    keyPlayers: []
  };
}

function mapApiFootballFixture(item) {
  const fixture = item.fixture || {};
  const teams = item.teams || {};
  const league = item.league || {};
  const venue = fixture.venue || {};
  return {
    id: `api-${fixture.id}`,
    sourceId: fixture.id,
    competition: league.name || '足球赛事',
    stage: league.round || '常规赛',
    kickoff: fixture.date || new Date().toISOString(),
    status: fixture.status?.long || '未开赛',
    minute: fixture.status?.elapsed || null,
    neutral: !teams.home?.winner && !teams.away?.winner,
    venue: { name: venue.name || '待确认球场', city: venue.city || '', altitudeM: 0 },
    home: defaultTeam(teams.home?.name || '主队', teams.home?.logo || '', ''),
    away: defaultTeam(teams.away?.name || '客队', teams.away?.logo || '', ''),
    weather: defaultWeather(),
    tactical: { tempo: 0, press: 0 },
    odds: {},
    market: { volumeIndex: 0, publicBetPct: {}, oddsMove: {} }
  };
}

function mergeLiveWithInternal(livePayload, internalPayload) {
  const internal = internalPayload?.matches || [];
  const live = livePayload?.matches || [];
  const byName = new Map(internal.map(m => [`${m.home?.name}-${m.away?.name}`, m]));
  const merged = live.map(m => {
    const extra = byName.get(`${m.home?.name}-${m.away?.name}`);
    return extra ? { ...m, ...extra, home: { ...m.home, ...extra.home }, away: { ...m.away, ...extra.away }, venue: { ...m.venue, ...extra.venue }, weather: extra.weather || m.weather, tactical: extra.tactical || m.tactical } : m;
  });
  const liveIds = new Set(merged.map(m => `${m.home?.name}-${m.away?.name}`));
  internal.forEach(m => { if (!liveIds.has(`${m.home?.name}-${m.away?.name}`)) merged.push(m); });
  return { ...livePayload, matches: merged };
}

async function loadPublicFeed() {
  const internal = readJson(DATA_FILE, { updatedAt: new Date().toISOString(), mode: 'empty', sources: [], matches: [] });
  const cache = readJson(LIVE_CACHE_FILE, null);
  const cacheFresh = cache?.updatedAt && Date.now() - new Date(cache.updatedAt).getTime() < LIVE_TTL_MS;
  if (!API_FOOTBALL_KEY) {
    return { ...internal, mode: 'local-plus-ready-for-live', live: { enabled: false, reason: '未配置 API_FOOTBALL_KEY，当前使用服务器数据文件' } };
  }
  if (cacheFresh) return mergeLiveWithInternal(cache, internal);
  const today = new Date().toISOString().slice(0, 10);
  const result = await requestJson({
    hostname: API_FOOTBALL_HOST,
    path: `/v3/fixtures?date=${today}`,
    method: 'GET',
    headers: { 'x-rapidapi-host': API_FOOTBALL_HOST, 'x-rapidapi-key': API_FOOTBALL_KEY }
  });
  const rows = Array.isArray(result.response) ? result.response.slice(0, 80).map(mapApiFootballFixture) : [];
  const payload = {
    updatedAt: new Date().toISOString(),
    mode: 'live-api-football',
    live: { enabled: true, provider: 'api-football', ttlMinutes: Math.round(LIVE_TTL_MS / 60000), count: rows.length },
    sources: [
      { name: '实时赛程', status: 'ok', detail: '已接入 API-FOOTBALL 今日赛程' },
      { name: '队徽/赛事', status: 'ok', detail: '队徽随接口返回，国旗和球员照片可继续扩展' },
      { name: '内部补充数据', status: 'ok', detail: '伤停、天气、战术、公开信号可由后台补充' }
    ],
    matches: rows
  };
  writeJson(LIVE_CACHE_FILE, payload);
  writeJson(PUBLIC_DATA_FILE, mergeLiveWithInternal(payload, internal));
  return mergeLiveWithInternal(payload, internal);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

  if (req.method === 'GET' && req.url === '/api/public-feed') {
    try { return send(res, 200, await loadPublicFeed()); }
    catch (err) {
      const fallback = readJson(DATA_FILE, { updatedAt: new Date().toISOString(), mode: 'fallback-error', sources: [], matches: [] });
      fallback.live = { enabled: false, reason: err.message };
      return send(res, 200, fallback);
    }
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    return send(res, 200, { ok: true, service: 'jingxi-football-api', time: new Date().toISOString(), liveReady: Boolean(API_FOOTBALL_KEY), publicDataFile: PUBLIC_DATA_FILE, secured: true, backups: hasAdmin(req) ? listBackups().length : undefined, dataFile: hasAdmin(req) ? DATA_FILE : undefined });
  }

  if (req.method === 'GET' && req.url === '/api/backups') {
    if (!requireAdmin(req, res)) return;
    return send(res, 200, { ok: true, backups: listBackups() });
  }

  if (req.method === 'POST' && req.url === '/api/restore') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const name = String(payload.name || '');
      if (!isSafeBackupName(name)) return send(res, 400, { ok: false, message: '备份文件名不合法' });
      const file = path.join(BACKUP_DIR, name);
      if (!fs.existsSync(file)) return send(res, 404, { ok: false, message: '备份不存在' });
      backupCurrentData();
      const restorePayload = readJson(file, null);
      restorePayload.updatedAt = new Date().toISOString();
      writeJson(DATA_FILE, restorePayload);
      writeJson(PUBLIC_DATA_FILE, restorePayload);
      return send(res, 200, { ok: true, message: '恢复成功，前台数据已同步', restored: name, count: restorePayload.matches?.length || 0 });
    } catch (err) { return send(res, 500, { ok: false, message: '恢复失败', detail: err.message }); }
  }

  if (req.method === 'GET' && req.url === '/api/matches') {
    if (!requireAdmin(req, res)) return;
    try { return send(res, 200, readJson(DATA_FILE)); }
    catch (err) { return send(res, 500, { ok: false, message: '读取数据失败', detail: err.message }); }
  }

  if (req.method === 'POST' && req.url === '/api/matches') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const err = validatePayload(payload);
      if (err) return send(res, 400, { ok: false, message: err });
      const backupFile = backupCurrentData();
      payload.updatedAt = new Date().toISOString();
      payload.mode = payload.mode || 'internal-data-file';
      writeJson(DATA_FILE, payload);
      writeJson(PUBLIC_DATA_FILE, payload);
      return send(res, 200, { ok: true, message: '保存成功，前台数据已同步，旧数据已备份', updatedAt: payload.updatedAt, count: payload.matches.length, backupFile, dataFile: DATA_FILE, publicDataFile: PUBLIC_DATA_FILE });
    } catch (err) { return send(res, 500, { ok: false, message: '保存失败', detail: err.message }); }
  }

  return send(res, 404, { ok: false, message: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`jingxi-football-api running on 127.0.0.1:${PORT}`);
});
