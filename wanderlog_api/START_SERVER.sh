#!/bin/bash

echo "======================================"
echo "启动 Wanderlog API 服务"
echo "======================================"
echo ""

# 设置代理
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
echo "🌐 已设置代理: http://127.0.0.1:7890"
echo ""

# 进入项目目录
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api

# 检查端口是否被占用
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  端口 3000 已被占用，正在清理..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    sleep 2
fi

echo "🚀 启动服务..."
echo ""

# 启动服务
npm run dev
