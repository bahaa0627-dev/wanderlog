#!/bin/bash

# 导入指定 Google Maps 收藏列表的脚本
# Usage: ./import_google_maps_list.sh

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Google Maps 列表 URL
GOOGLE_MAPS_URL="https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9"

# API 端点
API_URL="http://localhost:3000/api/public-places/import-from-link"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🗺️  Google Maps 列表导入工具${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查 API 服务是否运行
echo -e "${BLUE}🔍 检查 API 服务状态...${NC}"
if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${RED}❌ API 服务未运行！${NC}"
    echo -e "${YELLOW}请先启动 API 服务：${NC}"
    echo "cd wanderlog_api && npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ API 服务正在运行${NC}"
echo ""

# 显示要导入的 URL
echo -e "${BLUE}📍 Google Maps URL:${NC}"
echo "$GOOGLE_MAPS_URL"
echo ""

# 询问是否继续
echo -e "${YELLOW}准备开始导入，这可能需要几分钟时间...${NC}"
read -p "是否继续? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ 取消导入${NC}"
    exit 1
fi

# 开始导入
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚀 开始导入地点...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 发送请求
RESPONSE=$(curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$GOOGLE_MAPS_URL\",
    \"listName\": \"Google Maps 收藏列表\",
    \"listDescription\": \"从 https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9 导入\",
    \"useApify\": true
  }" \
  -s -w "\n%{http_code}")

# 分离响应体和状态码
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 导入结果${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查 HTTP 状态码
if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ HTTP Status: $HTTP_CODE (Success)${NC}"
    echo ""
    echo -e "${BLUE}响应详情:${NC}"
    echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"
    
    # 提取统计信息
    SUCCESS_COUNT=$(echo "$HTTP_BODY" | grep -o '"success":[0-9]*' | head -1 | grep -o '[0-9]*')
    FAILED_COUNT=$(echo "$HTTP_BODY" | grep -o '"failed":[0-9]*' | head -1 | grep -o '[0-9]*')
    SKIPPED_COUNT=$(echo "$HTTP_BODY" | grep -o '"skipped":[0-9]*' | head -1 | grep -o '[0-9]*')
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✨ 导入统计${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ 成功导入: $SUCCESS_COUNT 个地点${NC}"
    [ ! -z "$SKIPPED_COUNT" ] && echo -e "${YELLOW}⏭️  已跳过 (已存在): $SKIPPED_COUNT 个地点${NC}"
    [ ! -z "$FAILED_COUNT" ] && [ "$FAILED_COUNT" -gt 0 ] && echo -e "${RED}❌ 失败: $FAILED_COUNT 个地点${NC}"
    echo ""
    
    # 显示查看命令
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🔍 查看导入的地点${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "查看所有地点:"
    echo -e "${YELLOW}curl http://localhost:3000/api/public-places | python3 -m json.tool${NC}"
    echo ""
    echo "查看统计信息:"
    echo -e "${YELLOW}curl http://localhost:3000/api/public-places/stats | python3 -m json.tool${NC}"
    
else
    echo -e "${RED}❌ HTTP Status: $HTTP_CODE (Failed)${NC}"
    echo ""
    echo -e "${RED}错误详情:${NC}"
    echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
