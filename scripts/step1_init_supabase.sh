#!/bin/bash

# Step 1: 初始化 Supabase 数据库
# 使用方法: ./scripts/step1_init_supabase.sh

set -e

echo "🚀 Step 1: 初始化 Supabase 数据库"
echo "=================================="

# 检查 Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI 未安装"
    echo "请运行: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI 已安装"

# 检查是否已登录
echo ""
echo "📝 检查登录状态..."
if ! supabase projects list &> /dev/null; then
    echo "⚠️  未登录，请先登录:"
    supabase login
fi

echo "✅ 已登录"

# 链接项目
echo ""
echo "🔗 链接 Supabase 项目..."
PROJECT_REF="bpygtpeawkxlgjhqorzi"

# 检查是否已链接
if [ ! -f ".supabase/config.toml" ]; then
    supabase link --project-ref $PROJECT_REF
    echo "✅ 项目已链接"
else
    echo "✅ 项目已经链接"
fi

# 执行迁移
echo ""
echo "📊 执行数据库迁移..."
echo "文件: supabase/migrations/001_initial_schema.sql"

# 使用 psql 直接执行 SQL 文件
SUPABASE_DB_URL=$(supabase status | grep "DB URL" | awk '{print $3}')

if [ -z "$SUPABASE_DB_URL" ]; then
    echo "⚠️  无法获取数据库 URL，使用 supabase db push"
    supabase db push
else
    echo "使用 psql 执行迁移..."
    psql "$SUPABASE_DB_URL" -f supabase/migrations/001_initial_schema.sql
fi

echo "✅ 迁移执行完成"

# 验证
echo ""
echo "🔍 验证迁移结果..."
echo ""
echo "检查表..."

# 创建验证 SQL
cat > /tmp/verify_migration.sql << 'EOF'
-- 检查所有表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 检查 RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 检查函数
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;
EOF

if [ -n "$SUPABASE_DB_URL" ]; then
    psql "$SUPABASE_DB_URL" -f /tmp/verify_migration.sql
    rm /tmp/verify_migration.sql
fi

echo ""
echo "=================================="
echo "✅ Step 1 完成！"
echo ""
echo "📋 预期结果:"
echo "  - 10+ 张表已创建"
echo "  - RLS 已启用"
echo "  - 3+ 个函数已创建"
echo ""
echo "🔜 下一步: ./scripts/step2_configure_env.sh"
echo "=================================="
