#!/bin/bash

echo "========================================="
echo "Google Sign-In 诊断脚本"
echo "========================================="
echo ""

cd "$(dirname "$0")/wanderlog_app"

echo "1. 检查 Info.plist 配置..."
if grep -q "GIDClientID" ios/Runner/Info.plist; then
  echo "✅ GIDClientID 已配置"
  grep -A 1 "GIDClientID" ios/Runner/Info.plist | tail -1
else
  echo "❌ 缺少 GIDClientID"
fi

if grep -q "CFBundleURLSchemes" ios/Runner/Info.plist; then
  echo "✅ URL Scheme 已配置"
  grep -A 2 "CFBundleURLSchemes" ios/Runner/Info.plist | tail -1
else
  echo "❌ 缺少 URL Scheme"
fi

echo ""
echo "2. 检查 .env 文件..."
if [ -f ".env" ]; then
  echo "✅ .env 文件存在"
  if grep -q "GOOGLE_CLIENT_ID" .env; then
    echo "✅ GOOGLE_CLIENT_ID 已配置"
    grep "GOOGLE_CLIENT_ID" .env
  else
    echo "❌ 缺少 GOOGLE_CLIENT_ID"
  fi
else
  echo "❌ .env 文件不存在"
fi

echo ""
echo "3. 检查网络连接..."
if curl -s --connect-timeout 5 https://accounts.google.com > /dev/null; then
  echo "✅ 可以访问 Google 服务"
else
  echo "❌ 无法访问 Google 服务"
  echo "   可能需要配置代理或检查网络"
fi

echo ""
echo "4. 检查 Pods 安装..."
if [ -d "ios/Pods" ]; then
  echo "✅ Pods 已安装"
  if ls ios/Pods | grep -q "Google"; then
    echo "✅ Google 相关 Pods:"
    ls ios/Pods | grep Google
  fi
else
  echo "❌ Pods 未安装，请运行: cd ios && pod install"
fi

echo ""
echo "5. 推荐的修复步骤："
echo "   1) 确保网络可以访问 Google 服务"
echo "   2) 确认 Google Cloud Console 中的 OAuth 配置正确"
echo "   3) 验证 iOS Client ID 和 URL Scheme 匹配"
echo "   4) 尝试: cd ios && pod install && cd .."
echo "   5) 清理并重新构建: flutter clean && flutter pub get"
echo ""
