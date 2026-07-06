# 腾讯云部署说明

## 目标

把当前仓库部署到腾讯云服务器，通过公网 IP 或域名访问。

## 推荐方式

使用 Ubuntu 服务器 + Nginx。

当前项目是静态前端项目，核心文件是：

- index.html
- styles.css
- app.js
- model.js

## 服务器需要开放的端口

- 22：SSH 登录
- 80：HTTP 访问
- 443：HTTPS 访问，后续配置证书使用

## 基础命令

进入服务器后执行：

```bash
apt update
apt install -y git nginx
cd /opt
git clone https://github.com/ljivfnaj1b50/football-prediction-assistant.git
mkdir -p /var/www/jingxi-football
cp /opt/football-prediction-assistant/index.html /var/www/jingxi-football/
cp /opt/football-prediction-assistant/styles.css /var/www/jingxi-football/
cp /opt/football-prediction-assistant/app.js /var/www/jingxi-football/
cp /opt/football-prediction-assistant/model.js /var/www/jingxi-football/
```

## Nginx 配置

新建文件：

```bash
nano /etc/nginx/sites-available/jingxi-football
```

写入：

```nginx
server {
    listen 80;
    server_name _;
    root /var/www/jingxi-football;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用配置：

```bash
ln -s /etc/nginx/sites-available/jingxi-football /etc/nginx/sites-enabled/jingxi-football
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

完成后访问：

```text
http://服务器公网IP
```

## 后续升级

以后更新代码后，在服务器执行：

```bash
cd /opt/football-prediction-assistant
git pull origin main
cp index.html styles.css app.js model.js /var/www/jingxi-football/
systemctl reload nginx
```
