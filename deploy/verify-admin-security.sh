#!/usr/bin/env bash
set -e

BASE_URL=${1:-http://127.0.0.1}
TOKEN=${2:-}

if [ -z "$TOKEN" ]; then
  echo "用法: bash deploy/verify-admin-security.sh http://127.0.0.1 <后台口令>"
  exit 1
fi

echo "[1/5] 检查健康接口"
HEALTH=$(curl -s "$BASE_URL/api/health")
echo "$HEALTH" | grep -q '"ok": true'
echo "$HEALTH" | grep -q '"secured": true'

echo "[2/5] 检查无口令读取赛事应被拒绝"
NO_TOKEN_STATUS=$(curl -s -o /tmp/jingxi_no_token.json -w "%{http_code}" "$BASE_URL/api/matches")
if [ "$NO_TOKEN_STATUS" != "401" ]; then
  echo "失败: 无口令读取赛事没有被拒绝，HTTP=$NO_TOKEN_STATUS"
  cat /tmp/jingxi_no_token.json
  exit 1
fi

echo "[3/5] 检查带口令读取赛事应成功"
WITH_TOKEN_STATUS=$(curl -s -o /tmp/jingxi_with_token.json -w "%{http_code}" -H "x-admin-token: $TOKEN" "$BASE_URL/api/matches")
if [ "$WITH_TOKEN_STATUS" != "200" ]; then
  echo "失败: 带口令读取赛事失败，HTTP=$WITH_TOKEN_STATUS"
  cat /tmp/jingxi_with_token.json
  exit 1
fi
cat /tmp/jingxi_with_token.json | grep -q '"matches"'

echo "[4/5] 检查无口令读取备份应被拒绝"
NO_BACKUP_STATUS=$(curl -s -o /tmp/jingxi_no_backup.json -w "%{http_code}" "$BASE_URL/api/backups")
if [ "$NO_BACKUP_STATUS" != "401" ]; then
  echo "失败: 无口令读取备份没有被拒绝，HTTP=$NO_BACKUP_STATUS"
  cat /tmp/jingxi_no_backup.json
  exit 1
fi

echo "[5/5] 检查带口令读取备份应成功"
WITH_BACKUP_STATUS=$(curl -s -o /tmp/jingxi_with_backup.json -w "%{http_code}" -H "x-admin-token: $TOKEN" "$BASE_URL/api/backups")
if [ "$WITH_BACKUP_STATUS" != "200" ]; then
  echo "失败: 带口令读取备份失败，HTTP=$WITH_BACKUP_STATUS"
  cat /tmp/jingxi_with_backup.json
  exit 1
fi

echo "OK_ADMIN_SECURITY_VERIFIED"
