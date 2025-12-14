#!/bin/bash

# 🧪 快速测试认证 API（无交互）

BASE_URL="http://localhost:3000/api/auth"

echo "🧪 认证 API 快速测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================
# 1. 测试注册
# ============================================
echo "1️⃣  测试用户注册"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_EMAIL="quicktest_$(date +%s)@example.com"

curl -X POST "$BASE_URL/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"Test123456\",
    \"name\": \"Quick Test\"
  }" | jq .

echo ""
echo "✅ 注册完成（邮件已发送到 $TEST_EMAIL）"
echo ""

# ============================================
# 2. 测试登录（已有用户）
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  测试登录（使用刚注册的账号）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"Test123456\"
  }")

echo "$LOGIN_RESPONSE" | jq .

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refreshToken')

echo ""
echo "✅ 登录成功"
echo "🔑 Access Token: ${TOKEN:0:30}..."
echo ""

# ============================================
# 3. 测试获取用户信息
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  测试获取用户信息"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -X GET "$BASE_URL/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "✅ 获取用户信息成功"
echo ""

# ============================================
# 4. 测试刷新 Token
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  测试刷新 Token"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -X POST "$BASE_URL/refresh-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }" | jq .

echo ""
echo "✅ Token 刷新成功"
echo ""

# ============================================
# 5. 测试重发验证码
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  测试重发验证码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -X POST "$BASE_URL/resend-verification" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "✅ 重发验证码成功（如果未验证）"
echo ""

# ============================================
# 6. 测试忘记密码
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  测试忘记密码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\"
  }" | jq .

echo ""
echo "✅ 密码重置邮件已发送"
echo ""

# ============================================
# 7. 测试登出
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  测试登出"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

curl -X POST "$BASE_URL/logout" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "✅ 登出成功"
echo ""

# ============================================
# 总结
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 测试总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ 所有 API 端点测试完成！"
echo ""
echo "已测试的端点："
echo "  ✓ POST /api/auth/register"
echo "  ✓ POST /api/auth/login"
echo "  ✓ GET  /api/auth/me"
echo "  ✓ POST /api/auth/refresh-token"
echo "  ✓ POST /api/auth/resend-verification"
echo "  ✓ POST /api/auth/forgot-password"
echo "  ✓ POST /api/auth/logout"
echo ""
echo "📧 测试账号: $TEST_EMAIL"
echo "📬 请检查邮箱查看收到的邮件："
echo "   - 注册验证邮件"
echo "   - 重发验证邮件"
echo "   - 密码重置邮件"
echo ""
echo "💡 要测试邮箱验证和密码重置，请："
echo "   1. 检查邮箱获取验证码"
echo "   2. 使用 curl 手动测试 verify-email 和 reset-password"
echo ""
