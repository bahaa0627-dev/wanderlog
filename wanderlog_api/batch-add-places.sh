#!/bin/bash
# 批量添加地点脚本 - 基于图片识别

echo "🚀 开始批量添加地点..."
echo ""

# 地点 1: Cafe & Restaurant Mars
echo "=== [1/4] Cafe & Restaurant Mars ==="
npx ts-node scripts/add-place-from-image.ts --config place1-cafe-mars.json
echo ""

# 地点 2: Kensal Green Cemetery  
echo "=== [2/4] Kensal Green Cemetery ==="
npx ts-node scripts/add-place-from-image.ts --config place2-kensal-cemetery.json
echo ""

# 地点 3: St Andrew's Church, Kingsbury
echo "=== [3/4] St Andrew's Church, Kingsbury ==="
npx ts-node scripts/add-place-from-image.ts --config place3-st-andrews-church.json
echo ""

# 地点 4: Smith & Wollensky
echo "=== [4/4] Smith & Wollensky ==="
npx ts-node scripts/add-place-from-image.ts --config place4-smith-wollensky.json
echo ""

echo "✅ 批量添加完成！"
