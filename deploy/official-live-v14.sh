#!/usr/bin/env bash
set -euo pipefail

APP=/opt/football-prediction-assistant
WEB=/var/www/jingxi-football
COMMIT=ffd7884074e1a906c758d5485b5297ccb7bd27ed
BASE="https://cdn.jsdelivr.net/gh/ljivfnaj1b50/football-prediction-assistant@${COMMIT}"

cd "$APP"
for file in index.html lottery.js sporttery-source.js server.js today.js; do
  sudo curl --retry 5 --retry-delay 2 -fL --connect-timeout 30 -o "$file" "$BASE/$file"
done

sudo sed -i "s/function isTodayMatch(m) { return matchDayChina(m.kickoff) === chinaDay(); }/function isTodayMatch(m) { return String(m.businessDate || '').slice(0, 10) === chinaDay() || matchDayChina(m.kickoff) === chinaDay(); }/" server.js
sudo sed -i "s/function isTodayMatch(match) { const day = chinaDay(new Date(match.kickoff)); return day === chinaDay(new Date()); }/function isTodayMatch(match) { const today = chinaDay(new Date()); return String(match.businessDate || '').slice(0, 10) === today || chinaDay(new Date(match.kickoff)) === today; }/" today.js

sudo cp index.html lottery.js today.js "$WEB/"
sudo systemctl restart jingxi-football-api
sudo systemctl restart nginx

curl -fsS 'http://127.0.0.1:3000/api/public-feed?force=1' -o /tmp/jingxi-official-check.json
node -e "const x=require('/tmp/jingxi-official-check.json'); console.log('官方赛事源:',x.mode,'赛事数:',x.matches?.length||0,'示例:',x.matches?.[0]?.jcNum,x.matches?.[0]?.home?.name,'vs',x.matches?.[0]?.away?.name)"
echo OK_OFFICIAL_LIVE_V14
