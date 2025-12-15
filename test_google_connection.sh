#!/bin/bash

echo "==================================="
echo "🔍 Google 登录问题诊断工具"
echo "==================================="
echo ""

# 1. 检查代理设置
echo "1️⃣ 检查代理配置..."
echo "系统代理状态："
scutil --proxy | grep -i "HTTPEnable\|HTTPProxy\|HTTPPort\|HTTPSEnable\|HTTPSProxy\|HTTPSPort"
echo ""

# 2. 测试 Google API 连接
echo "2️⃣ 测试 Google 服务连接..."
echo "测试 accounts.google.com："
curl -I -s --connect-timeout 5 https://accounts.google.com/ | head -1
echo ""
echo "测试 oauth2.googleapis.com："
curl -I -s --connect-timeout 5 https://oauth2.googleapis.com/ | head -1
echo ""

# 3. 检查 iOS 配置
echo "3️⃣ 检查 iOS Google Sign-In 配置..."
if [ -f "wanderlog_app/ios/Runner/Info.plist" ]; then
    echo "✅ Info.plist 存在"
    
    # 检查 GIDClientID
    if /usr/libexec/PlistBuddy -c "Print :GIDClientID" wanderlog_app/ios/Runner/Info.plist 2>/dev/null; then
        echo "✅ GIDClientID 已配置"
    else
        echo "❌ GIDClientID 未配置"
    fi
    
    # 检查 URL Schemes
    if /usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" wanderlog_app/ios/Runner/Info.plist 2>/dev/null; then
        echo "✅ URL Schemes 已配置"
    else
        echo "❌ URL Schemes 未配置"
    fi
else
    echo "❌ Info.plist 不存在"
fi
echo ""

# 4. 检查 .env 配置
echo "4️⃣ 检查 .env 配置..."
if [ -f "wanderlog_app/.env" ]; then
    echo "✅ .env 文件存在"
    if grep -q "GOOGLE_CLIENT_ID=" wanderlog_app/.env; then
        CLIENT_ID=$(grep "GOOGLE_CLIENT_ID=" wanderlog_app/.env | cut -d'=' -f2)
        if [ "$CLIENT_ID" != "placeholder" ] && [ -n "$CLIENT_ID" ]; then
            echo "✅ GOOGLE_CLIENT_ID 已配置: ${CLIENT_ID:0:20}..."
        else
            echo "❌ GOOGLE_CLIENT_ID 未正确配置"
        fi
    else
        echo "❌ GOOGLE_CLIENT_ID 不存在"
    fi
else
    echo "❌ .env 文件不存在"
fi
echo ""

# 5. 建议
echo "==================================="
echo "💡 解决方案建议："
echo "==================================="
echo ""
echo "如果看到连接错误（Connection reset/refused/timeout）："
echo ""
echo "方案 1: 启用系统代理（推荐用于开发）"
echo "  1. 打开 系统设置 → 网络 → Wi-Fi → 详细信息"
echo "  2. 代理 → 网页代理(HTTP) 和 安全网页代理(HTTPS)"
echo "  3. 服务器：127.0.0.1  端口：7890"
echo "  4. 重启 iOS 模拟器"
echo ""
echo "方案 2: 使用真机测试（推荐用于生产）"
echo "  - 真机有更好的网络连接"
echo "  - 不需要代理即可访问 Google 服务"
echo ""
echo "方案 3: 检查代理软件"
echo "  - 确保代理软件（如 Clash、V2Ray）正在运行"
echo "  - 确保端口 7890 可访问"
echo ""
echo "==================================="
