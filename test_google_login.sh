#!/bin/bash

# 测试 Google 登录 API
# 注意：此脚本仅用于测试后端 API 端点，实际的 Google ID Token 需要从前端获取

API_URL="http://localhost:3000/api/auth/google"

echo "======================================"
echo "🧪 测试 Google 登录 API"
echo "======================================"
echo ""

# 测试 1: 缺少 idToken
echo "📝 测试 1: 发送空请求（应该返回 400 错误）"
echo "--------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool 2>/dev/null || curl -X POST "$API_URL" -H "Content-Type: application/json" -d '{}'
echo ""
echo ""

# 测试 2: 无效的 idToken
echo "📝 测试 2: 发送无效的 idToken（应该返回 401 错误）"
echo "--------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"idToken": "invalid_token_123"}' | python3 -m json.tool 2>/dev/null || curl -X POST "$API_URL" -H "Content-Type: application/json" -d '{"idToken": "invalid_token_123"}'
echo ""
echo ""

echo "======================================"
echo "ℹ️  说明"
echo "======================================"
echo "✅ API 端点已创建: POST /api/auth/google"
echo "✅ 需要参数: { \"idToken\": \"Google ID Token\" }"
echo ""
echo "📱 要进行完整测试，请："
echo "1. 确保已配置 Google OAuth 凭证（参考 GOOGLE_OAUTH_SETUP_GUIDE.md）"
echo "2. 在 Flutter 应用中点击 'Continue with Google' 按钮"
echo "3. 选择 Google 账号并授权"
echo "4. 查看后端日志确认登录成功"
echo ""
echo "🔍 查看后端日志："
echo "   tail -f wanderlog_api/logs/*.log"
echo ""
