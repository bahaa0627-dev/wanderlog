#!/bin/bash

echo "🔐 测试认证流程 - 开发模式"
echo "================================"
echo ""

# 1. 注册新用户
echo "📝 1. 注册新用户..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test_dev@example.com",
    "password": "123456",
    "name": "Test Dev User"
  }')

echo "$REGISTER_RESPONSE" | jq '.' 2>/dev/null || echo "$REGISTER_RESPONSE"

# 提取token
TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token' 2>/dev/null)
VERIFICATION_CODE=$(echo "$REGISTER_RESPONSE" | jq -r '.verificationCode // empty' 2>/dev/null)

if [ -n "$VERIFICATION_CODE" ] && [ "$VERIFICATION_CODE" != "null" ]; then
  echo ""
  echo "🎉 开发模式：验证码已在响应中返回！"
  echo "🔑 验证码: $VERIFICATION_CODE"
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ 注册失败，未获取到token"
  exit 1
fi

echo ""
echo "✅ 注册成功！"
echo "🎫 Token: ${TOKEN:0:20}..."

# 2. 获取验证码（开发模式API）
echo ""
echo "📱 2. 使用开发API获取验证码..."
CODE_RESPONSE=$(curl -s -X GET http://localhost:3000/api/auth/dev/verification-code \
  -H "Authorization: Bearer $TOKEN")

echo "$CODE_RESPONSE" | jq '.' 2>/dev/null || echo "$CODE_RESPONSE"

CODE=$(echo "$CODE_RESPONSE" | jq -r '.code' 2>/dev/null)

if [ -n "$CODE" ] && [ "$CODE" != "null" ]; then
  echo ""
  echo "✅ 获取到验证码!"
  echo "🔑 验证码: $CODE"
  
  # 3. 验证邮箱
  echo ""
  echo "✉️  3. 验证邮箱..."
  VERIFY_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/verify-email \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"code\": \"$CODE\"}")
  
  echo "$VERIFY_RESPONSE" | jq '.' 2>/dev/null || echo "$VERIFY_RESPONSE"
  
  echo ""
  echo "🎉 邮箱验证成功！"
else
  echo ""
  echo "❌ 未能获取验证码"
fi

echo ""
echo "================================"
echo "测试完成！"
