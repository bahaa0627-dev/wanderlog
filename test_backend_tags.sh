#!/bin/bash

echo "🧪 测试后台标签数据"
echo "===================="
echo ""

echo "1️⃣ 测试 filter-options API..."
result=$(curl -s "http://localhost:3000/api/public-places/filter-options")
total_tags=$(echo $result | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data['data']['tags']))")
echo "   总标签数: $total_tags"

art_nouveau_count=$(echo $result | python3 -c "
import sys, json
data = json.load(sys.stdin)
tags = data['data']['tags']
art_nouveau = [t for t in tags if 'art nouveau' in t['name'].lower()]
total = sum(t['count'] for t in art_nouveau)
print(total)
")
echo "   Art Nouveau 总数: $art_nouveau_count"

if [ "$art_nouveau_count" = "110" ]; then
    echo "   ✅ 通过！"
else
    echo "   ⚠️  预期 110，实际 $art_nouveau_count"
fi
echo ""

echo "2️⃣ 测试标签筛选 API..."
result=$(curl -s "http://localhost:3000/api/public-places?tag=Art%20Nouveau&limit=3")
filter_count=$(echo $result | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['pagination']['total'])")
echo "   筛选结果数: $filter_count"

if [ "$filter_count" = "110" ]; then
    echo "   ✅ 通过！"
else
    echo "   ⚠️  预期 110，实际 $filter_count"
fi
echo ""

echo "===================="
echo "✅ 测试完成！"
echo ""
echo "📝 后续步骤:"
echo "1. 打开浏览器访问: http://localhost:3000/admin.html"
echo "2. 在标签下拉框中查找 'Art Nouveau'"
echo "3. 应该看到:"
echo "   - Art Nouveau architecture (107)"
echo "   - Valencian Art Nouveau (2)"
echo "   - Art Nouveau (1)"
echo "4. 选择任意一个并点击'应用筛选'"
echo "5. 应该看到对应数量的结果"
