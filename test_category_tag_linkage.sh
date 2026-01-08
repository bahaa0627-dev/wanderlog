#!/bin/bash

echo "🔗 测试分类→标签联动功能"
echo "===================="
echo ""

echo "1️⃣ 测试 API 数据结构..."
result=$(curl -s "http://localhost:3000/api/public-places/filter-options")

has_tags_by_category=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
print('tagsByCategory' in data)
")

if [ "$has_tags_by_category" = "True" ]; then
    echo "   ✅ tagsByCategory 存在"
else
    echo "   ❌ tagsByCategory 不存在"
    exit 1
fi

echo ""
echo "2️⃣ 测试 Landmark 分类的标签..."
landmark_tags=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
if 'Landmark' in data['tagsByCategory']:
    print(len(data['tagsByCategory']['Landmark']))
else:
    print('0')
")

if [ "$landmark_tags" -gt "0" ]; then
    echo "   ✅ Landmark 有 $landmark_tags 个标签"
    echo "   前 5 个标签:"
    echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
for tag in data['tagsByCategory']['Landmark'][:5]:
    print(f'     - {tag[\"name\"]}: {tag[\"count\"]}')
"
else
    echo "   ❌ Landmark 没有标签数据"
    exit 1
fi

echo ""
echo "3️⃣ 测试 Cafe 分类的标签..."
cafe_tags=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
if 'Cafe' in data['tagsByCategory']:
    print(len(data['tagsByCategory']['Cafe']))
else:
    print('0')
")

if [ "$cafe_tags" -gt "0" ]; then
    echo "   ✅ Cafe 有 $cafe_tags 个标签"
    echo "   前 5 个标签:"
    echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
for tag in data['tagsByCategory']['Cafe'][:5]:
    print(f'     - {tag[\"name\"]}: {tag[\"count\"]}')
"
else
    echo "   ❌ Cafe 没有标签数据"
    exit 1
fi

echo ""
echo "===================="
echo "✅ 分类→标签联动测试完成！"
echo ""
echo "📝 后续步骤:"
echo "1. 打开浏览器访问: http://localhost:3000/admin.html"
echo "2. 选择分类: Landmark"
echo "3. 观察标签下拉框的变化"
echo "4. 应该只显示 Landmark 相关的标签"
echo ""
echo "预期结果:"
echo "- Landmark: 1740 个标签（Architecture, Historical, Colonial Revival...）"
echo "- Cafe: 52 个标签（casual, cozy, trendy, Brunch...）"
echo "- 选择不同分类，标签自动更新"
