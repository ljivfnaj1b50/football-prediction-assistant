#!/usr/bin/env bash
set -e

APP_DIR=/opt/football-prediction-assistant
WEB_DIR=/var/www/jingxi-football

cd "$APP_DIR"
mkdir -p "$WEB_DIR/data"
mkdir -p "$APP_DIR/data/history"
mkdir -p "$APP_DIR/data/backups"

cp index.html "$WEB_DIR/index.html"
if [ -f today.css ]; then cp today.css "$WEB_DIR/today.css"; fi
if [ -f today.js ]; then cp today.js "$WEB_DIR/today.js"; fi
if [ -f team-cn-map.js ]; then cp team-cn-map.js "$WEB_DIR/team-cn-map.js"; fi
cp styles.css "$WEB_DIR/styles.css"
if [ -f front-v2.css ]; then cp front-v2.css "$WEB_DIR/front-v2.css"; fi
cp app.js "$WEB_DIR/app.js"
cp model.js "$WEB_DIR/model.js"
cp admin.html "$WEB_DIR/admin.html"
cp admin.js "$WEB_DIR/admin.js"
cp admin-form.html "$WEB_DIR/admin-form.html"
cp admin-form.js "$WEB_DIR/admin-form.js"
cp admin-backups.html "$WEB_DIR/admin-backups.html"
cp admin-backups.js "$WEB_DIR/admin-backups.js"
cp admin-home.html "$WEB_DIR/admin-home.html"
cp admin-home.js "$WEB_DIR/admin-home.js"
cp admin-quality.html "$WEB_DIR/admin-quality.html"
cp admin-quality.js "$WEB_DIR/admin-quality.js"
cp data/matches.json "$WEB_DIR/data/matches.json"

nginx -t
systemctl restart nginx
systemctl restart jingxi-football-api

sleep 2
curl -fsS "http://127.0.0.1/api/public-feed?force=1" > /tmp/jingxi-public-feed.json || true

echo "OK_TODAY_ONE_GPT_SYNC_DONE"
