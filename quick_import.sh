#!/bin/bash

# 快速导入 Google Maps 地点 - 使用指南
# ============================================

echo "🗺️  Google Maps 地点导入工具"
echo ""
echo "选择导入方法:"
echo ""
echo "1️⃣  Apify 自动爬取 (适用于完整 URL)"
echo "2️⃣  手动导入 Place IDs (推荐，100% 可靠)"
echo "3️⃣  查看导入结果"
echo "4️⃣  查看完整文档"
echo ""
read -p "请选择 (1-4): " choice

case $choice in
  1)
    echo ""
    echo "📝 Apify 自动爬取"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "运行命令:"
    echo "cd wanderlog_api"
    echo "http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npx tsx import_places.ts"
    echo ""
    echo "⚠️  注意: 短链接 (goo.gl) 可能无法爬取"
    echo ""
    ;;
    
  2)
    echo ""
    echo "📝 手动导入 Place IDs"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "步骤 1: 从 Google Maps 提取 Place ID"
    echo "  • 打开地点详情"
    echo "  • 从 URL 复制 Place ID"
    echo "    格式: place_id=ChIJ..."
    echo ""
    echo "步骤 2: 创建 wanderlog_api/place_ids.json"
    echo ""
    cat <<'EOF'
{
  "placeIds": [
    "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "ChIJD3uTd9hx5kcR1IQvGfr8dbk"
  ],
  "note": "从 Google Maps 导入",
  "listUrl": "https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9"
}
EOF
    echo ""
    echo "步骤 3: 运行导入"
    echo "cd wanderlog_api"
    echo "http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npx tsx import_manual_places.ts"
    echo ""
    ;;
    
  3)
    echo ""
    echo "📊 查看导入结果"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "查看所有地点:"
    echo "curl http://localhost:3000/api/public-places | python3 -m json.tool"
    echo ""
    echo "查看统计信息:"
    echo "curl http://localhost:3000/api/public-places/stats | python3 -m json.tool"
    echo ""
    echo "搜索地点:"
    echo "curl 'http://localhost:3000/api/public-places/search?q=Paris' | python3 -m json.tool"
    echo ""
    ;;
    
  4)
    echo ""
    echo "📚 完整文档"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "• IMPORT_GOOGLE_MAPS_LIST_GUIDE.md - 详细使用指南"
    echo "• IMPORT_SUMMARY.md - 实施总结"
    echo "• PUBLIC_PLACES_LIBRARY_README.md - API 文档"
    echo ""
    echo "使用 cat 命令查看:"
    echo "cat IMPORT_GOOGLE_MAPS_LIST_GUIDE.md"
    echo ""
    ;;
    
  *)
    echo ""
    echo "❌ 无效选择"
    echo ""
    ;;
esac

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 提示:"
echo "  • 确保 API 服务器正在运行 (npm run dev)"
echo "  • 使用代理访问 Google Maps API"
echo "  • 手动导入最可靠"
echo ""
