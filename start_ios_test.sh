#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           📱 启动 iOS 应用进行注册测试                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")/wanderlog_app"

echo "🔍 检查可用设备..."
flutter devices

echo ""
echo "🚀 启动 iOS 应用..."
echo ""
echo "提示: 应用启动后，请按照以下步骤测试："
echo "  1. 点击 'Sign Up' 或 'Create Account'"
echo "  2. 输入注册信息："
echo "     Email:    blcubahaa0627@gmail.com"
echo "     Password: Test123456"
echo "     Name:     Test User"
echo "  3. 等待验证码页面"
echo "  4. 获取验证码（查看邮箱或使用 Prisma Studio）"
echo "  5. 输入验证码完成验证"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动 Flutter 应用（iOS 模拟器）
flutter run -d "C0299AAE-F6B9-4037-A845-491D7AF590E5"
