#!/bin/bash

echo "========================================="
echo "重启模拟器并测试 Google 登录"
echo "========================================="
echo ""

# 1. 关闭现有模拟器
echo "1. 关闭现有模拟器..."
killall Simulator 2>/dev/null
sleep 2

# 2. 验证代理设置
echo ""
echo "2. 验证系统代理设置..."
HTTP_ENABLED=$(scutil --proxy | grep "HTTPEnable" | awk '{print $3}')
HTTPS_ENABLED=$(scutil --proxy | grep "HTTPSEnable" | awk '{print $3}')

if [ "$HTTP_ENABLED" = "1" ] && [ "$HTTPS_ENABLED" = "1" ]; then
    echo "✅ HTTP 代理已启用"
    echo "✅ HTTPS 代理已启用"
    scutil --proxy | grep -E "HTTPProxy|HTTPPort|HTTPSProxy|HTTPSPort"
else
    echo "❌ 代理未启用！"
    echo ""
    echo "请按照以下步骤启用代理："
    echo "1. 打开 系统设置 (System Settings)"
    echo "2. 点击 网络 (Network)"
    echo "3. 选择 Wi-Fi，点击 详细信息 (Details)"
    echo "4. 选择 代理 (Proxies) 标签"
    echo "5. 启用以下选项："
    echo "   - ☑️ 网页代理 (HTTP): 127.0.0.1:7890"
    echo "   - ☑️ 安全网页代理 (HTTPS): 127.0.0.1:7890"
    echo "6. 点击 好 (OK)"
    echo ""
    exit 1
fi

# 3. 测试代理连接
echo ""
echo "3. 测试通过代理访问 Google..."
if curl -x http://127.0.0.1:7890 --connect-timeout 5 -s https://accounts.google.com > /dev/null 2>&1; then
    echo "✅ 可以通过代理访问 Google"
else
    echo "❌ 无法通过代理访问 Google"
    echo "   请确保代理服务正在运行"
    exit 1
fi

# 4. 清理并重新构建
echo ""
echo "4. 清理并重新构建应用..."
cd "$(dirname "$0")/wanderlog_app"
flutter clean > /dev/null 2>&1
flutter pub get > /dev/null 2>&1
echo "✅ 构建完成"

# 5. 启动应用
echo ""
echo "5. 启动应用（这将打开新的模拟器）..."
echo "   请等待应用启动后测试 Google 登录"
echo ""
echo "📱 提示：如果 Google 登录仍然失败，请尝试："
echo "   1. 使用真机测试（最可靠）"
echo "   2. 或者先用邮箱登录测试其他功能"
echo ""
echo "正在启动..."
flutter run

