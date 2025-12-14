#!/bin/bash

echo "🧪 Google 登录崩溃修复验证"
echo "=============================="
echo ""

# 检查修改的文件
echo "✅ 检查修改的文件..."
echo ""

# 1. 检查 google_auth_service.dart
if grep -q "placeholder" /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/lib/features/auth/services/google_auth_service.dart; then
    echo "✅ google_auth_service.dart - 已添加 placeholder 检查"
else
    echo "⚠️  google_auth_service.dart - 可能需要检查"
fi

# 2. 检查 .env 文件
if grep -q "GOOGLE_CLIENT_ID=placeholder" /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/.env; then
    echo "✅ .env - GOOGLE_CLIENT_ID 已设置为 placeholder"
else
    echo "⚠️  .env - GOOGLE_CLIENT_ID 未设置"
fi

# 3. 检查错误处理
if grep -q "debugPrint" /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/lib/features/auth/presentation/pages/login_page.dart; then
    echo "✅ login_page.dart - 已添加调试日志"
fi

if grep -q "try {" /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/lib/features/auth/services/google_auth_service.dart; then
    echo "✅ google_auth_service.dart - 已添加 try-catch"
fi

echo ""
echo "=============================="
echo "📱 测试步骤："
echo "=============================="
echo ""
echo "1. 在 Flutter 应用终端按 'r' 进行热重载"
echo "   或按 'R' 进行热重启"
echo ""
echo "2. 在模拟器中导航到登录页面"
echo ""
echo "3. 点击 'Continue with Google' 按钮"
echo ""
echo "4. 应该看到提示消息："
echo "   \"Google 登录暂未配置"
echo "   请参考 GOOGLE_LOGIN_QUICK_START.md\""
echo ""
echo "5. 应用不应该崩溃 ✅"
echo ""
echo "=============================="
echo "📚 配置 Google 登录："
echo "=============================="
echo ""
echo "查看文档："
echo "- GOOGLE_LOGIN_CRASH_FIXED.md"
echo "- GOOGLE_LOGIN_QUICK_START.md"
echo ""
echo "配置步骤："
echo "1. 访问 https://console.cloud.google.com/"
echo "2. 创建 OAuth 2.0 凭证"
echo "3. 更新 .env 文件中的 GOOGLE_CLIENT_ID"
echo "4. 配置 iOS Info.plist"
echo "5. 重启应用"
echo ""
