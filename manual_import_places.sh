#!/bin/bash

# 临时解决方案：手动导入 Place IDs
# 使用方法：./manual_import_places.sh

API_URL="http://localhost:3000/api/public-places/import-by-place-ids"

echo "=========================================="
echo "手动批量导入 Google Maps 地点"
echo "=========================================="
echo ""
echo "由于 Apify 未配置，请手动提供 Place IDs"
echo ""
echo "如何获取 Place ID:"
echo "1. 打开 Google Maps 链接"
echo "2. 点击每个地点"
echo "3. 从 URL 中复制 Place ID (ChIJ 开头的字符串)"
echo ""
echo "或者，你可以配置 Apify API Token 来自动爬取"
echo ""
read -p "请输入 Place IDs（逗号分隔）: " place_ids_input

if [ -z "$place_ids_input" ]; then
    echo "❌ 未提供 Place IDs"
    exit 1
fi

# 转换为 JSON 数组格式
place_ids_json=$(echo "$place_ids_input" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')

echo ""
echo "🚀 开始导入..."
echo ""

curl -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"placeIds\": [$place_ids_json],
        \"sourceDetails\": {
            \"note\": \"Manual import from https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9\",
            \"importedAt\": \"$(date)\"
        }
    }" | python3 -m json.tool 2>/dev/null || curl -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"placeIds\": [$place_ids_json],
        \"sourceDetails\": {
            \"note\": \"Manual import\",
            \"importedAt\": \"$(date)\"
        }
    }"

echo ""
echo ""
echo "✅ 导入完成！"
echo ""
