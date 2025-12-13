#!/bin/bash

# Google Maps 收藏夹导入测试脚本
# 测试从 Google Maps 收藏夹链接批量导入地点

API_BASE="http://localhost:3000/api/public-places"

echo "=========================================="
echo "Google Maps 收藏夹导入测试"
echo "=========================================="
echo ""

# 测试 1: 从 Google Maps 收藏夹链接导入
echo "📋 测试 1: 从 Google Maps 收藏夹链接导入"
echo "提示: 请在下方粘贴你的 Google Maps 收藏夹链接"
echo "支持的链接格式:"
echo "  - https://maps.app.goo.gl/xxxxx"
echo "  - https://www.google.com/maps/d/xxxxx"
echo "  - https://goo.gl/maps/xxxxx"
echo ""
read -p "请输入 Google Maps 链接: " GOOGLE_MAPS_URL

if [ -z "$GOOGLE_MAPS_URL" ]; then
    echo "❌ 未提供链接，跳过测试"
else
    echo ""
    echo "🚀 开始导入..."
    echo ""
    
    curl -X POST "$API_BASE/import-from-link" \
        -H "Content-Type: application/json" \
        -d "{
            \"url\": \"$GOOGLE_MAPS_URL\",
            \"listName\": \"My Favorite Places\",
            \"listDescription\": \"Imported from Google Maps favorites\"
        }" | python3 -m json.tool 2>/dev/null || curl -X POST "$API_BASE/import-from-link" \
        -H "Content-Type: application/json" \
        -d "{
            \"url\": \"$GOOGLE_MAPS_URL\",
            \"listName\": \"My Favorite Places\",
            \"listDescription\": \"Imported from Google Maps favorites\"
        }"
    
    echo ""
fi

echo ""
echo "=========================================="
echo ""

# 测试 2: 手动输入 Place IDs 批量导入
echo "📋 测试 2: 手动批量导入 Place IDs"
echo ""
echo "示例 Place IDs:"
echo "  巴黎埃菲尔铁塔: ChIJLU7jZClu5kcR4PcOOO6p3I0"
echo "  巴黎卢浮宫: ChIJD3uTd9hx5kcR1IQvGfr8dbk"
echo "  巴黎凯旋门: ChIJjx37cOxv5kcRP2sTGUlH3ok"
echo ""

# 使用示例数据测试
PLACE_IDS='["ChIJLU7jZClu5kcR4PcOOO6p3I0", "ChIJD3uTd9hx5kcR1IQvGfr8dbk", "ChIJjx37cOxv5kcRP2sTGUlH3ok"]'

echo "🚀 测试批量导入 3 个巴黎景点..."
echo ""

curl -X POST "$API_BASE/import-by-place-ids" \
    -H "Content-Type: application/json" \
    -d "{
        \"placeIds\": $PLACE_IDS,
        \"sourceDetails\": {
            \"note\": \"Paris landmarks test\",
            \"importedBy\": \"test-script\"
        }
    }" | python3 -m json.tool 2>/dev/null || curl -X POST "$API_BASE/import-by-place-ids" \
    -H "Content-Type: application/json" \
    -d "{
        \"placeIds\": $PLACE_IDS,
        \"sourceDetails\": {
            \"note\": \"Paris landmarks test\",
            \"importedBy\": \"test-script\"
        }
    }"

echo ""
echo ""
echo "=========================================="
echo ""

# 测试 3: 查看导入的地点
echo "📋 测试 3: 查看所有导入的地点"
echo ""

curl -s "$API_BASE?limit=10" | python3 -m json.tool 2>/dev/null || curl "$API_BASE?limit=10"

echo ""
echo ""
echo "=========================================="
echo "✅ 测试完成!"
echo "=========================================="
