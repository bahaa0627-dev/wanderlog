#!/bin/bash

# 测试公共地点查询功能
echo "🧪 测试公共地点查询功能"
echo "================================"

BASE_URL="http://localhost:3000/api/public-places"

# 1. 测试基础分页
echo ""
echo "1️⃣ 测试分页功能 - 第1页（每页50条）"
echo "--------------------------------"
curl -s "$BASE_URL?page=1&limit=50" | python3 -m json.tool | head -30

# 2. 测试跳转到第2页
echo ""
echo "2️⃣ 测试分页功能 - 第2页"
echo "--------------------------------"
curl -s "$BASE_URL?page=2&limit=50" | python3 -m json.tool | head -30

# 3. 测试国家筛选
echo ""
echo "3️⃣ 测试国家筛选 - Denmark"
echo "--------------------------------"
curl -s "$BASE_URL?country=Denmark" | python3 -m json.tool | head -40

# 4. 测试城市筛选
echo ""
echo "4️⃣ 测试城市筛选 - Chiang Mai"
echo "--------------------------------"
curl -s "$BASE_URL?city=Chiang%20Mai" | python3 -m json.tool | head -40

# 5. 测试分类筛选
echo ""
echo "5️⃣ 测试分类筛选 - restaurant"
echo "--------------------------------"
curl -s "$BASE_URL?category=restaurant" | python3 -m json.tool | head -40

# 6. 测试名称搜索
echo ""
echo "6️⃣ 测试名称搜索 - 包含 'museum'"
echo "--------------------------------"
curl -s "$BASE_URL?name=museum" | python3 -m json.tool | head -40

# 7. 测试评分区间
echo ""
echo "7️⃣ 测试评分区间 - 4.5到5.0"
echo "--------------------------------"
curl -s "$BASE_URL?minRating=4.5&maxRating=5.0" | python3 -m json.tool | head -40

# 8. 测试组合筛选
echo ""
echo "8️⃣ 测试组合筛选 - Denmark + restaurant + 评分>4.0"
echo "--------------------------------"
curl -s "$BASE_URL?country=Denmark&category=restaurant&minRating=4.0" | python3 -m json.tool | head -40

# 9. 测试分页+筛选组合
echo ""
echo "9️⃣ 测试分页+筛选组合 - Thailand + 第1页"
echo "--------------------------------"
curl -s "$BASE_URL?country=Thailand&page=1&limit=20" | python3 -m json.tool | head -40

# 10. 获取统计信息对比
echo ""
echo "🔟 获取统计信息"
echo "--------------------------------"
curl -s "$BASE_URL/stats" | python3 -m json.tool

echo ""
echo "================================"
echo "✅ 测试完成！"
