#!/bin/bash

# 启动后端服务并测试访问

echo "========================================="
echo "🚀 启动后端服务并测试访问"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查后端服务
echo "1️⃣ 检查后端服务状态..."
if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
    BACKEND_RUNNING=true
else
    echo -e "${YELLOW}⚠️  后端服务未运行${NC}"
    BACKEND_RUNNING=false
fi
echo ""

# 2. 获取 Mac IP
echo "2️⃣ 获取 Mac IP 地址..."
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "192.168.1.6")
echo "   Mac IP: $MAC_IP"
echo ""

# 3. 如果服务未运行，启动服务
if [ "$BACKEND_RUNNING" = false ]; then
    echo "3️⃣ 启动后端服务..."
    echo ""
    echo "   正在启动后端服务..."
    echo "   请在新终端中运行："
    echo ""
    echo "   cd wanderlog_api"
    echo "   npm run dev"
    echo ""
    echo "   或者使用以下命令在后台启动："
    echo ""
    echo "   cd wanderlog_api && npm run dev > /tmp/wanderlog_api.log 2>&1 &"
    echo ""
    read -p "   是否现在启动后端服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ../wanderlog_api
        echo "   正在启动..."
        npm run dev > /tmp/wanderlog_api.log 2>&1 &
        BACKEND_PID=$!
        echo "   后端服务已启动 (PID: $BACKEND_PID)"
        echo "   等待服务就绪..."
        sleep 5
        cd ../wanderlog_app
    else
        echo "   请手动启动后端服务后，重新运行此脚本"
        exit 1
    fi
fi
echo ""

# 4. 测试本地访问
echo "4️⃣ 测试从 Mac 访问..."
if curl -s --max-time 3 "http://localhost:3000/health" &> /dev/null; then
    echo -e "${GREEN}✅ 本地访问成功${NC}"
    curl -s "http://localhost:3000/health" | head -1
else
    echo -e "${RED}❌ 本地访问失败${NC}"
    echo "   请检查后端服务是否正在运行"
fi
echo ""

# 5. 测试 IP 访问
echo "5️⃣ 测试从 Mac IP 访问..."
if curl -s --max-time 3 "http://$MAC_IP:3000/health" &> /dev/null; then
    echo -e "${GREEN}✅ IP 访问成功${NC}"
    curl -s "http://$MAC_IP:3000/health" | head -1
else
    echo -e "${RED}❌ IP 访问失败${NC}"
    echo "   可能的原因："
    echo "   - Mac 防火墙阻止了连接"
    echo "   - 后端服务未监听所有网络接口"
fi
echo ""

# 6. 检查防火墙
echo "6️⃣ 防火墙检查..."
FIREWALL_STATUS=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -i "enabled" || echo "未知")
if echo "$FIREWALL_STATUS" | grep -qi "enabled"; then
    echo -e "${YELLOW}⚠️  防火墙已启用${NC}"
    echo "   请检查防火墙设置："
    echo "   系统设置 > 网络 > 防火墙 > 选项"
    echo "   确保允许 Node.js 或添加端口 3000 的例外"
else
    echo -e "${GREEN}✅ 防火墙未启用或已配置${NC}"
fi
echo ""

# 7. 提供测试 URL
echo "7️⃣ 测试 URL"
echo ""
echo "   在 iPhone Safari 中打开："
echo "   http://$MAC_IP:3000/health"
echo ""
echo "   应该看到："
echo "   {\"status\":\"ok\",\"timestamp\":\"...\"}"
echo ""

# 8. 总结
echo "========================================="
echo "📋 总结"
echo "========================================="
echo ""

if curl -s --max-time 3 "http://$MAC_IP:3000/health" &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务可以访问${NC}"
    echo ""
    echo "下一步："
    echo "1. 在 iPhone Safari 中打开：http://$MAC_IP:3000/health"
    echo "2. 如果无法访问，检查防火墙设置"
    echo "3. 确认 Mac 和 iPhone 在同一 Wi-Fi 网络"
else
    echo -e "${YELLOW}⚠️  需要修复以下问题：${NC}"
    echo ""
    if [ "$BACKEND_RUNNING" = false ]; then
        echo "1. 启动后端服务"
    fi
    echo "2. 检查防火墙设置"
    echo "3. 确认网络连接"
fi

echo ""
echo "查看详细指南：FIX_SAFARI_ACCESS.md"
