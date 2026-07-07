const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'jingxi-admin-2026';
const DATA_FILE = path.join(__dirname, 'data', 'matches.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const PUBLIC_DATA_FILE = process.env.PUBLIC_DATA_FILE || '/var/www/jingxi-football/data/matches.json';

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

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf-8');
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
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 30)
    .map(name => ({ name, file: path.join(BACKUP_DIR, name) }));
}

function isSafeBackupName(name) {
  return /^matches-[0-9TZ\-]+\.json$/.test(String(name || ''));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

  if (req.method === 'GET' && req.url === '/api/health') {
    return send(res, 200, {
      ok: true,
      service: 'jingxi-football-api',
      time: new Date().toISOString(),
      dataFile: DATA_FILE,
      publicDataFile: PUBLIC_DATA_FILE,
      backups: listBackups().length
    });
  }

  if (req.method === 'GET' && req.url === '/api/backups') {
    return send(res, 200, { ok: true, backups: listBackups() });
  }

  if (req.method === 'POST' && req.url === '/api/restore') {
    if (!safeEqual(req.headers['x-admin-token'], ADMIN_TOKEN)) {
      return send(res, 401, { ok: false, message: '权限校验失败' });
    }
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}');
      const name = String(payload.name || '');
      if (!isSafeBackupName(name)) return send(res, 400, { ok: false, message: '备份文件名不合法' });
      const file = path.join(BACKUP_DIR, name);
      if (!fs.existsSync(file)) return send(res, 404, { ok: false, message: '备份不存在' });
      backupCurrentData();
      const text = fs.readFileSync(file, 'utf-8');
      const restorePayload = JSON.parse(text);
      restorePayload.updatedAt = new Date().toISOString();
      writeJson(DATA_FILE, restorePayload);
      writeJson(PUBLIC_DATA_FILE, restorePayload);
      return send(res, 200, { ok: true, message: '恢复成功，前台数据已同步', restored: name, count: restorePayload.matches?.length || 0 });
    } catch (err) {
      return send(res, 500, { ok: false, message: '恢复失败', detail: err.message });
    }
  }

  if (req.method === 'GET' && req.url === '/api/matches') {
    try {
      const text = fs.readFileSync(DATA_FILE, 'utf-8');
      return send(res, 200, JSON.parse(text));
    } catch (err) {
      return send(res, 500, { ok: false, message: '读取数据失败', detail: err.message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/matches') {
    if (!safeEqual(req.headers['x-admin-token'], ADMIN_TOKEN)) {
      return send(res, 401, { ok: false, message: '权限校验失败' });
    }
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
      return send(res, 200, {
        ok: true,
        message: '保存成功，前台数据已同步，旧数据已备份',
        updatedAt: payload.updatedAt,
        count: payload.matches.length,
        backupFile,
        dataFile: DATA_FILE,
        publicDataFile: PUBLIC_DATA_FILE
      });
    } catch (err) {
      return send(res, 500, { ok: false, message: '保存失败', detail: err.message });
    }
  }

  return send(res, 404, { ok: false, message: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`jingxi-football-api running on 127.0.0.1:${PORT}`);
});
