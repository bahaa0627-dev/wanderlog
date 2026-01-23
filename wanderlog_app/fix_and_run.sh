#!/bin/bash

# 自动修复并运行脚本
# 用于解决网络权限和配置问题

set -e

echo "========================================="
echo "🔧 自动修复并运行应用"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd "$(dirname "$0")"

# 1. 检查后端服务
echo "1️⃣ 检查后端服务..."
if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
else
    echo -e "${YELLOW}⚠️  后端服务未运行${NC}"
    echo "   正在启动后端服务..."
    cd ../wanderlog_api
    npm run dev > /dev/null 2>&1 &
    BACKEND_PID=$!
    echo "   后端服务已启动 (PID: $BACKEND_PID)"
    echo "   等待服务就绪..."
    sleep 3
    cd ../wanderlog_app
fi
echo ""

# 2. 获取 Mac IP
echo "2️⃣ 检查网络配置..."
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "192.168.1.6")
echo "   Mac IP: $MAC_IP"

# 3. 验证 API 可访问
if curl -s --max-time 3 "http://$MAC_IP:3000/health" &> /dev/null; then
    echo -e "${GREEN}✅ API 可从 Mac IP 访问${NC}"
else
    echo -e "${YELLOW}⚠️  API 无法从 Mac IP 访问${NC}"
    echo "   请检查防火墙设置"
fi
echo ""

# 4. 更新 .env.dev
echo "3️⃣ 更新环境配置..."
if [ -f ".env.dev" ]; then
    # 读取现有配置
    MAPBOX_TOKEN=$(grep "MAPBOX_ACCESS_TOKEN" .env.dev | cut -d '=' -f2 || echo "pk.eyJ1IjoibW9yaWJhaGFhIiwiYSI6ImNtaXp0MzM5NjAxamgzZXB0dnI3MTl4dzIifQ.sHnu6-JSac2YGSwEhkK8ag")
    GOOGLE_ID=$(grep "GOOGLE_CLIENT_ID" .env.dev | cut -d '=' -f2 || echo "791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.apps.googleusercontent.com")
    
    # 更新 API URL
    cat > .env.dev << EOF
API_BASE_URL=http://$MAC_IP:3000/api
MAPBOX_ACCESS_TOKEN=$MAPBOX_TOKEN
GOOGLE_CLIENT_ID=$GOOGLE_ID
EOF
    echo -e "${GREEN}✅ .env.dev 已更新${NC}"
    echo "   API_BASE_URL=http://$MAC_IP:3000/api"
else
    echo -e "${YELLOW}⚠️  .env.dev 不存在，正在创建...${NC}"
    cat > .env.dev << EOF
API_BASE_URL=http://$MAC_IP:3000/api
MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoibW9yaWJhaGFhIiwiYSI6ImNtaXp0MzM5NjAxamgzZXB0dnI3MTl4dzIifQ.sHnu6-JSac2YGSwEhkK8ag
GOOGLE_CLIENT_ID=791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.apps.googleusercontent.com
EOF
    echo -e "${GREEN}✅ .env.dev 已创建${NC}"
fi
echo ""

# 5. 检查设备连接
echo "4️⃣ 检查设备连接..."
DEVICE_INFO=$(flutter devices 2>&1 | grep -i "iPhone" | grep -i "mobile" | head -1 || echo "")
if [ -n "$DEVICE_INFO" ]; then
    DEVICE_ID=$(echo "$DEVICE_INFO" | awk '{print $5}' || echo "")
    DEVICE_NAME=$(echo "$DEVICE_INFO" | awk '{print $1}' || echo "iPhone")
    echo -e "${GREEN}✅ 检测到设备: $DEVICE_NAME${NC}"
    if [ -n "$DEVICE_ID" ]; then
        echo "   设备 ID: $DEVICE_ID"
    fi
else
    echo -e "${YELLOW}⚠️  未检测到 iOS 设备${NC}"
    echo "   请确保设备已连接"
    DEVICE_ID=""
fi
echo ""

# 6. 检查本地网络权限提示
echo "5️⃣ 本地网络权限检查..."
echo -e "${YELLOW}⚠️  重要：如果看到本地网络权限错误，请：${NC}"
echo "   1. 打开：系统设置 > 隐私与安全性 > 本地网络"
echo "   2. 勾选 Terminal/VS Code/Flutter 的权限"
echo "   3. 重启终端/IDE"
echo ""

# 7. 运行应用
echo "6️⃣ 准备运行应用..."
echo ""
if [ -n "$DEVICE_ID" ]; then
    echo -e "${GREEN}正在运行到设备: $DEVICE_ID${NC}"
    echo ""
    flutter run -d "$DEVICE_ID"
else
    echo -e "${YELLOW}让 Flutter 自动选择设备...${NC}"
    echo ""
    flutter run
fi
