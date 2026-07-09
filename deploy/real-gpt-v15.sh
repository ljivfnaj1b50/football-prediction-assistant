#!/usr/bin/env bash
set -euo pipefail
APP=/opt/football-prediction-assistant
WEB=/var/www/jingxi-football
COMMIT=511dbcf4e0469805ad49c710fb8213efc9b3ea86
BASE="https://cdn.jsdelivr.net/gh/ljivfnaj1b50/football-prediction-assistant@${COMMIT}"
cd "$APP"
for file in index.html gpt-ui.js gpt-analysis.js sporttery-source.js model.js server.js; do
  sudo curl --retry 5 --retry-delay 2 -fL --connect-timeout 30 -o "$file" "$BASE/$file"
done
sudo sed -i "s/function isTodayMatch(m) { return matchDayChina(m.kickoff) === chinaDay(); }/function isTodayMatch(m) { return String(m.businessDate || '').slice(0, 10) === chinaDay() || matchDayChina(m.kickoff) === chinaDay(); }/" server.js
sudo sed -i "/function environmentRisk(weather = {}, venue = {}) {/a\\  weather = weather || {};\\n  venue = venue || {};" model.js
if ! grep -q "require('./gpt-analysis')" server.js; then
  sudo awk '
    /let loadEspnToday = null;/ { print; print "let analyzeWithGpt = null;"; next }
    /require\('\''\.\/espn-source'\''\)/ { print; print "try { ({ analyzeWithGpt } = require('\''./gpt-analysis'\'')); } catch {}"; next }
    /pathname === '\''\/api\/history-latest'\''/ {
      print "  if (req.method === '\''GET'\'' && pathname === '\''/api/gpt-analysis'\'') {"
      print "    const matchId = String(url.searchParams.get('\''matchId'\'') || '\'''\'');"
      print "    const live = readJson(LIVE_CACHE_FILE, { matches: [] });"
      print "    const match = (live.matches || []).find(item => String(item.id) === matchId);"
      print "    if (!match) return send(res, 404, { ok: false, message: '\''未找到该场官方赛事数据'\'' });"
      print "    if (typeof analyzeWithGpt !== '\''function'\'') return send(res, 503, { ok: false, configured: false, message: '\''GPT分析服务未加载'\'' });"
      print "    try { return send(res, 200, await analyzeWithGpt(match)); } catch (err) { return send(res, 502, { ok: false, message: err.message }); }"
      print "  }"
    }
    { print }
  ' server.js | sudo tee server.js.tmp >/dev/null
  sudo mv server.js.tmp server.js
fi
sudo mkdir -p /etc/systemd/system/jingxi-football-api.service.d
printf '[Service]\nEnvironmentFile=-/etc/jingxi-football-api.env\n' | sudo tee /etc/systemd/system/jingxi-football-api.service.d/openai.conf >/dev/null
sudo touch /etc/jingxi-football-api.env
sudo chmod 600 /etc/jingxi-football-api.env
sudo cp index.html gpt-ui.js model.js "$WEB/"
sudo systemctl daemon-reload
sudo systemctl restart jingxi-football-api
sudo systemctl restart nginx
curl -fsS 'http://127.0.0.1:3000/api/public-feed?force=1' -o /tmp/jingxi-v15.json
node -e "const x=require('/tmp/jingxi-v15.json'); const m=x.matches?.[0]; console.log('官方赛事:',x.matches?.length||0,m?.home?.flag,m?.home?.name,'vs',m?.away?.flag,m?.away?.name)"
echo OK_REAL_GPT_V15
