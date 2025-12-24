#!/bin/bash
# WanderLog 后端 + Cloudflare Tunnel 启动脚本
# 使用方法: ./start_backend.sh

cd "$(dirname "$0")"

# 杀掉占用 3000 端口的进程
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null

# 杀掉已有的 cloudflared 进程
pkill -f "cloudflared tunnel run" 2>/dev/null

echo "🚀 Starting WanderLog Backend..."

# 启动后端服务（后台运行）
cd wanderlog_api
nohup npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "✅ Backend started with PID: $BACKEND_PID"

# 等待后端启动
sleep 3

# 检查后端是否正常
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend is running at http://localhost:3000"
else
    echo "⚠️  Backend may still be starting, check logs"
fi

# 启动 Cloudflare Tunnel
echo "🌐 Starting Cloudflare Tunnel..."
nohup cloudflared tunnel run --url http://localhost:3000 vago-api-test > logs/tunnel.log 2>&1 &
TUNNEL_PID=$!

echo "✅ Tunnel started with PID: $TUNNEL_PID"

# 等待 Tunnel 连接
sleep 5

# 检查线上服务
if curl -s https://api-test.vago.to/health > /dev/null 2>&1; then
    echo "✅ Online API is running at https://api-test.vago.to"
    echo "✅ Admin panel: https://api-test.vago.to/admin.html"
else
    echo "⚠️  Tunnel may still be connecting, check logs/tunnel.log"
fi

echo ""
echo "📝 Logs:"
echo "   Backend: tail -f logs/backend.log"
echo "   Tunnel:  tail -f logs/tunnel.log"
