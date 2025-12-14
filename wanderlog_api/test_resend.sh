#!/bin/bash

# 🧪 快速测试 Resend 邮件服务

echo "🧪 Resend 邮件服务快速测试"
echo "================================"
echo ""

# 检查是否提供了邮箱地址
if [ -z "$1" ]; then
    echo "❌ 请提供测试邮箱地址"
    echo ""
    echo "使用方法："
    echo "  ./test_resend.sh your-email@example.com"
    echo ""
    exit 1
fi

TEST_EMAIL=$1

echo "📧 测试邮箱: $TEST_EMAIL"
echo ""

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "❌ 找不到 .env 文件"
    echo ""
    echo "请先配置环境变量："
    echo "  cp .env.example .env"
    echo "  # 然后编辑 .env 添加你的 RESEND_API_KEY"
    echo ""
    exit 1
fi

# 检查 RESEND_API_KEY
if ! grep -q "RESEND_API_KEY=re_" .env; then
    echo "⚠️  警告：RESEND_API_KEY 可能未正确配置"
    echo ""
    echo "请确保 .env 文件中有："
    echo "  RESEND_API_KEY=re_your_actual_api_key"
    echo ""
    echo "获取 API Key："
    echo "  1. 访问 https://resend.com/api-keys"
    echo "  2. 创建新的 API Key"
    echo "  3. 复制到 .env 文件"
    echo ""
fi

echo "🚀 运行测试..."
echo ""

# 运行测试
npm run test:email "$TEST_EMAIL"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ 测试完成！"
    echo ""
    echo "📬 请检查邮箱: $TEST_EMAIL"
    echo "   (如果没收到，检查垃圾邮件文件夹)"
    echo ""
else
    echo ""
    echo "❌ 测试失败"
    echo ""
    echo "常见问题："
    echo "  1. API Key 未配置或无效"
    echo "  2. 使用开发环境时，只能发送到你自己的邮箱"
    echo "  3. 检查网络连接"
    echo ""
    echo "查看完整文档: ./RESEND_SETUP_GUIDE.md"
    echo ""
fi

exit $EXIT_CODE
