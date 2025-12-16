#!/bin/bash

echo "🔐 获取管理员 JWT Token"
echo "================================"
echo ""

BASE_URL="http://localhost:3000/api/auth"
ADMIN_EMAIL="admin@wanderlog.com"
ADMIN_PASSWORD="Admin123456"
ADMIN_NAME="Admin User"

# 检查服务器是否运行
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ 错误: 服务器未运行，请先启动服务器"
    echo "   运行: cd wanderlog_api && npm run dev"
    exit 1
fi

echo "✅ 服务器运行正常"
echo ""

# 1. 尝试登录（如果账号已存在）
echo "🔑 1. 尝试登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASSWORD\"
  }")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo "✅ 登录成功！"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎫 管理员 JWT Token:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$TOKEN"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 使用方法:"
    echo "   在后台管理界面中，将上面的 Token 粘贴到 '管理员 JWT' 输入框"
    exit 0
fi

# 2. 如果登录失败，尝试注册
echo "📝 2. 账号不存在，正在注册..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASSWORD\",
    \"name\": \"$ADMIN_NAME\"
  }")

REGISTER_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token' 2>/dev/null)
VERIFICATION_CODE=$(echo "$REGISTER_RESPONSE" | jq -r '.verificationCode // empty' 2>/dev/null)

if [ -z "$REGISTER_TOKEN" ] || [ "$REGISTER_TOKEN" == "null" ]; then
    ERROR_MSG=$(echo "$REGISTER_RESPONSE" | jq -r '.message // .error // "注册失败"' 2>/dev/null)
    echo "❌ 注册失败: $ERROR_MSG"
    echo ""
    echo "$REGISTER_RESPONSE" | jq '.' 2>/dev/null || echo "$REGISTER_RESPONSE"
    exit 1
fi

echo "✅ 注册成功！"
echo ""

# 3. 获取验证码
if [ -n "$VERIFICATION_CODE" ] && [ "$VERIFICATION_CODE" != "null" ]; then
    CODE="$VERIFICATION_CODE"
    echo "✅ 验证码已在响应中: $CODE"
else
    echo "📱 3. 获取验证码..."
    CODE_RESPONSE=$(curl -s -X GET "$BASE_URL/dev/verification-code" \
      -H "Authorization: Bearer $REGISTER_TOKEN")
    
    CODE=$(echo "$CODE_RESPONSE" | jq -r '.code' 2>/dev/null)
    
    if [ -z "$CODE" ] || [ "$CODE" == "null" ]; then
        echo "❌ 无法获取验证码"
        echo "$CODE_RESPONSE" | jq '.' 2>/dev/null || echo "$CODE_RESPONSE"
        exit 1
    fi
    
    echo "✅ 获取到验证码: $CODE"
fi

echo ""

# 4. 验证邮箱
echo "✉️  4. 验证邮箱..."
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/verify-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REGISTER_TOKEN" \
  -d "{\"code\": \"$CODE\"}")

VERIFY_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.token' 2>/dev/null)
VERIFY_MESSAGE=$(echo "$VERIFY_RESPONSE" | jq -r '.message // ""' 2>/dev/null)

if [ -z "$VERIFY_TOKEN" ] || [ "$VERIFY_TOKEN" == "null" ]; then
    echo "❌ 邮箱验证失败"
    echo "$VERIFY_RESPONSE" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE"
    exit 1
fi

echo "✅ 邮箱验证成功！"
echo ""

# 5. 登录获取JWT
echo "🔑 5. 登录获取 JWT..."
FINAL_LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$ADMIN_EMAIL\",
    \"password\": \"$ADMIN_PASSWORD\"
  }")

FINAL_TOKEN=$(echo "$FINAL_LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null)

if [ -z "$FINAL_TOKEN" ] || [ "$FINAL_TOKEN" == "null" ]; then
    echo "❌ 登录失败"
    echo "$FINAL_LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$FINAL_LOGIN_RESPONSE"
    exit 1
fi

echo "✅ 登录成功！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎫 管理员 JWT Token:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$FINAL_TOKEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 账号信息:"
echo "   邮箱: $ADMIN_EMAIL"
echo "   密码: $ADMIN_PASSWORD"
echo ""
echo "💡 使用方法:"
echo "   在后台管理界面中，将上面的 Token 粘贴到 '管理员 JWT' 输入框"
echo ""

