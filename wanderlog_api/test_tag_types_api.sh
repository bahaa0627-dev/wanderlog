#!/bin/bash

# 测试标签类型 API

echo "🧪 测试标签类型 API"
echo "================================"
echo ""

# 设置 API 基础 URL
API_URL="${API_URL:-http://localhost:3000}"

echo "📍 API URL: $API_URL"
echo ""

echo "1️⃣ 测试获取所有标签类型"
echo "GET /api/public-places/tag-types"
echo ""
curl -s "$API_URL/api/public-places/tag-types" | jq '.'
echo ""
echo ""

echo "2️⃣ 测试按国家筛选标签类型"
echo "GET /api/public-places/tag-types?country=France"
echo ""
curl -s "$API_URL/api/public-places/tag-types?country=France" | jq '.'
echo ""
echo ""

echo "3️⃣ 测试按分类筛选标签类型"
echo "GET /api/public-places/tag-types?category=Architecture"
echo ""
curl -s "$API_URL/api/public-places/tag-types?category=Architecture" | jq '.'
echo ""
echo ""

echo "4️⃣ 测试获取筛选选项（包含 tagsByType）"
echo "GET /api/public-places/filter-options"
echo ""
curl -s "$API_URL/api/public-places/filter-options" | jq '.data.tagsByType'
echo ""
echo ""

echo "================================"
echo "✅ 测试完成！"
echo ""
echo "📖 API 响应格式："
echo ""
echo "tagsByType: ["
echo "  {"
echo "    type: 'architect',"
echo "    label: 'Architect',"
echo "    labelZh: '建筑师',"
echo "    count: 100,"
echo "    tags: ["
echo "      {"
echo "        name: 'architect:Frank Lloyd Wright',"
echo "        displayName: 'Frank Lloyd Wright',"
echo "        type: 'architect',"
echo "        count: 10"
echo "      },"
echo "      ..."
echo "    ]"
echo "  },"
echo "  ..."
echo "]"
echo ""
