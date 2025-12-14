#!/bin/bash

# 🎯 Resend 邮件服务快速配置向导

echo "🎯 Resend 邮件服务快速配置向导"
echo "================================"
echo ""
echo "这个向导将帮助你配置 Resend 邮件服务。"
echo ""

# 检查是否已有配置
if grep -q "RESEND_API_KEY=re_" .env 2>/dev/null; then
    echo "✅ 检测到已有配置"
    echo ""
    KEY=$(grep "RESEND_API_KEY=" .env | cut -d'=' -f2)
    echo "当前 API Key: ${KEY:0:15}...${KEY: -5}"
    echo ""
    read -p "是否要更新配置？(y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "保持现有配置。"
        exit 0
    fi
fi

# 步骤 1: 获取 API Key
echo ""
echo "📝 步骤 1/3: 获取 Resend API Key"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. 打开浏览器访问: https://resend.com/signup"
echo "2. 注册并登录 Resend 账号"
echo "3. 点击左侧菜单 'API Keys'"
echo "4. 点击 'Create API Key'"
echo "5. 输入名称（如：wanderlog-dev）并创建"
echo "6. 复制生成的 API Key（格式：re_xxxxx...）"
echo ""
read -p "按 Enter 继续，当你准备好输入 API Key..."
echo ""

# 步骤 2: 输入 API Key
echo "📝 步骤 2/3: 输入你的 API Key"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "请粘贴你的 Resend API Key: " API_KEY
echo ""

# 验证 API Key 格式
if [[ ! $API_KEY =~ ^re_ ]]; then
    echo "❌ API Key 格式不正确"
    echo "   API Key 应该以 're_' 开头"
    exit 1
fi

# 步骤 3: 更新配置
echo "📝 步骤 3/3: 更新配置文件"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 备份 .env 文件
if [ -f ".env" ]; then
    cp .env .env.backup
    echo "✅ 已备份原配置到 .env.backup"
fi

# 更新 API Key
if [ -f ".env" ]; then
    # 替换现有的 RESEND_API_KEY
    sed -i '' "s|RESEND_API_KEY=.*|RESEND_API_KEY=$API_KEY|g" .env
    echo "✅ 已更新 .env 文件"
else
    echo "❌ 找不到 .env 文件"
    exit 1
fi

# 验证配置
echo ""
echo "🔍 验证配置..."
if grep -q "RESEND_API_KEY=$API_KEY" .env; then
    echo "✅ 配置已成功保存"
else
    echo "❌ 配置保存失败"
    exit 1
fi

# 完成
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 配置完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "API Key: ${API_KEY:0:15}...${API_KEY: -5}"
echo ""
echo "🚀 下一步：运行测试"
echo ""
echo "   npm run test:email your-email@gmail.com"
echo ""
echo "⚠️  重要提醒："
echo "   - 请使用你自己的邮箱地址"
echo "   - 开发环境只能发送到你自己的邮箱"
echo "   - 如果没收到邮件，检查垃圾邮件文件夹"
echo ""
