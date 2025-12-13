#!/bin/bash

# 公共地点库测试脚本
# 测试所有核心功能

API_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "   公共地点库 API 测试脚本"
echo "=========================================="
echo ""

# 检查服务器是否运行
echo -e "${BLUE}[1/8] 检查服务器状态...${NC}"
if curl -s "${API_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 服务器运行正常${NC}"
else
    echo -e "${RED}✗ 服务器未启动！请先运行: npm run dev${NC}"
    exit 1
fi
echo ""

# 测试获取统计信息
echo -e "${BLUE}[2/8] 测试获取统计信息...${NC}"
STATS=$(curl -s "${API_URL}/api/public-places/stats")
if [ -n "$STATS" ]; then
    echo -e "${GREEN}✓ 统计信息 API 正常${NC}"
    echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
else
    echo -e "${RED}✗ 统计信息 API 失败${NC}"
fi
echo ""

# 测试获取所有地点
echo -e "${BLUE}[3/8] 测试获取所有地点（分页）...${NC}"
PLACES=$(curl -s "${API_URL}/api/public-places?page=1&limit=5")
if [ -n "$PLACES" ]; then
    echo -e "${GREEN}✓ 获取地点列表成功${NC}"
    echo "$PLACES" | python3 -m json.tool 2>/dev/null | head -20
else
    echo -e "${RED}✗ 获取地点列表失败${NC}"
fi
echo ""

# 测试添加地点（埃菲尔铁塔）
echo -e "${BLUE}[4/8] 测试手动添加地点（埃菲尔铁塔）...${NC}"
ADD_RESULT=$(curl -s -X POST "${API_URL}/api/public-places/add-by-place-id" \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}')

if echo "$ADD_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ 添加地点成功${NC}"
    echo "$ADD_RESULT" | python3 -m json.tool 2>/dev/null | head -30
else
    echo -e "${RED}✗ 添加地点失败${NC}"
    echo "$ADD_RESULT"
fi
echo ""

# 测试搜索功能
echo -e "${BLUE}[5/8] 测试搜索功能（搜索 'Eiffel'）...${NC}"
SEARCH_RESULT=$(curl -s "${API_URL}/api/public-places/search?q=Eiffel")
if [ -n "$SEARCH_RESULT" ]; then
    echo -e "${GREEN}✓ 搜索功能正常${NC}"
    echo "$SEARCH_RESULT" | python3 -m json.tool 2>/dev/null | head -20
else
    echo -e "${RED}✗ 搜索功能失败${NC}"
fi
echo ""

# 测试获取特定地点详情
echo -e "${BLUE}[6/8] 测试获取地点详情...${NC}"
PLACE_DETAIL=$(curl -s "${API_URL}/api/public-places/ChIJLU7jZClu5kcR4PcOOO6p3I0")
if echo "$PLACE_DETAIL" | grep -q "success"; then
    echo -e "${GREEN}✓ 获取地点详情成功${NC}"
    echo "$PLACE_DETAIL" | python3 -m json.tool 2>/dev/null | head -30
else
    echo -e "${RED}✗ 获取地点详情失败${NC}"
fi
echo ""

# 测试更新地点
echo -e "${BLUE}[7/8] 测试更新地点信息...${NC}"
UPDATE_RESULT=$(curl -s -X PUT "${API_URL}/api/public-places/ChIJLU7jZClu5kcR4PcOOO6p3I0" \
  -H "Content-Type: application/json" \
  -d '{"aiTags": ["iconic", "romantic", "must-visit"]}')

if echo "$UPDATE_RESULT" | grep -q "success"; then
    echo -e "${GREEN}✓ 更新地点成功${NC}"
else
    echo -e "${RED}✗ 更新地点失败${NC}"
    echo "$UPDATE_RESULT"
fi
echo ""

# 测试按城市筛选
echo -e "${BLUE}[8/8] 测试按城市筛选...${NC}"
FILTER_RESULT=$(curl -s "${API_URL}/api/public-places?city=Paris")
if [ -n "$FILTER_RESULT" ]; then
    echo -e "${GREEN}✓ 筛选功能正常${NC}"
    echo "$FILTER_RESULT" | python3 -m json.tool 2>/dev/null | head -20
else
    echo -e "${RED}✗ 筛选功能失败${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}测试完成！${NC}"
echo "=========================================="
echo ""
echo "查看更多信息："
echo "  - API 文档: PUBLIC_PLACES_LIBRARY_README.md"
echo "  - 快速开始: PUBLIC_PLACES_QUICK_START.md"
echo "  - Prisma Studio: npm run db:studio (http://localhost:5555)"
echo ""
