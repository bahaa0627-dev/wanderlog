#!/bin/bash

# 自动化导入演示 - 单个地点URL测试
# ============================================

echo "🗺️  Google Maps 自动化导入演示"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 测试场景:"
echo "  1. 短链接自动展开"
echo "  2. Place ID 自动提取"
echo "  3. Google Maps API 获取详情"
echo "  4. 自动入库（去重）"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 测试URL - 埃菲尔铁塔的Google Maps短链接
TEST_URL="https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9"

echo "📍 测试URL: $TEST_URL"
echo ""

# 检查API服务
echo "🔍 检查 API 服务..."
if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  API 服务未运行，正在启动..."
    echo ""
    cd wanderlog_api
    echo "请在另一个终端运行: cd wanderlog_api && npm run dev"
    echo ""
    exit 1
fi

echo "✅ API 服务正在运行"
echo ""

# 调用API导入
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 开始自动导入..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

RESPONSE=$(curl -X POST http://localhost:3000/api/public-places/import-from-link \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TEST_URL\"}" \
  -s)

echo "📊 导入结果:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 查看导入的地点:"
echo "   curl http://localhost:3000/api/public-places/stats | python3 -m json.tool"
echo ""
