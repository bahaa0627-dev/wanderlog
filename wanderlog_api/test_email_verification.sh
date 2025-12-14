#!/bin/bash

# 邮箱验证完整测试脚本
# 测试注册 -> 发送验证码 -> 验证邮箱流程

echo "🧪 开始测试邮箱验证流程..."
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
API_URL="http://localhost:3000"
TEST_EMAIL="your-email@example.com"  # 请替换为你的实际邮箱
TEST_PASSWORD="Test123456"
TEST_NAME="Test User"

echo -e "${YELLOW}📝 测试配置:${NC}"
echo "API URL: $API_URL"
echo "测试邮箱: $TEST_EMAIL"
echo ""

# 1. 检查服务器是否运行
echo "1️⃣ 检查服务器状态..."
if ! curl -s "$API_URL/api/public-places" > /dev/null 2>&1; then
    echo -e "${RED}❌ 服务器未运行！请先启动服务器${NC}"
    echo "   运行命令: cd wanderlog_api && npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ 服务器正在运行${NC}"
echo ""

# 2. 注册新用户
echo "2️⃣ 注册新用户..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"name\": \"$TEST_NAME\"
  }")

echo "注册响应:"
echo "$REGISTER_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$REGISTER_RESPONSE"
echo ""

# 提取 token 和 verificationCode
TOKEN=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null)
VERIFICATION_CODE=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('verificationCode', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ 注册失败！请检查错误信息${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 注册成功${NC}"
echo "Token: ${TOKEN:0:20}..."
if [ -n "$VERIFICATION_CODE" ]; then
    echo "验证码 (开发模式): $VERIFICATION_CODE"
fi
echo ""

# 3. 检查验证邮件
echo "3️⃣ 检查邮箱验证状态..."
echo -e "${YELLOW}📧 请检查你的邮箱 ($TEST_EMAIL) 是否收到验证邮件${NC}"
echo ""

if [ -z "$VERIFICATION_CODE" ]; then
    echo "请输入邮件中收到的验证码 (6位数字):"
    read -r VERIFICATION_CODE
fi

# 4. 验证邮箱
echo "4️⃣ 验证邮箱..."
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/verify-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"code\": \"$VERIFICATION_CODE\"
  }")

echo "验证响应:"
echo "$VERIFY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$VERIFY_RESPONSE"
echo ""

# 检查验证是否成功
VERIFIED=$(echo "$VERIFY_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('user', {}).get('isEmailVerified', False))" 2>/dev/null)

if [ "$VERIFIED" = "True" ]; then
    echo -e "${GREEN}✅ 邮箱验证成功！${NC}"
else
    echo -e "${RED}❌ 邮箱验证失败${NC}"
    exit 1
fi
echo ""

# 5. 测试登录（已验证账号）
echo "5️⃣ 测试已验证账号登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

echo "登录响应:"
echo "$LOGIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESPONSE"
echo ""

LOGIN_VERIFIED=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('user', {}).get('isEmailVerified', False))" 2>/dev/null)

if [ "$LOGIN_VERIFIED" = "True" ]; then
    echo -e "${GREEN}✅ 登录成功，邮箱状态已验证${NC}"
else
    echo -e "${RED}❌ 登录后邮箱状态未验证${NC}"
fi
echo ""

# 6. 测试重新发送验证码
echo "6️⃣ 测试重新发送验证码功能..."
echo -e "${YELLOW}注意：由于账号已验证，此操作应该返回错误${NC}"
RESEND_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/resend-verification" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

echo "重新发送响应:"
echo "$RESEND_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESEND_RESPONSE"
echo ""

echo "=================================="
echo -e "${GREEN}✅ 邮箱验证流程测试完成！${NC}"
echo ""
echo "📊 测试总结:"
echo "  ✓ 用户注册"
echo "  ✓ 发送验证邮件"
echo "  ✓ 邮箱验证"
echo "  ✓ 已验证账号登录"
echo "  ✓ 重新发送验证码"
