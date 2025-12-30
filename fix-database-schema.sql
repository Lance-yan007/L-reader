-- 数据库修复脚本：完善用户系统和数据表
-- 请在 Supabase SQL Editor 中执行此脚本

-- 1. 创建 public.users 表（用户信息表）
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 启用行级安全策略 (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 策略：允许所有人查看用户信息（用于展示）
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.users FOR SELECT
  USING ( true );

-- 策略：用户只能修改自己的信息
CREATE POLICY "Users can update own profile."
  ON public.users FOR UPDATE
  USING ( auth.uid() = id );

-- 策略：用户只能插入自己的信息（通常由触发器处理，但作为备份）
CREATE POLICY "Users can insert own profile."
  ON public.users FOR INSERT
  WITH CHECK ( auth.uid() = id );

-- 2. 确保 usage_stats 表存在（从 create-subscription-tables.sql 复制）
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

-- 启用 usage_stats RLS
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'usage_stats' AND policyname = 'Users can view own usage stats'
    ) THEN
        CREATE POLICY "Users can view own usage stats" ON public.usage_stats FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'usage_stats' AND policyname = 'Users can update own usage stats'
    ) THEN
        CREATE POLICY "Users can update own usage stats" ON public.usage_stats FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'usage_stats' AND policyname = 'Users can insert own usage stats'
    ) THEN
        CREATE POLICY "Users can insert own usage stats" ON public.usage_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- 3. 创建自动触发器：当用户注册时，自动创建 users 记录和当日 usage_stats
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- 插入用户信息
  INSERT INTO public.users (id, email, username, avatar_url)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'username', 
    new.raw_user_meta_data->>'avatar_url'
  );
  
  -- 初始化今日使用量
  INSERT INTO public.usage_stats (user_id, date)
  VALUES (new.id, CURRENT_DATE)
  ON CONFLICT (user_id, date) DO NOTHING;
  
  RETURN new;
END;
$$;

-- 绑定触发器到 auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. 补充缺失的表（如果有）

-- 确保 annotations 表存在（如果之前的 schema 没有执行）
CREATE TABLE IF NOT EXISTS public.annotations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_path TEXT NOT NULL,
  data TEXT, -- JSON 字符串
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, file_path)
);

ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'annotations' AND policyname = 'Users can manage own annotations'
    ) THEN
        CREATE POLICY "Users can manage own annotations" ON public.annotations FOR ALL USING (auth.uid() = user_id);
    END IF;
END
$$;

-- 确保 translations 表存在
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_path TEXT NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT,
  context TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'translations' AND policyname = 'Users can manage own translations'
    ) THEN
        CREATE POLICY "Users can manage own translations" ON public.translations FOR ALL USING (auth.uid() = user_id);
    END IF;
END
$$;
