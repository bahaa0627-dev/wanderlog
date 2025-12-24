#!/bin/bash
# 设置定时任务
# 使用方法: ./scripts/setup-cron-jobs.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$PROJECT_DIR/wanderlog_api"
LOG_DIR="$PROJECT_DIR/logs"

# 确保日志目录存在
mkdir -p "$LOG_DIR"

echo "🔧 Setting up cron jobs for WanderLog..."
echo "📁 Project directory: $PROJECT_DIR"

# 创建 cron 任务脚本
cat > "$PROJECT_DIR/scripts/run-image-migration.sh" << EOF
#!/bin/bash
# 每日图片迁移任务
cd "$API_DIR"
export PATH="/opt/homebrew/opt/node@20/bin:\$PATH"
npx tsx scripts/migrate-google-images-daily.ts >> "$LOG_DIR/image-migration.log" 2>&1
EOF

chmod +x "$PROJECT_DIR/scripts/run-image-migration.sh"

# 获取当前 crontab
CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")

# 检查是否已存在该任务
if echo "$CURRENT_CRON" | grep -q "migrate-google-images-daily"; then
    echo "⚠️  Cron job already exists, updating..."
    # 移除旧的任务
    CURRENT_CRON=$(echo "$CURRENT_CRON" | grep -v "migrate-google-images-daily")
fi

# 添加新的 cron 任务（每天 0 点执行）
NEW_CRON="$CURRENT_CRON
# WanderLog: 每天 0 点迁移 Google 图片到 R2
0 0 * * * $PROJECT_DIR/scripts/run-image-migration.sh
"

# 安装新的 crontab
echo "$NEW_CRON" | crontab -

echo "✅ Cron job installed!"
echo ""
echo "📋 Current cron jobs:"
crontab -l | grep -v "^#" | grep -v "^$"
echo ""
echo "📝 Logs will be written to: $LOG_DIR/image-migration.log"
echo ""
echo "🧪 To test the migration manually:"
echo "   cd $API_DIR && npx tsx scripts/migrate-google-images-daily.ts"
