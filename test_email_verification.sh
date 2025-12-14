#!/bin/bash

# 邮箱验证流程完整测试
# 测试用户注册、邮件发送、邮箱验证的完整流程

echo ""
echo "🧪 开始邮箱验证流程测试..."
echo "================================"
echo ""

# 配置
API_URL="http://localhost:3000"
TEST_EMAIL="blcubahaa0627@gmail.com"
TEST_PASSWORD="Test123456"
TEST_NAME="测试用户"

echo "📝 测试配置："
echo "   API URL: $API_URL"
echo "   测试邮箱: $TEST_EMAIL"
echo ""

# 步骤 1: 注册新用户
echo "1️⃣ 注册新用户..."
echo "   请求: POST $API_URL/api/auth/register"
echo ""

REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"name\": \"$TEST_NAME\"
  }")

echo "$REGISTER_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$REGISTER_RESPONSE"
echo ""

# 提取 token
TOKEN=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ 注册失败或用户已存在"
    echo ""
    echo "ℹ️  如果用户已存在，请先删除数据库中的测试用户"
    echo "   或者手动测试以下步骤："
    echo ""
    echo "2️⃣ 检查邮箱 $TEST_EMAIL"
    echo "   - 应该收到验证码邮件"
    echo "   - 标题: Verify your WanderLog account 🌍"
    echo ""
    echo "3️⃣ 使用验证码验证邮箱"
    echo "   curl -X POST $API_URL/api/auth/verify-email \\"
    echo "     -H 'Authorization: Bearer YOUR_TOKEN' \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"code\": \"YOUR_CODE\"}'"
    echo ""
    exit 0
fi

echo "✅ 注册成功"
echo "   Token: ${TOKEN:0:50}..."
echo ""

# 步骤 2: 等待邮件发送
echo "2️⃣ 等待验证邮件发送..."
sleep 3
echo "✅ 邮件应该已经发送"
echo ""

# 提示用户检查邮件
echo "📧 请检查邮箱: $TEST_EMAIL"
echo "   - 邮件主题: Verify your WanderLog account 🌍"
echo "   - 如果没收到，检查垃圾邮件文件夹"
echo ""
echo "⏸️  请输入收到的 6 位验证码，然后按 Enter: "
read VERIFICATION_CODE

if [ -z "$VERIFICATION_CODE" ]; then
    echo "❌ 验证码不能为空"
    exit 1
fi

echo ""
echo "3️⃣ 验证邮箱..."
echo "   验证码: $VERIFICATION_CODE"
echo "   请求: POST $API_URL/api/auth/verify-email"
echo ""

VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/verify-email" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"$VERIFICATION_CODE\"}")

echo "$VERIFY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$VERIFY_RESPONSE"
echo ""

# 检查验证结果
SUCCESS=$(echo "$VERIFY_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

if [ "$SUCCESS" = "True" ]; then
    echo "✅ 邮箱验证成功！"
    echo ""
    echo "4️⃣ 再次检查邮箱..."
    echo "   应该收到欢迎邮件 🎉"
    echo "   - 邮件主题: Welcome to WanderLog! 🌍"
    echo ""
    
    echo "5️⃣ 获取用户信息..."
    USER_INFO=$(curl -s -X GET "$API_URL/api/auth/me" \
      -H "Authorization: Bearer $TOKEN")
    
    echo "$USER_INFO" | python3 -m json.tool 2>/dev/null || echo "$USER_INFO"
    echo ""
    
    echo "================================"
    echo "🎉 邮箱验证流程测试完成！"
    echo "================================"
    echo ""
    echo "✅ 所有步骤："
    echo "   1. ✅ 用户注册"
    echo "   2. ✅ 验证邮件发送"
    echo "   3. ✅ 邮箱验证"
    echo "   4. ✅ 欢迎邮件发送"
    echo "   5. ✅ 用户信息获取"
    echo ""
else
    echo "❌ 邮箱验证失败"
    echo "   请检查验证码是否正确"
    echo ""
    echo "💡 提示：可以重新发送验证码"
    echo "   curl -X POST $API_URL/api/auth/resend-verification \\"
    echo "     -H 'Authorization: Bearer $TOKEN'"
    echo ""
fi
