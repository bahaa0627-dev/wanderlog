#!/bin/bash

# iOS 真机构建和运行脚本

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        🚀 iOS 真机构建和运行                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$(dirname "$0")"

# 1. 检查 Flutter 环境
echo "1️⃣ 检查 Flutter 环境..."
if ! command -v flutter &> /dev/null; then
    echo -e "${RED}❌ Flutter 未安装或不在 PATH 中${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Flutter 已安装${NC}"
echo ""

# 2. 检查设备连接
echo "2️⃣ 检查设备连接..."
DEVICES=$(flutter devices 2>&1 | grep -E "mobile.*ios" | grep -v "simulator" || echo "")

if [ -z "$DEVICES" ]; then
    echo -e "${RED}❌ 未找到 iOS 真机设备${NC}"
    echo ""
    echo "请先连接设备："
    echo "  1. 使用 USB 连接 iPhone/iPad"
    echo "  2. 在设备上信任此电脑"
    echo "  3. iOS 16+ 需要启用开发者模式"
    echo ""
    echo "然后运行："
    echo "  ./verify_device_connection.sh"
    exit 1
fi

DEVICE_ID=$(echo "$DEVICES" | head -1 | awk '{print $2}')
DEVICE_NAME=$(echo "$DEVICES" | head -1 | awk '{print $1}')

echo -e "${GREEN}✅ 找到设备：$DEVICE_NAME ($DEVICE_ID)${NC}"
echo ""

# 3. 检查依赖
echo "3️⃣ 检查依赖..."
if [ ! -f "pubspec.lock" ]; then
    echo "首次运行，安装依赖..."
    flutter pub get
else
    echo -e "${GREEN}✅ 依赖已安装${NC}"
fi
echo ""

# 4. 检查环境变量
echo "4️⃣ 检查环境变量..."
if [ ! -f ".env.dev" ]; then
    echo -e "${YELLOW}⚠️  .env.dev 文件不存在${NC}"
    echo "请先运行配置脚本："
    echo "  ./setup_ios_device.sh"
    exit 1
fi

API_URL=$(grep "API_BASE_URL" .env.dev | cut -d'=' -f2- || echo "")
if [ -z "$API_URL" ]; then
    echo -e "${YELLOW}⚠️  API_BASE_URL 未配置${NC}"
    echo "请先运行配置脚本："
    echo "  ./setup_ios_device.sh"
    exit 1
fi

echo -e "${GREEN}✅ API URL: $API_URL${NC}"
echo ""

# 5. 检查后端服务
echo "5️⃣ 检查后端服务..."
if ! lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${YELLOW}⚠️  后端服务未运行${NC}"
    echo ""
    read -p "是否现在启动后端服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ../wanderlog_api
        npm run dev > /tmp/wanderlog_api.log 2>&1 &
        echo "后端服务已在后台启动"
        sleep 3
        cd ../wanderlog_app
    else
        echo "请手动启动后端服务："
        echo "  cd ../wanderlog_api && npm run dev"
        exit 1
    fi
else
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
fi
echo ""

# 6. 清理构建（可选）
echo "6️⃣ 准备构建..."
read -p "是否清理之前的构建？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "清理构建缓存..."
    flutter clean
    echo -e "${GREEN}✅ 清理完成${NC}"
fi
echo ""

# 7. 运行应用
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     🚀 开始运行应用                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "设备: $DEVICE_NAME"
echo "设备 ID: $DEVICE_ID"
echo "API URL: $API_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 运行 Flutter 应用
flutter run -d "$DEVICE_ID" "$@"
