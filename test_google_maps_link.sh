#!/bin/bash

# 测试 Google Maps 链接导入
# 使用 Apify 抓取数据并存入公共地点库

echo "🚀 测试 Google Maps 链接处理"
echo "链接: https://maps.app.goo.gl/pJpgevR4efjKicFz8"
echo ""
echo "=" | head -c 60
echo ""
echo ""

# 等待 API 服务器启动
echo "⏳ 等待 API 服务器..."
sleep 2

# 测试 API 服务器是否运行
if ! curl -s http://localhost:3000/api/public-places/stats > /dev/null; then
    echo "❌ API 服务器未运行！"
    echo "请先运行: npm run dev"
    exit 1
fi

echo "✅ API 服务器正在运行"
echo ""

# 导入 Google Maps 链接
echo "🕷️ 使用 Apify 爬取并导入地点..."
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3000/api/public-places/import-from-link \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://maps.app.goo.gl/pJpgevR4efjKicFz8",
    "useApify": true,
    "listName": "测试导入列表",
    "listDescription": "从短链接导入的测试数据"
  }')

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

echo ""
echo "=" | head -c 60
echo ""

# 检查是否成功
if echo "$RESPONSE" | grep -q '"success": true'; then
    echo "✅ 导入成功！"
    
    # 显示统计信息
    echo ""
    echo "📊 当前公共地点库统计："
    curl -s http://localhost:3000/api/public-places/stats | python3 -m json.tool 2>/dev/null
else
    echo "❌ 导入失败"
fi

echo ""
