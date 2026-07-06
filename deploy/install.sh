#!/usr/bin/env bash
set -e

PROJECT=football-prediction-assistant
SITE=jingxi-football
REPO=https://github.com/ljivfnaj1b50/football-prediction-assistant.git

apt update
apt install -y git nginx

mkdir -p /opt
cd /opt

if [ -d /opt/$PROJECT/.git ]; then
  cd /opt/$PROJECT
  git pull origin main
else
  git clone $REPO /opt/$PROJECT
fi

mkdir -p /var/www/$SITE
mkdir -p /var/www/$SITE/data
cp /opt/$PROJECT/index.html /var/www/$SITE/index.html
cp /opt/$PROJECT/styles.css /var/www/$SITE/styles.css
cp /opt/$PROJECT/app.js /var/www/$SITE/app.js
cp /opt/$PROJECT/model.js /var/www/$SITE/model.js
cp /opt/$PROJECT/data/matches.json /var/www/$SITE/data/matches.json

cat > /etc/nginx/conf.d/$SITE.conf <<'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/jingxi-football;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "OK: http://124.223.187.223"
