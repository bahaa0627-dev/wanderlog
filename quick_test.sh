#!/bin/bash

# 简单测试脚本
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 自动化导入测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查服务
echo "1️⃣ 检查 API 服务..."
if lsof -Pi :3000 -sTCP:LISTEN > /dev/null 2>&1; then
    echo "   ✅ API 服务运行中"
else
    echo "   ❌ API 服务未运行"
    echo "   请运行: cd wanderlog_api && npm run dev"
    exit 1
fi
echo ""

# 测试健康检查
echo "2️⃣ 测试健康检查..."
HEALTH=$(curl -s http://localhost:3000/health)
if [ ! -z "$HEALTH" ]; then
    echo "   ✅ 健康检查通过"
    echo "   响应: $HEALTH"
else
    echo "   ❌ 健康检查失败"
    exit 1
fi
echo ""

# 测试导入（埃菲尔铁塔 - 已存在的地点）
echo "3️⃣ 测试自动化导入（使用已知的 Place ID）..."
echo "   URL: ChIJLU7jZClu5kcR4PcOOO6p3I0 (埃菲尔铁塔)"
echo ""

RESULT=$(curl -s -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}')

echo "   响应:"
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
echo ""

# 查看统计
echo "4️⃣ 查看公共地点统计..."
STATS=$(curl -s http://localhost:3000/api/public-places/stats)
echo "$STATS" | python3 -m json.tool 2>/dev/null || echo "$STATS"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
