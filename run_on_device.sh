#!/bin/bash

# 设置代理 (ClashX Meta 端口)
export http_proxy=http://127.0.0.1:7893
export https_proxy=http://127.0.0.1:7893

# 进入项目目录
cd "$(dirname "$0")/wanderlog_app"

echo "🔍 检查连接的设备..."
flutter devices

echo ""
echo "🚀 启动应用到真机..."
flutter run --release

