#!/bin/bash

echo "📊 Mine Page Performance Test"
echo "=============================="
echo ""

# 从 wanderlog_app/.env 读取 API base URL
API_BASE="http://127.0.0.1:3000/api"

# 使用一个测试账号的 token（需要替换）
# 你可以通过登录 app 获取 token，或者从 Flutter DevTools 查看
echo "⚠️  请确保你已经登录 app，并从 Flutter DevTools 或日志中获取 auth_token"
echo ""
echo "测试步骤："
echo "1. 测试 /api/destinations 端点响应时间"
echo "2. 测量响应大小"
echo "3. 分析数据结构"
echo ""

# 如果有 token，可以测试
# TOKEN="your_token_here"
# echo "🔐 Using token: ${TOKEN:0:20}..."
# 
# echo "⏱️  Testing API response time..."
# time curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/destinations" -o /tmp/destinations_response.json
# 
# echo ""
# echo "📦 Response size:"
# ls -lh /tmp/destinations_response.json | awk '{print $5}'
# 
# echo ""
# echo "📊 Data structure:"
# cat /tmp/destinations_response.json | python3 -c "
# import sys, json
# data = json.load(sys.stdin)
# print(f'Trips: {len(data)}')
# total_spots = sum(len(t.get('tripSpots', [])) for t in data)
# print(f'Total spots: {total_spots}')
# if data:
#     print(f'Average spots per trip: {total_spots / len(data):.1f}')
# "

echo ""
echo "💡 提示：要运行完整测试，请："
echo "  1. 在 Flutter app 中登录"
echo "  2. 查看控制台找到 'auth_token'"
echo "  3. 取消注释此脚本中的 TOKEN 行并替换"
echo "  4. 重新运行此脚本"
