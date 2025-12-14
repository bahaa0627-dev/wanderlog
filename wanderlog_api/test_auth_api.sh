#!/bin/bash

# 🧪 认证 API 测试脚本

BASE_URL="http://localhost:3000/api/auth"
TEST_EMAIL="test_$(date +%s)@example.com"
TEST_PASSWORD="Test123456"
TEST_NAME="Test User"

echo "🧪 认证 API 完整测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📧 测试邮箱: $TEST_EMAIL"
echo "🔑 测试密码: $TEST_PASSWORD"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# 1. 注册测试
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  测试用户注册"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"name\": \"$TEST_NAME\"
  }")

echo "$REGISTER_RESPONSE" | jq .

# 提取 token
TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token')
VERIFICATION_CODE=""

if [ "$TOKEN" != "null" ]; then
    echo -e "${GREEN}✅ 注册成功${NC}"
    echo "🔑 Token: ${TOKEN:0:20}..."
    echo ""
    echo "📧 请检查邮箱并输入验证码"
    read -p "输入 6 位验证码: " VERIFICATION_CODE
else
    echo -e "${RED}❌ 注册失败${NC}"
    exit 1
fi

# ============================================
# 2. 验证邮箱
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  测试邮箱验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/verify-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"code\": \"$VERIFICATION_CODE\"
  }")

echo "$VERIFY_RESPONSE" | jq .

NEW_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.token')
if [ "$NEW_TOKEN" != "null" ]; then
    TOKEN=$NEW_TOKEN
    echo -e "${GREEN}✅ 邮箱验证成功${NC}"
    echo "🔑 新 Token: ${TOKEN:0:20}..."
else
    echo -e "${YELLOW}⚠️  验证码可能错误，继续使用原 Token${NC}"
fi

# ============================================
# 3. 获取用户信息
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  测试获取用户信息"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ME_RESPONSE=$(curl -s -X GET "$BASE_URL/me" \
  -H "Authorization: Bearer $TOKEN")

echo "$ME_RESPONSE" | jq .

if echo "$ME_RESPONSE" | jq -e '.id' > /dev/null; then
    echo -e "${GREEN}✅ 获取用户信息成功${NC}"
else
    echo -e "${RED}❌ 获取用户信息失败${NC}"
fi

# ============================================
# 4. 重发验证码（如果邮箱未验证）
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  测试重发验证码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESEND_RESPONSE=$(curl -s -X POST "$BASE_URL/resend-verification" \
  -H "Authorization: Bearer $TOKEN")

echo "$RESEND_RESPONSE" | jq .

if echo "$RESEND_RESPONSE" | jq -e '.message' > /dev/null; then
    echo -e "${GREEN}✅ 重发验证码请求成功${NC}"
else
    echo -e "${YELLOW}⚠️  可能已验证或请求过于频繁${NC}"
fi

# ============================================
# 5. 登出
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  测试登出"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/logout" \
  -H "Authorization: Bearer $TOKEN")

echo "$LOGOUT_RESPONSE" | jq .

if echo "$LOGOUT_RESPONSE" | jq -e '.message' > /dev/null; then
    echo -e "${GREEN}✅ 登出成功${NC}"
else
    echo -e "${RED}❌ 登出失败${NC}"
fi

# ============================================
# 6. 重新登录
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  测试重新登录"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

echo "$LOGIN_RESPONSE" | jq .

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refreshToken')

if [ "$TOKEN" != "null" ]; then
    echo -e "${GREEN}✅ 登录成功${NC}"
    echo "🔑 Access Token: ${TOKEN:0:20}..."
    echo "🔄 Refresh Token: ${REFRESH_TOKEN:0:20}..."
else
    echo -e "${RED}❌ 登录失败${NC}"
    exit 1
fi

# ============================================
# 7. 刷新 Token
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  测试刷新 Token"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/refresh-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }")

echo "$REFRESH_RESPONSE" | jq .

NEW_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.token')
if [ "$NEW_TOKEN" != "null" ]; then
    echo -e "${GREEN}✅ Token 刷新成功${NC}"
    echo "🔑 新 Token: ${NEW_TOKEN:0:20}..."
else
    echo -e "${RED}❌ Token 刷新失败${NC}"
fi

# ============================================
# 8. 忘记密码
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8️⃣  测试忘记密码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FORGOT_RESPONSE=$(curl -s -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\"
  }")

echo "$FORGOT_RESPONSE" | jq .

if echo "$FORGOT_RESPONSE" | jq -e '.message' > /dev/null; then
    echo -e "${GREEN}✅ 密码重置邮件已发送${NC}"
    echo ""
    echo "📧 请检查邮箱并输入重置验证码"
    read -p "输入 6 位重置码 (可选，按Enter跳过): " RESET_CODE
else
    echo -e "${RED}❌ 发送重置邮件失败${NC}"
fi

# ============================================
# 9. 重置密码（如果有重置码）
# ============================================
if [ ! -z "$RESET_CODE" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "9️⃣  测试重置密码"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    NEW_PASSWORD="NewPass123456"

    RESET_RESPONSE=$(curl -s -X POST "$BASE_URL/reset-password" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$TEST_EMAIL\",
        \"code\": \"$RESET_CODE\",
        \"newPassword\": \"$NEW_PASSWORD\"
      }")

    echo "$RESET_RESPONSE" | jq .

    if echo "$RESET_RESPONSE" | jq -e '.message' > /dev/null; then
        echo -e "${GREEN}✅ 密码重置成功${NC}"
        echo "🔑 新密码: $NEW_PASSWORD"
    else
        echo -e "${RED}❌ 密码重置失败${NC}"
    fi
fi

# ============================================
# 总结
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 测试总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ 测试完成！"
echo ""
echo "测试的端点："
echo "  1. POST /api/auth/register          - 用户注册"
echo "  2. POST /api/auth/verify-email      - 验证邮箱"
echo "  3. GET  /api/auth/me                - 获取用户信息"
echo "  4. POST /api/auth/resend-verification - 重发验证码"
echo "  5. POST /api/auth/logout            - 登出"
echo "  6. POST /api/auth/login             - 登录"
echo "  7. POST /api/auth/refresh-token     - 刷新 Token"
echo "  8. POST /api/auth/forgot-password   - 忘记密码"
echo "  9. POST /api/auth/reset-password    - 重置密码"
echo ""
echo "📧 测试账号信息："
echo "  邮箱: $TEST_EMAIL"
echo "  密码: $TEST_PASSWORD"
echo ""
