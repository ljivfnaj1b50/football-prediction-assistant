#!/usr/bin/env bash
set -e

APP_DIR=/opt/football-prediction-assistant
WEB_DIR=/var/www/jingxi-football

cd "$APP_DIR"
mkdir -p "$WEB_DIR/data"

cp index.html "$WEB_DIR/index.html"
cp styles.css "$WEB_DIR/styles.css"
cp front-v2.css "$WEB_DIR/front-v2.css"
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
systemctl restart jingxi-football-api || true

echo "OK_V2_SYNC_DONE"
