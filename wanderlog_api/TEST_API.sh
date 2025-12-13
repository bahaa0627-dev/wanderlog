#!/bin/bash

echo "======================================"
echo "测试 Google Maps API 修复"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查服务是否在运行
echo "1️⃣  检查服务状态..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✅ 服务正在运行在端口 3000${NC}"
    echo ""
    
    # 2. 测试 API
    echo "2️⃣  测试添加地点 API..."
    echo "Place ID: ChIJLU7jZClu5kcR4PcOOO6p3I0 (埃菲尔铁塔)"
    echo ""
    
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/public-places/add-by-place-id \
      -H "Content-Type: application/json" \
      -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}')
    
    echo "API 响应:"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    echo ""
    
    # 检查是否成功
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ API 调用成功！${NC}"
    else
        echo -e "${RED}❌ API 调用失败${NC}"
    fi
else
    echo -e "${RED}❌ 服务未运行${NC}"
    echo ""
    echo "请先启动服务:"
    echo -e "${YELLOW}cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api${NC}"
    echo -e "${YELLOW}npm run dev${NC}"
fi

echo ""
echo "======================================"
echo "测试完成"
echo "======================================"
