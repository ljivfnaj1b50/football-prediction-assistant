#!/usr/bin/env bash
set -e

PROJECT=football-prediction-assistant
SITE=jingxi-football
APP_DIR=/opt/$PROJECT
WEB_DIR=/var/www/$SITE
TOKEN=${1:-jingxi-admin-2026}

apt update
apt install -y nodejs npm nginx

cd $APP_DIR

mkdir -p $WEB_DIR/data
cp index.html $WEB_DIR/index.html
cp styles.css $WEB_DIR/styles.css
cp app.js $WEB_DIR/app.js
cp model.js $WEB_DIR/model.js
cp admin.html $WEB_DIR/admin.html
cp admin.js $WEB_DIR/admin.js
cp data/matches.json $WEB_DIR/data/matches.json

cat > /etc/systemd/system/jingxi-football-api.service <<EOF
[Unit]
Description=Jingxi Football Internal API
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=PORT=3000
Environment=ADMIN_TOKEN=$TOKEN
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/conf.d/$SITE.conf <<'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/jingxi-football;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

systemctl daemon-reload
systemctl enable jingxi-football-api
systemctl restart jingxi-football-api
nginx -t
systemctl restart nginx

echo "ADMIN_API_OK"
echo "后台地址：http://124.223.187.223/admin.html"
echo "后台口令：$TOKEN"
