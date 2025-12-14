#!/bin/bash

echo "========================================="
echo "启动应用并测试 Google 登录"
echo "========================================="
echo ""

cd "$(dirname "$0")/wanderlog_app"

# 1. 关闭现有模拟器
echo "1. 关闭现有模拟器..."
killall Simulator 2>/dev/null
sleep 2

# 2. 设置环境变量（这些将传递给 Flutter 应用）
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"
export http_proxy="http://127.0.0.1:7890"
export https_proxy="http://127.0.0.1:7890"

echo "2. 已设置代理环境变量:"
echo "   HTTP_PROXY=$HTTP_PROXY"
echo "   HTTPS_PROXY=$HTTPS_PROXY"

# 3. 验证系统代理
echo ""
echo "3. 验证系统代理配置..."
HTTP_ENABLED=$(scutil --proxy | grep "HTTPEnable" | awk '{print $3}')
if [ "$HTTP_ENABLED" = "1" ]; then
    echo "✅ 系统代理已启用"
else
    echo "⚠️  系统代理未启用（可能影响模拟器网络）"
fi

# 4. 启动应用（热重载模式）
echo ""
echo "4. 启动应用..."
echo "   请等待应用启动完成"
echo ""
echo "📱 测试步骤："
echo "   1) 等待应用启动"
echo "   2) 点击 'Continue with Google'"
echo "   3) 选择 Google 账号"
echo "   4) 观察是否成功登录"
echo ""
echo "💡 提示："
echo "   - 如果出现错误，请查看错误消息"
echo "   - 新版本 Google Sign In 可能有更好的网络支持"
echo "   - 按 'r' 热重载，按 'q' 退出"
echo ""

# 启动应用
flutter run
