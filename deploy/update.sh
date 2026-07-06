#!/usr/bin/env bash
set -e

PROJECT=football-prediction-assistant
SITE=jingxi-football
APP_DIR=/opt/$PROJECT
WEB_DIR=/var/www/$SITE

cd $APP_DIR
git pull origin main

mkdir -p $WEB_DIR
mkdir -p $WEB_DIR/data
cp index.html $WEB_DIR/index.html
cp styles.css $WEB_DIR/styles.css
cp app.js $WEB_DIR/app.js
cp model.js $WEB_DIR/model.js
cp data/matches.json $WEB_DIR/data/matches.json

nginx -t
systemctl restart nginx

echo "UPDATE_OK_WITH_DATA"
