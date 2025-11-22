// 订阅管理工具类（浏览器环境）
// 用于在渲染进程中使用订阅功能

class SubscriptionHelper {
    constructor(supabase) {
        this.supabase = supabase;
        this.subscriptionCache = null;
        this.usageCache = null;
        this.cacheExpiry = 5 * 60 * 1000; // 5分钟缓存
        this.lastCacheTime = 0;
    }

    // 订阅限制配置
    static LIMITS = {
        free: {
            wordTranslations: 50,
            aiChat: 10,
            vocabulary: 100
        },
        monthly: {
            wordTranslations: 200,
            aiChat: 50,
            vocabulary: 500
        },
        yearly: {
            wordTranslations: Infinity,
            aiChat: Infinity,
            vocabulary: Infinity
        }
    };

    /**
     * 获取用户订阅状态
     */
    async getSubscriptionStatus(userId) {
        try {
            // 检查缓存
            const now = Date.now();
            if (this.subscriptionCache && (now - this.lastCacheTime) < this.cacheExpiry) {
                return this.subscriptionCache;
            }

            const { data, error } = await this.supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('查询订阅状态失败:', error);
                this.subscriptionCache = { planType: 'free', subscription: null };
                return this.subscriptionCache;
            }

            if (!data) {
                this.subscriptionCache = { planType: 'free', subscription: null };
                this.lastCacheTime = now;
                return this.subscriptionCache;
            }

            // 检查订阅是否过期
            const nowDate = new Date();
            const endDate = data.end_date ? new Date(data.end_date) : null;

            if (endDate && endDate < nowDate) {
                // 订阅已过期
                await this.supabase
                    .from('subscriptions')
                    .update({ status: 'expired' })
                    .eq('id', data.id);
                
                this.subscriptionCache = { planType: 'free', subscription: null };
            } else {
                this.subscriptionCache = {
                    planType: data.plan_type,
                    subscription: data
                };
            }

            this.lastCacheTime = now;
            return this.subscriptionCache;
        } catch (error) {
            console.error('获取订阅状态失败:', error);
            return { planType: 'free', subscription: null };
        }
    }

    /**
     * 获取今日使用量
     */
    async getTodayUsage(userId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            const { data, error } = await this.supabase
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
     * 注意：翻译数据存储在本地文件系统中，需要通过 IPC 获取
     */
    async getVocabularyCount(userId) {
        try {
            // 优先尝试从本地文件系统获取（通过 IPC）
            if (typeof window !== 'undefined' && window.electron && window.electron.invoke) {
                try {
                    const result = await window.electron.invoke('get-all-translations');
                    if (result && result.success && Array.isArray(result.data)) {
                        return result.data.length;
                    }
                } catch (ipcError) {
                    console.warn('通过 IPC 获取翻译数量失败，尝试从 Supabase 获取:', ipcError);
                }
            }

            // 降级方案：尝试从 Supabase 获取（如果数据已同步）
            // 注意：当前实现中翻译数据存储在本地文件系统，Supabase 可能没有数据
            try {
                const { count, error } = await this.supabase
                    .from('translations')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', userId);

                if (!error && count !== null) {
                    return count;
                }
            } catch (supabaseError) {
                console.warn('从 Supabase 获取翻译数量失败:', supabaseError);
            }

            // 如果都失败，返回 0
            return 0;
        } catch (error) {
            console.error('获取生词本数量失败:', error);
            return 0;
        }
    }

    /**
     * 检查功能限制
     */
    checkFeatureLimit(planType, feature, usage) {
        const limits = SubscriptionHelper.LIMITS[planType] || SubscriptionHelper.LIMITS.free;
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
     */
    async updateUsage(userId, feature, increment = 1) {
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

            // 先获取当前值
            const { data: existing, error: fetchError } = await this.supabase
                .from('usage_stats')
                .select(field)
                .eq('user_id', userId)
                .eq('date', today)
                .single();

            const currentValue = existing?.[field] || 0;
            const newValue = currentValue + increment;

            // 使用 upsert 更新
            const { error } = await this.supabase
                .from('usage_stats')
                .upsert({
                    user_id: userId,
                    date: today,
                    [field]: newValue
                }, {
                    onConflict: 'user_id,date'
                });

            if (error) {
                console.error('更新使用量失败:', error);
                return false;
            }

            // 清除缓存
            this.usageCache = null;
            return true;
        } catch (error) {
            console.error('更新使用量异常:', error);
            return false;
        }
    }

    /**
     * 检查并更新使用量（带限制检查）
     */
    async checkAndUpdateUsage(userId, feature) {
        try {
            // 获取订阅状态
            const subscription = await this.getSubscriptionStatus(userId);
            const planType = subscription.planType;

            // 获取使用量
            const usage = await this.getTodayUsage(userId);
            
            // 对于生词本，需要获取总数（不是每日使用量）
            if (feature === 'vocabulary') {
                const vocabularyCount = await this.getVocabularyCount(userId);
                usage.vocabularyCount = vocabularyCount;
                
                // 检查生词本限制（基于总数，不是每日）
                const limits = SubscriptionHelper.LIMITS[planType] || SubscriptionHelper.LIMITS.free;
                const limit = limits.vocabulary;
                
                if (limit === Infinity) {
                    // 无限，允许添加
                    // 注意：生词本不需要更新每日使用量统计
                    return {
                        allowed: true,
                        limitCheck: {
                            allowed: true,
                            remaining: Infinity,
                            limit: Infinity
                        }
                    };
                }
                
                if (vocabularyCount >= limit) {
                    // 达到上限
                    return {
                        allowed: false,
                        limitCheck: {
                            allowed: false,
                            remaining: 0,
                            limit: limit
                        },
                        message: this.getLimitMessage(planType, feature, {
                            allowed: false,
                            remaining: 0,
                            limit: limit
                        })
                    };
                }
                
                // 未达到上限，允许添加
                // 注意：生词本不需要更新每日使用量统计表
                return {
                    allowed: true,
                    limitCheck: {
                        allowed: true,
                        remaining: limit - vocabularyCount - 1,
                        limit: limit
                    }
                };
            }

            // 对于点词翻译和AI助手，检查每日限制
            const limitCheck = this.checkFeatureLimit(planType, feature, usage);

            if (!limitCheck.allowed) {
                return {
                    allowed: false,
                    limitCheck,
                    message: this.getLimitMessage(planType, feature, limitCheck)
                };
            }

            // 更新使用量（仅对点词翻译和AI助手）
            await this.updateUsage(userId, feature, 1);

            return {
                allowed: true,
                limitCheck: {
                    ...limitCheck,
                    remaining: limitCheck.remaining - 1
                }
            };
        } catch (error) {
            console.error('检查使用量失败:', error);
            return {
                allowed: false,
                message: '检查使用量失败，请稍后重试'
            };
        }
    }

    /**
     * 获取限制提示消息
     */
    getLimitMessage(planType, feature, limitCheck) {
        const featureNames = {
            wordTranslations: '点词翻译',
            aiChat: 'AI助手',
            vocabulary: '生词本'
        };

        const featureName = featureNames[feature] || feature;

        if (feature === 'vocabulary') {
            // 生词本的特殊提示（基于总数，不是每日）
            if (planType === 'free') {
                return `生词本已达到上限（${limitCheck.limit}个）。升级到月订阅可享受更多容量（500个），或升级到年订阅享受无限容量。`;
            } else if (planType === 'monthly') {
                return `生词本已达到上限（${limitCheck.limit}个）。升级到年订阅可享受无限容量。`;
            } else {
                return `生词本已达到上限。`;
            }
        } else {
            // 点词翻译和AI助手的提示（基于每日使用量）
            if (planType === 'free') {
                return `今日${featureName}使用次数已达上限（${limitCheck.limit}次）。升级到月订阅或年订阅可享受更多使用次数。`;
            } else if (planType === 'monthly') {
                return `今日${featureName}使用次数已达上限（${limitCheck.limit}次）。升级到年订阅可享受无限使用。`;
            } else {
                return `${featureName}使用次数已达上限。`;
            }
        }
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.subscriptionCache = null;
        this.usageCache = null;
        this.lastCacheTime = 0;
    }
}

// 如果在浏览器环境中，导出到全局
if (typeof window !== 'undefined') {
    window.SubscriptionHelper = SubscriptionHelper;
}

// 如果在Node.js环境中，使用module.exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionHelper;
}

