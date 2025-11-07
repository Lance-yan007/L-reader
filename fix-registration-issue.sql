-- 修复注册问题的 SQL 脚本
-- 在 Supabase SQL Editor 中执行

-- ============================================
-- 方案1：修改 RLS 策略，允许新用户插入自己的记录（推荐）
-- ============================================

-- 删除旧的策略（如果存在）
DROP POLICY IF EXISTS "Users can insert own data" ON users;

-- 创建新的插入策略：允许用户插入自己的记录
CREATE POLICY "Users can insert own data"
ON users FOR INSERT
WITH CHECK (auth.uid() = id);

-- ============================================
-- 方案2：使用数据库触发器自动创建用户记录（更优雅）
-- ============================================

-- 创建函数：当 auth.users 表有新用户时，自动在 users 表创建记录
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', NULL),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING; -- 如果已存在，不报错
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除旧的触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 创建触发器：监听 auth.users 表的插入事件
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 验证
-- ============================================

-- 检查策略
SELECT * FROM pg_policies WHERE tablename = 'users';

-- 检查触发器
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

