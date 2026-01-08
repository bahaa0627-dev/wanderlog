#!/bin/bash

echo "🔗 测试筛选联动功能"
echo "===================="
echo ""

echo "1️⃣ 测试 API 数据结构..."
result=$(curl -s "http://localhost:3000/api/public-places/filter-options")

has_categories_by_country=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
print('categoriesByCountry' in data)
")

if [ "$has_categories_by_country" = "True" ]; then
    echo "   ✅ categoriesByCountry 存在"
else
    echo "   ❌ categoriesByCountry 不存在"
    exit 1
fi

echo ""
echo "2️⃣ 测试 Spain 的联动数据..."
spain_data=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
if 'Spain' in data['categoriesByCountry']:
    print(f'{len(data[\"categoriesByCountry\"][\"Spain\"])}')
else:
    print('0')
")

if [ "$spain_data" -gt "0" ]; then
    echo "   ✅ Spain 有 $spain_data 个分类"
else
    echo "   ❌ Spain 没有分类数据"
    exit 1
fi

echo ""
echo "3️⃣ 测试数量一致性..."
# 测试 Spain 的 Cafe 数量
cafe_count=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
if 'Spain' in data['categoriesByCountry']:
    for cat in data['categoriesByCountry']['Spain']:
        if cat['name'] == 'Cafe':
            print(cat['count'])
            break
else:
    print('0')
")

if [ "$cafe_count" -gt "0" ]; then
    echo "   ✅ Spain 的 Cafe 数量: $cafe_count"
    
    # 验证实际筛选结果
    actual_count=$(curl -s "http://localhost:3000/api/public-places?country=Spain&category=Cafe&limit=1" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['pagination']['total'])
")
    
    if [ "$actual_count" = "$cafe_count" ]; then
        echo "   ✅ 筛选结果数量一致: $actual_count"
    else
        echo "   ⚠️  数量不一致 - 下拉框: $cafe_count, 实际: $actual_count"
    fi
else
    echo "   ⚠️  未找到 Spain 的 Cafe 数据"
fi

echo ""
echo "===================="
echo "✅ 联动测试完成！"
echo ""
echo "📝 后续步骤:"
echo "1. 打开浏览器访问: http://localhost:3000/admin.html"
echo "2. 选择国家: Spain"
echo "3. 观察城市、分类、标签下拉框的变化"
echo "4. 验证数量是否正确更新"
echo ""
echo "预期结果:"
echo "- 城市: 146 个西班牙城市"
echo "- 分类: 25 个分类（如 Cafe: 199, Bar: 45）"
echo "- 标签: 292 个标签（如 Architecture: 270）"
