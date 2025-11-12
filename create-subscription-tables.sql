-- 订阅功能数据库表创建脚本
-- 在 Supabase SQL Editor 中执行

-- ============================================
-- 1. 创建订阅表 (subscriptions)
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('free', 'monthly', 'yearly')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    transaction_id VARCHAR(255), -- App Store 交易ID
    original_transaction_id VARCHAR(255), -- 原始交易ID（用于恢复购买）
    receipt_data TEXT, -- 收据数据（JSON格式）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, status) WHERE status = 'active'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);

-- ============================================
-- 2. 创建使用量统计表 (usage_stats)
-- ============================================

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

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_id ON public.usage_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON public.usage_stats(date);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_date ON public.usage_stats(user_id, date);

-- ============================================
-- 3. 启用行级安全策略 (RLS)
-- ============================================

-- 订阅表 RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 用户只能查看和管理自己的订阅
CREATE POLICY "Users can view own subscriptions"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
ON public.subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
ON public.subscriptions FOR UPDATE
USING (auth.uid() = user_id);

-- 使用量统计表 RLS
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;

-- 用户只能查看和管理自己的使用量
CREATE POLICY "Users can view own usage stats"
ON public.usage_stats FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage stats"
ON public.usage_stats FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage stats"
ON public.usage_stats FOR UPDATE
USING (auth.uid() = user_id);

-- ============================================
-- 4. 创建触发器：自动更新 updated_at
-- ============================================

-- 订阅表触发器
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriptions_updated_at();

-- 使用量统计表触发器
CREATE OR REPLACE FUNCTION update_usage_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_usage_stats_updated_at ON public.usage_stats;
CREATE TRIGGER trigger_update_usage_stats_updated_at
    BEFORE UPDATE ON public.usage_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_stats_updated_at();

-- ============================================
-- 5. 创建函数：自动创建每日使用量记录
-- ============================================

CREATE OR REPLACE FUNCTION create_daily_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- 当用户注册时，创建今日的使用量记录
    INSERT INTO public.usage_stats (user_id, date)
    VALUES (NEW.id, CURRENT_DATE)
    ON CONFLICT (user_id, date) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 注意：这个触发器需要在用户注册时触发
-- 如果已经有 handle_new_user 函数，可以在其中调用

-- ============================================
-- 6. 验证表是否创建成功
-- ============================================

-- 检查表是否存在
SELECT 
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('subscriptions', 'usage_stats');

-- 检查索引是否存在
SELECT 
    indexname,
    tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('subscriptions', 'usage_stats');

-- 检查策略是否存在
SELECT 
    tablename,
    policyname
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('subscriptions', 'usage_stats');

