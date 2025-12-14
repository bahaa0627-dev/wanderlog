#!/bin/bash

echo "🚨 Google 登录授权错误分析"
echo "========================================"
echo ""

# 检查当前配置
echo "📋 当前配置信息："
echo "----------------------------------------"
echo ""

# Bundle ID
BUNDLE_ID=$(grep -A 1 "PRODUCT_BUNDLE_IDENTIFIER = " /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/ios/Runner.xcodeproj/project.pbxproj | head -1 | sed 's/.*= //' | sed 's/;//' | tr -d ' ')
echo "Bundle ID: $BUNDLE_ID"
echo ""

# 当前 Client ID
if [ -f "/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/.env" ]; then
    CURRENT_CLIENT_ID=$(grep "GOOGLE_CLIENT_ID=" /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app/.env | cut -d'=' -f2)
    echo "当前 Client ID: $CURRENT_CLIENT_ID"
    echo ""
fi

echo "========================================"
echo "❌ 错误原因："
echo "========================================"
echo ""
echo "当前使用的是 WEB 类型的 Client ID"
echo "iOS 应用需要 iOS 类型的 Client ID"
echo ""

echo "========================================"
echo "✅ 解决方案："
echo "========================================"
echo ""
echo "1️⃣  创建 iOS OAuth 客户端 ID"
echo "   访问: https://console.cloud.google.com/apis/credentials"
echo "   - 点击「创建凭据」→「OAuth 2.0 客户端 ID」"
echo "   - 应用类型: iOS"
echo "   - 软件包 ID: $BUNDLE_ID"
echo ""

echo "2️⃣  更新前端配置"
echo "   编辑: wanderlog_app/.env"
echo "   替换 GOOGLE_CLIENT_ID 为新的 iOS Client ID"
echo ""

echo "3️⃣  更新 Info.plist"
echo "   编辑: wanderlog_app/ios/Runner/Info.plist"
echo "   更新 GIDClientID 和 CFBundleURLSchemes"
echo ""

echo "4️⃣  重新构建应用"
echo "   cd wanderlog_app"
echo "   flutter clean && flutter pub get && cd ios && pod install && cd .. && flutter run"
echo ""

echo "========================================"
echo "📚 详细步骤请查看："
echo "========================================"
echo ""
echo "cat GOOGLE_WEB_CLIENT_ID_ERROR_FIX.md"
echo ""

echo "========================================"
echo "🔑 重要提示："
echo "========================================"
echo ""
echo "• 前端（iOS）：使用 iOS Client ID"
echo "• 后端（验证）：使用 Web Client ID"
echo "• Bundle ID 必须是: $BUNDLE_ID"
echo ""
