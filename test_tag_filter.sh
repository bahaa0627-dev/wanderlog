#!/bin/bash

echo "🧪 测试标签筛选功能"
echo "===================="
echo ""

# 测试 Art Nouveau
echo "1️⃣ 测试 Art Nouveau 标签筛选..."
result=$(curl -s "http://localhost:3000/api/public-places?tag=Art%20Nouveau&limit=3")
total=$(echo $result | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['pagination']['total'])")
echo "   结果: $total 个地点"
if [ "$total" = "110" ]; then
    echo "   ✅ 通过！"
else
    echo "   ❌ 失败！预期 110，实际 $total"
fi
echo ""

# 测试 Art Deco
echo "2️⃣ 测试 Art Deco 标签筛选..."
result=$(curl -s "http://localhost:3000/api/public-places?tag=Art%20Deco&limit=3")
total=$(echo $result | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['pagination']['total'])")
echo "   结果: $total 个地点"
if [ "$total" = "285" ]; then
    echo "   ✅ 通过！"
else
    echo "   ⚠️  预期 285，实际 $total"
fi
echo ""

# 测试 Colonial Revival
echo "3️⃣ 测试 Colonial Revival 标签筛选..."
result=$(curl -s "http://localhost:3000/api/public-places?tag=Colonial%20Revival&limit=3")
total=$(echo $result | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['pagination']['total'])")
echo "   结果: $total 个地点"
if [ "$total" = "345" ]; then
    echo "   ✅ 通过！"
else
    echo "   ⚠️  预期 345，实际 $total"
fi
echo ""

# 测试模糊匹配
echo "4️⃣ 测试模糊匹配 (nouveau)..."
result=$(curl -s "http://localhost:3000/api/public-places?tag=nouveau&limit=3")
total=$(echo $result | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['pagination']['total'])")
echo "   结果: $total 个地点"
if [ "$total" = "110" ]; then
    echo "   ✅ 通过！"
else
    echo "   ⚠️  预期 110，实际 $total"
fi
echo ""

echo "===================="
echo "✅ 标签筛选测试完成！"
