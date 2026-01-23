#!/bin/bash

# 网络连接验证脚本

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        🌐 网络连接验证                                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$(dirname "$0")"

# 1. 获取 Mac IP
echo "1️⃣ 获取 Mac IP 地址..."
MAC_IP_WIFI=$(ipconfig getifaddr en0 2>/dev/null || echo "")
MAC_IP_ETH=$(ipconfig getifaddr en1 2>/dev/null || echo "")

if [ -n "$MAC_IP_WIFI" ]; then
    MAC_IP="$MAC_IP_WIFI"
    echo -e "${GREEN}✅ Wi-Fi IP: $MAC_IP${NC}"
elif [ -n "$MAC_IP_ETH" ]; then
    MAC_IP="$MAC_IP_ETH"
    echo -e "${GREEN}✅ 以太网 IP: $MAC_IP${NC}"
else
    MAC_IP=$(grep "API_BASE_URL" .env.dev 2>/dev/null | cut -d'=' -f2- | sed 's|http://||' | sed 's|:3000/api||' || echo "192.168.1.6")
    echo -e "${YELLOW}⚠️  使用 .env.dev 中的 IP: $MAC_IP${NC}"
fi
echo ""

# 2. 检查后端服务
echo "2️⃣ 检查后端服务..."
if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
else
    echo -e "${RED}❌ 后端服务未运行${NC}"
    echo ""
    echo "请启动后端服务："
    echo "  cd ../wanderlog_api"
    echo "  npm run dev"
    exit 1
fi
echo ""

# 3. 测试本地访问
echo "3️⃣ 测试从 Mac 本地访问..."
if curl -s --max-time 3 "http://localhost:3000/health" &> /dev/null; then
    echo -e "${GREEN}✅ 本地访问成功${NC}"
    RESPONSE=$(curl -s "http://localhost:3000/health")
    echo "   响应: $RESPONSE"
else
    echo -e "${RED}❌ 本地访问失败${NC}"
    echo "   请检查后端服务是否正常运行"
fi
echo ""

# 4. 测试 IP 访问
echo "4️⃣ 测试从 Mac IP 访问..."
if curl -s --max-time 3 "http://${MAC_IP}:3000/health" &> /dev/null; then
    echo -e "${GREEN}✅ IP 访问成功${NC}"
    RESPONSE=$(curl -s "http://${MAC_IP}:3000/health")
    echo "   响应: $RESPONSE"
else
    echo -e "${RED}❌ IP 访问失败${NC}"
    echo "   可能的原因："
    echo "   - 防火墙阻止了连接"
    echo "   - 后端服务未监听所有网络接口"
fi
echo ""

# 5. 检查防火墙
echo "5️⃣ 检查防火墙设置..."
FIREWALL_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -i "enabled" || echo "")
if echo "$FIREWALL_STATUS" | grep -qi "enabled"; then
    echo -e "${YELLOW}⚠️  防火墙已启用${NC}"
    echo "   请确保允许 Node.js 或端口 3000 的传入连接"
    echo "   系统设置 > 网络 > 防火墙 > 选项"
else
    echo -e "${GREEN}✅ 防火墙未启用或已配置${NC}"
fi
echo ""

# 6. 检查环境变量
echo "6️⃣ 检查环境变量配置..."
if [ -f ".env.dev" ]; then
    API_URL=$(grep "API_BASE_URL" .env.dev | cut -d'=' -f2- || echo "")
    if [ -n "$API_URL" ]; then
        echo -e "${GREEN}✅ API_BASE_URL: $API_URL${NC}"
        
        # 检查是否使用 Mac IP
        if echo "$API_URL" | grep -q "$MAC_IP"; then
            echo -e "${GREEN}✅ API URL 使用正确的 Mac IP${NC}"
        else
            echo -e "${YELLOW}⚠️  API URL 可能未使用 Mac IP${NC}"
            echo "   当前: $API_URL"
            echo "   Mac IP: $MAC_IP"
        fi
    else
        echo -e "${RED}❌ API_BASE_URL 未配置${NC}"
    fi
else
    echo -e "${RED}❌ .env.dev 文件不存在${NC}"
fi
echo ""

# 7. 检查后端服务监听地址
echo "7️⃣ 检查后端服务监听地址..."
LISTENING=$(lsof -i :3000 -sTCP:LISTEN 2>/dev/null | grep LISTEN || echo "")
if echo "$LISTENING" | grep -q "*:3000"; then
    echo -e "${GREEN}✅ 后端服务监听所有网络接口 (0.0.0.0)${NC}"
else
    echo -e "${YELLOW}⚠️  后端服务可能只监听本地接口${NC}"
    echo "   请确保后端服务监听 0.0.0.0:3000"
fi
echo ""

# 8. 总结
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        📋 验证总结                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

LOCAL_OK=false
IP_OK=false

if curl -s --max-time 3 "http://localhost:3000/health" &> /dev/null; then
    LOCAL_OK=true
fi

if curl -s --max-time 3 "http://${MAC_IP}:3000/health" &> /dev/null; then
    IP_OK=true
fi

if [ "$LOCAL_OK" = true ] && [ "$IP_OK" = true ]; then
    echo -e "${GREEN}✅ 网络配置正确${NC}"
    echo ""
    echo "下一步："
    echo "1. 在 iPhone Safari 中测试："
    echo "   http://${MAC_IP}:3000/health"
    echo ""
    echo "2. 如果 Safari 可以访问，应用也应该可以连接"
    echo ""
    echo "3. 运行应用："
    echo "   ./build_and_run.sh"
else
    echo -e "${YELLOW}⚠️  需要修复网络配置${NC}"
    echo ""
    if [ "$LOCAL_OK" = false ]; then
        echo "❌ 本地访问失败 - 检查后端服务"
    fi
    if [ "$IP_OK" = false ]; then
        echo "❌ IP 访问失败 - 检查防火墙设置"
    fi
    echo ""
    echo "修复步骤："
    echo "1. 确保后端服务正在运行"
    echo "2. 配置防火墙允许端口 3000"
    echo "3. 重新运行此脚本验证"
fi

echo ""
