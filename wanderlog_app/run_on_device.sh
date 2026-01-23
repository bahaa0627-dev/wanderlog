#!/bin/bash

# iOS 真机测试脚本
# 用途：检查设备连接并运行应用到真机

set -e

echo "========================================="
echo "🚀 iOS 真机测试脚本"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查 Flutter 环境
echo "1️⃣ 检查 Flutter 环境..."
if ! command -v flutter &> /dev/null; then
    echo -e "${RED}❌ Flutter 未安装或不在 PATH 中${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Flutter 已安装${NC}"
echo ""

# 2. 检查设备连接
echo "2️⃣ 检查连接的 iOS 设备..."
DEVICES=$(flutter devices | grep -i "ios" | grep -i "mobile" || true)
if [ -z "$DEVICES" ]; then
    echo -e "${YELLOW}⚠️  未检测到 iOS 设备${NC}"
    echo ""
    echo "请确保："
    echo "  - iPhone 已通过 USB 连接到 Mac"
    echo "  - 在 iPhone 上已信任此电脑"
    echo "  - 已启用开发者模式（iOS 16+）：设置 > 隐私与安全性 > 开发者模式"
    echo ""
    echo "正在列出所有可用设备..."
    flutter devices
    exit 1
fi
echo -e "${GREEN}✅ 检测到 iOS 设备${NC}"
echo "$DEVICES"
echo ""

# 3. 检查后端服务
echo "3️⃣ 检查后端 API 服务..."
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "192.168.1.6")
if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
    echo "   Mac IP: $MAC_IP"
    echo "   API URL: http://$MAC_IP:3000/api"
else
    echo -e "${YELLOW}⚠️  后端服务未运行${NC}"
    echo "   请先启动后端：cd ../wanderlog_api && npm run dev"
    echo ""
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# 4. 检查环境配置
echo "4️⃣ 检查环境配置..."
if [ -f ".env.dev" ]; then
    API_URL=$(grep "API_BASE_URL" .env.dev | cut -d '=' -f2)
    if [[ "$API_URL" == *"localhost"* ]] || [[ "$API_URL" == *"127.0.0.1"* ]]; then
        echo -e "${YELLOW}⚠️  .env.dev 中的 API_BASE_URL 仍使用 localhost${NC}"
        echo "   当前值: $API_URL"
        echo "   应该使用: http://$MAC_IP:3000/api"
        echo ""
        read -p "是否自动更新？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # 读取现有的 MAPBOX 和 GOOGLE_CLIENT_ID
            MAPBOX_TOKEN=$(grep "MAPBOX_ACCESS_TOKEN" .env.dev | cut -d '=' -f2 || echo "pk.placeholder")
            GOOGLE_ID=$(grep "GOOGLE_CLIENT_ID" .env.dev | cut -d '=' -f2 || echo "placeholder")
            
            cat > .env.dev << EOF
API_BASE_URL=http://$MAC_IP:3000/api
MAPBOX_ACCESS_TOKEN=$MAPBOX_TOKEN
GOOGLE_CLIENT_ID=$GOOGLE_ID
EOF
            echo -e "${GREEN}✅ 已更新 .env.dev${NC}"
        fi
    else
        echo -e "${GREEN}✅ 环境配置正确${NC}"
        echo "   API URL: $API_URL"
    fi
else
    echo -e "${YELLOW}⚠️  .env.dev 文件不存在${NC}"
    echo "   正在创建..."
    cat > .env.dev << EOF
API_BASE_URL=http://$MAC_IP:3000/api
MAPBOX_ACCESS_TOKEN=pk.placeholder
GOOGLE_CLIENT_ID=placeholder
EOF
    echo -e "${GREEN}✅ 已创建 .env.dev${NC}"
fi
echo ""

# 5. 安装依赖（如果需要）
echo "5️⃣ 检查 Flutter 依赖..."
if [ ! -d "build" ] || [ "pubspec.yaml" -nt "pubspec.lock" ]; then
    echo "   正在安装依赖..."
    flutter pub get
    echo -e "${GREEN}✅ 依赖已安装${NC}"
else
    echo -e "${GREEN}✅ 依赖已是最新${NC}"
fi
echo ""

# 6. 运行应用
echo "6️⃣ 准备运行应用到设备..."
echo ""
echo -e "${GREEN}开始部署...${NC}"
echo "   如果遇到签名错误，请："
echo "   1. 在 Xcode 中打开 ios/Runner.xcworkspace"
echo "   2. 配置代码签名（Signing & Capabilities）"
echo "   3. 选择您的 Team"
echo ""

# 获取设备 ID
DEVICE_ID=$(flutter devices | grep -i "ios" | grep -i "mobile" | head -1 | awk '{print $5}' || echo "")

if [ -n "$DEVICE_ID" ]; then
    echo "   目标设备: $DEVICE_ID"
    flutter run -d "$DEVICE_ID"
else
    echo "   让 Flutter 自动选择设备..."
    flutter run
fi
