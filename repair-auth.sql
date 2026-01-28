-- 修复数据库注册问题的脚本
-- 请在 Supabase 控制台的 SQL Editor 中运行此脚本

-- 1. 确保 public.users 表存在
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 启用 RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 重新应用 RLS 策略 (先删除旧的以防冲突)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.users;
CREATE POLICY "Public profiles are viewable by everyone." ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile." ON public.users;
CREATE POLICY "Users can update own profile." ON public.users FOR UPDATE USING (auth.uid() = id);

-- 2. 确保 usage_stats 表存在
CREATE TABLE IF NOT EXISTS public.usage_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    word_translations INT DEFAULT 0,
    ai_chat_count INT DEFAULT 0,
    vocabulary_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usage stats" ON public.usage_stats;
CREATE POLICY "Users can view own usage stats" ON public.usage_stats FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own usage stats" ON public.usage_stats;
CREATE POLICY "Users can update own usage stats" ON public.usage_stats FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own usage stats" ON public.usage_stats;
CREATE POLICY "Users can insert own usage stats" ON public.usage_stats FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. 修复或重建自动化触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- 尝试插入用户信息
  BEGIN
      INSERT INTO public.users (id, email, username, avatar_url)
      VALUES (
        new.id, 
        new.email, 
        new.raw_user_meta_data->>'username', 
        new.raw_user_meta_data->>'avatar_url'
      );
  EXCEPTION WHEN OTHERS THEN
      -- 如果插入 users 失败，记录日志但不阻止注册（防止注册完全失败）
      RAISE WARNING 'Failed to insert into public.users: %', SQLERRM;
  END;
  
  -- 尝试插入今日统计
  BEGIN
      INSERT INTO public.usage_stats (user_id, date)
      VALUES (new.id, CURRENT_DATE)
      ON CONFLICT (user_id, date) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to insert into public.usage_stats: %', SQLERRM;
  END;
  
  RETURN new;
END;
$$;

-- 重新绑定触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. 确保 postgres 角色有权限（防止权限错误）
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.users TO postgres;
GRANT ALL ON TABLE public.users TO service_role;
GRANT SELECT, UPDATE, INSERT ON TABLE public.users TO authenticated;

GRANT ALL ON TABLE public.usage_stats TO postgres;
GRANT ALL ON TABLE public.usage_stats TO service_role;
GRANT SELECT, UPDATE, INSERT ON TABLE public.usage_stats TO authenticated;

-- 为 UUID 生成函数赋权
GRANT EXECUTE ON FUNCTION uuid_generate_v4() TO authenticated;
GRANT EXECUTE ON FUNCTION uuid_generate_v4() TO service_role;
