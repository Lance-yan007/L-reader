// 订阅管理工具函数

// 订阅限制配置
const SUBSCRIPTION_LIMITS = {
    free: {
        wordTranslations: 50,      // 每日50次
        aiChat: 10,                 // 每日10次
        vocabulary: 100             // 最多100个单词
    },
    monthly: {
        wordTranslations: 200,      // 每日200次
        aiChat: 50,                 // 每日50次
        vocabulary: 500             // 最多500个单词
    },
    yearly: {
        wordTranslations: Infinity, // 无限
        aiChat: Infinity,           // 无限
        vocabulary: Infinity         // 无限
    }
};

/**
 * 获取用户订阅状态
 * @param {Object} supabase - Supabase客户端
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} 订阅信息
 */
async function getSubscriptionStatus(supabase, userId) {
    try {
        // 查询用户订阅记录
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('查询订阅状态失败:', error);
            return { planType: 'free', subscription: null };
        }

        if (!data) {
            return { planType: 'free', subscription: null };
        }

        // 检查订阅是否过期
        const now = new Date();
        const endDate = data.end_date ? new Date(data.end_date) : null;

        if (endDate && endDate < now) {
            // 订阅已过期，更新状态
            await supabase
                .from('subscriptions')
                .update({ status: 'expired' })
                .eq('id', data.id);
            
            return { planType: 'free', subscription: null };
        }

        return {
            planType: data.plan_type,
            subscription: data
        };
    } catch (error) {
        console.error('获取订阅状态失败:', error);
        return { planType: 'free', subscription: null };
    }
}

/**
 * 获取今日使用量
 * @param {Object} supabase - Supabase客户端
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} 使用量统计
 */
async function getTodayUsage(supabase, userId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('usage_stats')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('查询使用量失败:', error);
            return {
                wordTranslations: 0,
                aiChatCount: 0,
                vocabularyCount: 0
            };
        }

        return {
            wordTranslations: data?.word_translations || 0,
            aiChatCount: data?.ai_chat_count || 0,
            vocabularyCount: data?.vocabulary_count || 0
        };
    } catch (error) {
        console.error('获取使用量失败:', error);
        return {
            wordTranslations: 0,
            aiChatCount: 0,
            vocabularyCount: 0
        };
    }
}

/**
 * 获取生词本总数
 * @param {Object} supabase - Supabase客户端
 * @param {string} userId - 用户ID
 * @returns {Promise<number>} 生词本总数
 */
async function getVocabularyCount(supabase, userId) {
    try {
        // 这里需要根据实际的生词本表结构来查询
        // 假设有一个vocabularies表或者从translations表统计
        const { data, error } = await supabase
            .from('translations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) {
            console.error('查询生词本数量失败:', error);
            return 0;
        }

        return data?.length || 0;
    } catch (error) {
        console.error('获取生词本数量失败:', error);
        return 0;
    }
}

/**
 * 检查是否可以使用功能
 * @param {string} planType - 订阅类型
 * @param {string} feature - 功能类型 ('wordTranslations', 'aiChat', 'vocabulary')
 * @param {Object} usage - 当前使用量
 * @returns {Object} { allowed: boolean, remaining: number, limit: number }
 */
function checkFeatureLimit(planType, feature, usage) {
    const limits = SUBSCRIPTION_LIMITS[planType] || SUBSCRIPTION_LIMITS.free;
    const limit = limits[feature];
    const currentUsage = usage[feature] || 0;

    if (limit === Infinity) {
        return {
            allowed: true,
            remaining: Infinity,
            limit: Infinity
        };
    }

    const remaining = Math.max(0, limit - currentUsage);
    const allowed = remaining > 0;

    return {
        allowed,
        remaining,
        limit
    };
}

/**
 * 更新使用量
 * @param {Object} supabase - Supabase客户端
 * @param {string} userId - 用户ID
 * @param {string} feature - 功能类型
 * @param {number} increment - 增量（默认为1）
 * @returns {Promise<boolean>} 是否成功
 */
async function updateUsage(supabase, userId, feature, increment = 1) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const fieldMap = {
            wordTranslations: 'word_translations',
            aiChat: 'ai_chat_count',
            vocabulary: 'vocabulary_count'
        };

        const field = fieldMap[feature];
        if (!field) {
            console.error('无效的功能类型:', feature);
            return false;
        }

        // 使用 upsert 来更新或创建记录
        const { error } = await supabase
            .from('usage_stats')
            .upsert({
                user_id: userId,
                date: today,
                [field]: supabase.raw(`COALESCE(${field}, 0) + ${increment}`)
            }, {
                onConflict: 'user_id,date'
            });

        if (error) {
            console.error('更新使用量失败:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('更新使用量异常:', error);
        return false;
    }
}

/**
 * 格式化使用量显示
 * @param {number} current - 当前使用量
 * @param {number} limit - 限制
 * @returns {string} 格式化后的字符串
 */
function formatUsage(current, limit) {
    if (limit === Infinity) {
        return '无限';
    }
    return `${current}/${limit}`;
}

/**
 * 计算使用率百分比
 * @param {number} current - 当前使用量
 * @param {number} limit - 限制
 * @returns {number} 百分比 (0-100)
 */
function calculateUsagePercentage(current, limit) {
    if (limit === Infinity) {
        return 0;
    }
    if (limit === 0) {
        return 100;
    }
    return Math.min(100, Math.round((current / limit) * 100));
}

module.exports = {
    SUBSCRIPTION_LIMITS,
    getSubscriptionStatus,
    getTodayUsage,
    getVocabularyCount,
    checkFeatureLimit,
    updateUsage,
    formatUsage,
    calculateUsagePercentage
};

