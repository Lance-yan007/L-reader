-- 快速测试订阅功能的 SQL 脚本
-- 在 Supabase SQL Editor 中执行

-- ============================================
-- 1. 检查表是否存在
-- ============================================
SELECT 
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('subscriptions', 'usage_stats');

-- ============================================
-- 2. 获取当前用户ID（需要先登录应用）
-- 在应用控制台执行：await supabase.auth.getUser()
-- 然后替换下面的 'YOUR_USER_ID' 为实际用户ID
-- ============================================

-- ============================================
-- 3. 测试：创建月订阅
-- ============================================
-- INSERT INTO subscriptions (user_id, plan_type, status, start_date, end_date)
-- VALUES ('YOUR_USER_ID', 'monthly', 'active', NOW(), NOW() + INTERVAL '1 month');

-- ============================================
-- 4. 测试：创建年订阅
-- ============================================
-- INSERT INTO subscriptions (user_id, plan_type, status, start_date, end_date)
-- VALUES ('YOUR_USER_ID', 'yearly', 'active', NOW(), NOW() + INTERVAL '1 year');

-- ============================================
-- 5. 测试：重置为免费版
-- ============================================
-- DELETE FROM subscriptions WHERE user_id = 'YOUR_USER_ID';

-- ============================================
-- 6. 查看订阅状态
-- ============================================
-- SELECT * FROM subscriptions 
-- WHERE user_id = 'YOUR_USER_ID' 
-- ORDER BY created_at DESC;

-- ============================================
-- 7. 查看今日使用量
-- ============================================
-- SELECT * FROM usage_stats 
-- WHERE user_id = 'YOUR_USER_ID' 
-- AND date = CURRENT_DATE;

-- ============================================
-- 8. 清除今日使用量（用于重新测试）
-- ============================================
-- DELETE FROM usage_stats 
-- WHERE user_id = 'YOUR_USER_ID' 
-- AND date = CURRENT_DATE;

-- ============================================
-- 9. 创建测试使用量（模拟已使用）
-- ============================================
-- INSERT INTO usage_stats (user_id, date, word_translations, ai_chat_count)
-- VALUES ('YOUR_USER_ID', CURRENT_DATE, 45, 8)
-- ON CONFLICT (user_id, date) 
-- DO UPDATE SET 
--     word_translations = 45,
--     ai_chat_count = 8;

