-- =====================================================
-- 创建测试用户
-- 注意：这个脚本需要在 Supabase SQL Editor 中执行
-- 但更推荐通过 Supabase Dashboard > Authentication > Users 创建用户
-- =====================================================

-- 方法 1：通过 Supabase Dashboard 创建（推荐）
-- 1. 进入 Supabase Dashboard
-- 2. 选择 Authentication > Users
-- 3. 点击 "Add user" > "Create new user"
-- 4. 输入邮箱和密码
-- 5. 勾选 "Auto Confirm User"

-- 方法 2：如果需要通过 SQL 创建，可以使用以下命令
-- 注意：这需要 service_role 权限，普通 SQL Editor 可能无法执行

-- 检查用户是否存在
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'blcubahaa0627@gmail.com';

-- 如果用户存在但邮箱未确认，可以手动确认
-- UPDATE auth.users 
-- SET email_confirmed_at = NOW() 
-- WHERE email = 'blcubahaa0627@gmail.com' AND email_confirmed_at IS NULL;

-- 查看所有用户
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 10;
