#!/bin/bash

# iOS Google 登录配置检查工具

echo "🍎 iOS Google 登录配置检查"
echo "================================"
echo ""

# 项目路径
PROJECT_ROOT="/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog"
APP_ROOT="$PROJECT_ROOT/wanderlog_app"
IOS_ROOT="$APP_ROOT/ios"
INFO_PLIST="$IOS_ROOT/Runner/Info.plist"
ENV_FILE="$APP_ROOT/.env"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Bundle ID
echo "📦 Bundle ID 信息："
echo "--------------------------------"
BUNDLE_ID=$(grep -A 1 "PRODUCT_BUNDLE_IDENTIFIER = " "$IOS_ROOT/Runner.xcodeproj/project.pbxproj" | head -1 | sed 's/.*= //' | sed 's/;//' | tr -d ' ')
echo "Bundle ID: $BUNDLE_ID"
echo ""

# 检查 .env 配置
echo "⚙️  前端配置检查："
echo "--------------------------------"
if [ -f "$ENV_FILE" ]; then
    if grep -q "GOOGLE_CLIENT_ID=" "$ENV_FILE"; then
        CLIENT_ID=$(grep "GOOGLE_CLIENT_ID=" "$ENV_FILE" | cut -d'=' -f2)
        if [ "$CLIENT_ID" = "placeholder" ] || [ -z "$CLIENT_ID" ]; then
            echo -e "${RED}❌ GOOGLE_CLIENT_ID 未配置${NC}"
            echo "   当前值: $CLIENT_ID"
        else
            echo -e "${GREEN}✅ GOOGLE_CLIENT_ID 已配置${NC}"
            echo "   值: $CLIENT_ID"
        fi
    else
        echo -e "${RED}❌ .env 中缺少 GOOGLE_CLIENT_ID${NC}"
    fi
else
    echo -e "${RED}❌ .env 文件不存在${NC}"
fi
echo ""

# 检查 Info.plist 配置
echo "📱 iOS Info.plist 配置检查："
echo "--------------------------------"
if [ -f "$INFO_PLIST" ]; then
    if grep -q "GIDClientID" "$INFO_PLIST"; then
        echo -e "${GREEN}✅ GIDClientID 已配置${NC}"
        GID_CLIENT_ID=$(grep -A 1 "GIDClientID" "$INFO_PLIST" | grep "<string>" | sed 's/.*<string>//' | sed 's/<\/string>.*//' | tr -d ' \t')
        echo "   值: $GID_CLIENT_ID"
    else
        echo -e "${RED}❌ Info.plist 中缺少 GIDClientID${NC}"
    fi
    
    if grep -q "CFBundleURLSchemes" "$INFO_PLIST"; then
        echo -e "${GREEN}✅ CFBundleURLSchemes 已配置${NC}"
    else
        echo -e "${RED}❌ Info.plist 中缺少 CFBundleURLSchemes${NC}"
    fi
else
    echo -e "${RED}❌ Info.plist 文件不存在${NC}"
fi
echo ""

# 给出配置建议
echo "================================"
echo "📚 配置步骤："
echo "================================"
echo ""

if [ "$CLIENT_ID" = "placeholder" ] || [ -z "$CLIENT_ID" ] || ! grep -q "GIDClientID" "$INFO_PLIST" 2>/dev/null; then
    echo -e "${YELLOW}需要配置 Google OAuth 凭证！${NC}"
    echo ""
    echo "1️⃣  访问 Google Cloud Console："
    echo "   https://console.cloud.google.com/"
    echo ""
    echo "2️⃣  创建 OAuth 客户端 ID："
    echo "   - 类型：iOS"
    echo "   - Bundle ID: $BUNDLE_ID"
    echo ""
    echo "3️⃣  更新前端配置："
    echo "   编辑: $ENV_FILE"
    echo "   添加: GOOGLE_CLIENT_ID=你的iOS客户端ID"
    echo ""
    echo "4️⃣  更新 iOS 配置："
    echo "   编辑: $INFO_PLIST"
    echo "   参考: IOS_GOOGLE_LOGIN_SETUP.md"
    echo ""
    echo "📖 详细步骤请查看："
    echo "   cat IOS_GOOGLE_LOGIN_SETUP.md"
else
    echo -e "${GREEN}✅ 配置看起来正常！${NC}"
    echo ""
    echo "🧪 测试步骤："
    echo "1. flutter clean"
    echo "2. cd ios && pod install && cd .."
    echo "3. flutter run"
    echo "4. 点击 Google 登录按钮"
fi

echo ""
echo "================================"
echo ""

# 提供快速操作选项
echo "🔧 快速操作："
echo ""
echo "查看详细配置文档："
echo "  cat IOS_GOOGLE_LOGIN_SETUP.md"
echo ""
echo "编辑 .env 文件："
echo "  nano $ENV_FILE"
echo ""
echo "编辑 Info.plist："
echo "  nano $INFO_PLIST"
echo ""
echo "清理并重新构建："
echo "  cd $APP_ROOT && flutter clean && cd ios && pod install && cd .. && flutter run"
echo ""
