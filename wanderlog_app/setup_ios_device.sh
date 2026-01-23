#!/bin/bash

# iOS 真机测试配置脚本
# 根据计划自动配置环境

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        📱 iOS 真机测试配置脚本                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 获取 Mac 的本地 IP 地址
echo "1️⃣ 获取 Mac 的本地 IP 地址..."
MAC_IP_WIFI=$(ipconfig getifaddr en0 2>/dev/null || echo "")
MAC_IP_ETH=$(ipconfig getifaddr en1 2>/dev/null || echo "")

if [ -n "$MAC_IP_WIFI" ]; then
    MAC_IP="$MAC_IP_WIFI"
    echo -e "${GREEN}✅ 找到 Wi-Fi IP: $MAC_IP${NC}"
elif [ -n "$MAC_IP_ETH" ]; then
    MAC_IP="$MAC_IP_ETH"
    echo -e "${GREEN}✅ 找到以太网 IP: $MAC_IP${NC}"
else
    # 尝试从 ifconfig 获取
    MAC_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | grep -v "198.18" | head -1 | awk '{print $2}' | cut -d: -f2)
    if [ -z "$MAC_IP" ]; then
        MAC_IP="192.168.1.6"  # 使用之前的 IP 作为默认值
        echo -e "${YELLOW}⚠️  无法自动获取 IP，使用默认值: $MAC_IP${NC}"
        echo "   请手动检查并更新 .env.dev 文件"
    else
        echo -e "${GREEN}✅ 从 ifconfig 获取 IP: $MAC_IP${NC}"
    fi
fi
echo ""

# 2. 更新 .env.dev 文件
echo "2️⃣ 更新 .env.dev 文件..."
cd "$(dirname "$0")"

if [ ! -f ".env.dev" ]; then
    echo -e "${YELLOW}⚠️  .env.dev 文件不存在，正在创建...${NC}"
    touch .env.dev
fi

# 读取现有配置
MAPBOX_TOKEN=$(grep "MAPBOX_ACCESS_TOKEN" .env.dev 2>/dev/null | cut -d'=' -f2- || echo "pk.eyJ1IjoibW9yaWJhaGFhIiwiYSI6ImNtaXp0MzM5NjAxamgzZXB0dnI3MTl4dzIifQ.sHnu6-JSac2YGSwEhkK8ag")
GOOGLE_CLIENT_ID=$(grep "GOOGLE_CLIENT_ID" .env.dev 2>/dev/null | cut -d'=' -f2- || echo "791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.apps.googleusercontent.com")
SUPABASE_URL=$(grep "SUPABASE_URL" .env.dev 2>/dev/null | cut -d'=' -f2- || echo "")
SUPABASE_ANON_KEY=$(grep "SUPABASE_ANON_KEY" .env.dev 2>/dev/null | cut -d'=' -f2- || echo "")

# 更新 API_BASE_URL
NEW_API_URL="http://${MAC_IP}:3000/api"
CURRENT_API_URL=$(grep "API_BASE_URL" .env.dev 2>/dev/null | cut -d'=' -f2- || echo "")

if [ "$CURRENT_API_URL" != "$NEW_API_URL" ]; then
    echo -e "${BLUE}📝 更新 API_BASE_URL: $CURRENT_API_URL -> $NEW_API_URL${NC}"
    
    # 创建新的 .env.dev
    {
        echo "API_BASE_URL=$NEW_API_URL"
        echo "MAPBOX_ACCESS_TOKEN=$MAPBOX_TOKEN"
        echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
        [ -n "$SUPABASE_URL" ] && echo "SUPABASE_URL=$SUPABASE_URL"
        [ -n "$SUPABASE_ANON_KEY" ] && echo "SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
    } > .env.dev
    
    echo -e "${GREEN}✅ .env.dev 已更新${NC}"
else
    echo -e "${GREEN}✅ API_BASE_URL 已是最新: $NEW_API_URL${NC}"
fi
echo ""

# 3. 确保后端 API 可访问
echo "3️⃣ 检查后端 API 服务..."
if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
    
    # 测试本地访问
    if curl -s --max-time 3 "http://localhost:3000/health" &> /dev/null; then
        echo -e "${GREEN}✅ 本地访问成功${NC}"
    else
        echo -e "${YELLOW}⚠️  本地访问失败，但服务正在运行${NC}"
    fi
    
    # 测试 IP 访问
    if curl -s --max-time 3 "http://${MAC_IP}:3000/health" &> /dev/null; then
        echo -e "${GREEN}✅ IP 访问成功${NC}"
    else
        echo -e "${YELLOW}⚠️  IP 访问失败，可能被防火墙阻止${NC}"
        echo "   请检查防火墙设置：系统设置 > 网络 > 防火墙"
    fi
else
    echo -e "${RED}❌ 后端服务未运行${NC}"
    echo ""
    echo "请启动后端服务："
    echo "  cd ../wanderlog_api"
    echo "  npm run dev"
    echo ""
    read -p "是否现在启动后端服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ../wanderlog_api
        npm run dev > /tmp/wanderlog_api.log 2>&1 &
        echo "后端服务已在后台启动"
        sleep 3
        cd ../wanderlog_app
    fi
fi
echo ""

# 4. 检查防火墙
echo "4️⃣ 检查防火墙设置..."
FIREWALL_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -i "enabled" || echo "")
if echo "$FIREWALL_STATUS" | grep -qi "enabled"; then
    echo -e "${YELLOW}⚠️  防火墙已启用${NC}"
    echo "   请确保允许 Node.js 或端口 3000 的传入连接"
    echo "   系统设置 > 网络 > 防火墙 > 选项"
else
    echo -e "${GREEN}✅ 防火墙未启用或已配置${NC}"
fi
echo ""

# 5. 检查设备连接
echo "5️⃣ 检查 iOS 设备连接..."
echo "正在扫描设备..."
DEVICES=$(flutter devices 2>&1 | grep -E "mobile.*ios" | grep -v "simulator" || echo "")

if [ -n "$DEVICES" ]; then
    echo -e "${GREEN}✅ 找到 iOS 设备：${NC}"
    echo "$DEVICES"
    DEVICE_ID=$(echo "$DEVICES" | head -1 | awk '{print $2}')
    echo ""
    echo "设备 ID: $DEVICE_ID"
else
    echo -e "${YELLOW}⚠️  未找到连接的 iOS 设备${NC}"
    echo ""
    echo "请确保："
    echo "  1. iPhone/iPad 已通过 USB 连接到 Mac"
    echo "  2. 在设备上信任此电脑"
    echo "  3. 如果运行 iOS 16+，已启用开发者模式"
    echo ""
    echo "检查设备："
    echo "  flutter devices"
fi
echo ""

# 6. 检查 Xcode 配置
echo "6️⃣ 检查 Xcode 项目配置..."
BUNDLE_ID=$(grep "PRODUCT_BUNDLE_IDENTIFIER" ios/Runner.xcodeproj/project.pbxproj | grep -v "RunnerTests" | head -1 | awk '{print $3}' | tr -d ';')
echo "Bundle Identifier: $BUNDLE_ID"

if [ -f "ios/Runner.xcworkspace" ] || [ -d "ios/Runner.xcworkspace" ]; then
    echo -e "${GREEN}✅ Xcode workspace 存在${NC}"
else
    echo -e "${YELLOW}⚠️  需要运行 pod install${NC}"
    echo "   cd ios && pod install && cd .."
fi
echo ""

# 7. 总结
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        📋 配置总结                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Mac IP 地址: $MAC_IP"
echo "✅ API URL: http://${MAC_IP}:3000/api"
echo "✅ .env.dev 已更新"
echo ""
echo "📝 下一步操作："
echo ""
echo "1. 配置 Xcode 代码签名："
echo "   open ios/Runner.xcworkspace"
echo "   在 Xcode 中："
echo "   - 选择 Runner 项目 > Runner target"
echo "   - Signing & Capabilities"
echo "   - 勾选 'Automatically manage signing'"
echo "   - 选择 Team（Apple ID）"
echo ""
echo "2. 连接 iOS 设备："
echo "   - 使用 USB 连接 iPhone/iPad"
echo "   - 在设备上信任此电脑"
echo "   - iOS 16+ 需要启用开发者模式"
echo ""
echo "3. 运行应用："
if [ -n "$DEVICE_ID" ]; then
    echo "   flutter run -d $DEVICE_ID"
else
    echo "   flutter run"
fi
echo ""
echo "4. 验证网络连接："
echo "   在 iPhone Safari 中打开: http://${MAC_IP}:3000/health"
echo "   应该看到 JSON 响应"
echo ""
echo "📚 详细指南请查看: IOS_DEVICE_SETUP_GUIDE.md"
echo ""
