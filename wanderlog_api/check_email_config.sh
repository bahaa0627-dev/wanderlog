#!/bin/bash

# 🔍 检查邮件服务配置

echo "🔍 检查 Resend 邮件服务配置..."
echo "================================"
echo ""

# 检查 .env 文件是否存在
if [ ! -f ".env" ]; then
    echo "❌ 找不到 .env 文件"
    exit 1
fi

# 检查 RESEND_API_KEY
echo "1️⃣ 检查 RESEND_API_KEY..."
if grep -q "RESEND_API_KEY=re_" .env; then
    echo "   ✅ API Key 已配置"
    # 显示 API Key 的前10个字符
    KEY=$(grep "RESEND_API_KEY=" .env | cut -d'=' -f2)
    echo "   📝 Key: ${KEY:0:10}..."
else
    echo "   ❌ API Key 未配置或格式错误"
    echo ""
    echo "请按以下步骤操作："
    echo ""
    echo "1. 访问 https://resend.com/signup 注册账号"
    echo "2. 获取 API Key: https://resend.com/api-keys"
    echo "3. 编辑 .env 文件："
    echo "   nano .env"
    echo ""
    echo "4. 找到这一行："
    echo "   RESEND_API_KEY=your_resend_api_key_here"
    echo ""
    echo "5. 替换为你的实际 API Key："
    echo "   RESEND_API_KEY=re_你的API_Key"
    echo ""
    exit 1
fi

# 检查发件人邮箱
echo ""
echo "2️⃣ 检查发件人邮箱..."
if grep -q "RESEND_FROM_EMAIL=" .env; then
    FROM_EMAIL=$(grep "RESEND_FROM_EMAIL=" .env | cut -d'=' -f2)
    echo "   ✅ 发件人: $FROM_EMAIL"
else
    echo "   ⚠️  未配置发件人邮箱"
fi

# 检查 node_modules
echo ""
echo "3️⃣ 检查依赖..."
if [ -d "node_modules/resend" ]; then
    echo "   ✅ Resend 包已安装"
else
    echo "   ❌ Resend 包未安装"
    echo "   运行: npm install"
    exit 1
fi

# 所有检查通过
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 所有配置检查通过！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 现在可以运行测试："
echo ""
echo "   npm run test:email your-email@gmail.com"
echo ""
echo "⚠️  重要：请使用你自己的邮箱地址！"
echo "   开发环境只能发送到你自己的邮箱。"
echo ""
