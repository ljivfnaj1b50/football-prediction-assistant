# 域名与 HTTPS 配置

## 1. 域名解析

在域名 DNS 解析里添加：

- 记录类型：A
- 主机记录：@
- 记录值：124.223.187.223

如需 www 访问，再添加：

- 记录类型：A
- 主机记录：www
- 记录值：124.223.187.223

## 2. 服务器配置域名

把 example.com 替换成你的真实域名：

```bash
sudo tee /etc/nginx/conf.d/jingxi-football.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name example.com www.example.com 124.223.187.223;
    root /var/www/jingxi-football;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo nginx -t
sudo systemctl restart nginx
```

## 3. 配置 HTTPS

域名解析生效后执行：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

如果没有 www 解析，只执行：

```bash
sudo certbot --nginx -d example.com
```

## 4. 自动续期检查

```bash
sudo certbot renew --dry-run
```

## 注意

证书必须在域名解析成功后再申请，否则会失败。
