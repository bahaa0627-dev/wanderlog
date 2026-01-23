#!/bin/bash

# VAGO 页面问题诊断脚本

echo "========================================="
echo "🔍 VAGO 页面问题诊断"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查后端服务
echo "1️⃣ 检查后端服务..."
if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
    echo -e "${GREEN}✅ 后端服务正在运行${NC}"
else
    echo -e "${RED}❌ 后端服务未运行${NC}"
    echo "   请先启动后端：cd ../wanderlog_api && npm run dev"
    exit 1
fi
echo ""

# 2. 获取 Mac IP
echo "2️⃣ 检查网络配置..."
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "192.168.1.6")
echo "   Mac IP: $MAC_IP"
echo ""

# 3. 测试 API 端点
echo "3️⃣ 测试推荐 API 端点..."
API_URL="http://$MAC_IP:3000/api/collection-recommendations"
echo "   URL: $API_URL"

RESPONSE=$(curl -s --max-time 5 "$API_URL" 2>&1)
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_URL" 2>&1)

if [ "$STATUS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ API 端点可访问 (状态码: $STATUS_CODE)${NC}"
    
    # 检查响应数据
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ API 返回成功响应${NC}"
        DATA_COUNT=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', [])))" 2>/dev/null || echo "未知")
        echo "   推荐数据数量: $DATA_COUNT"
    else
        echo -e "${YELLOW}⚠️  API 响应格式可能有问题${NC}"
        echo "   响应预览: ${RESPONSE:0:200}..."
    fi
else
    echo -e "${RED}❌ API 端点无法访问 (状态码: $STATUS_CODE)${NC}"
    echo "   错误信息: $RESPONSE"
    echo ""
    echo "   可能的原因："
    echo "   - Mac 防火墙阻止了连接"
    echo "   - Mac 和 iPhone 不在同一 Wi-Fi"
    echo "   - 后端服务未正确运行"
fi
echo ""

# 4. 检查环境配置
echo "4️⃣ 检查环境配置..."
if [ -f ".env.dev" ]; then
    API_BASE_URL=$(grep "API_BASE_URL" .env.dev | cut -d '=' -f2 || echo "")
    if [[ "$API_BASE_URL" == *"$MAC_IP"* ]]; then
        echo -e "${GREEN}✅ .env.dev 配置正确${NC}"
        echo "   API_BASE_URL: $API_BASE_URL"
    else
        echo -e "${YELLOW}⚠️  .env.dev 可能配置错误${NC}"
        echo "   当前: $API_BASE_URL"
        echo "   应该包含: $MAC_IP"
    fi
else
    echo -e "${RED}❌ .env.dev 文件不存在${NC}"
fi
echo ""

# 5. 检查设备连接
echo "5️⃣ 检查设备连接..."
DEVICE_INFO=$(flutter devices 2>&1 | grep -i "iPhone" | grep -i "mobile" | head -1 || echo "")
if [ -n "$DEVICE_INFO" ]; then
    echo -e "${GREEN}✅ 检测到 iOS 设备${NC}"
    echo "   $DEVICE_INFO"
else
    echo -e "${YELLOW}⚠️  未检测到 iOS 设备${NC}"
fi
echo ""

# 6. 总结和建议
echo "========================================="
echo "📋 诊断总结"
echo "========================================="
echo ""

if [ "$STATUS_CODE" = "200" ] && [ -f ".env.dev" ]; then
    echo -e "${GREEN}✅ 后端和配置看起来正常${NC}"
    echo ""
    echo "如果 VAGO 页面仍然显示 'Failed to load'，请："
    echo "1. 查看 Flutter 控制台中的详细错误日志"
    echo "2. 确认应用已正确加载 .env.dev 文件"
    echo "3. 检查应用日志中的 Dio baseUrl 输出"
    echo "4. 在 iPhone Safari 中测试 API 端点："
    echo "   $API_URL"
else
    echo -e "${YELLOW}⚠️  发现一些问题，请先修复：${NC}"
    echo ""
    if [ "$STATUS_CODE" != "200" ]; then
        echo "1. 修复 API 连接问题"
        echo "   - 检查防火墙设置"
        echo "   - 确认 Mac 和 iPhone 在同一 Wi-Fi"
    fi
    if [ ! -f ".env.dev" ]; then
        echo "2. 创建 .env.dev 文件"
    fi
fi

echo ""
echo "查看详细修复指南：FIX_VAGO_PAGE.md"
