// 个人中心管理模块
let supabase;

// 订阅工具函数（在浏览器环境中使用）
const SUBSCRIPTION_LIMITS = {
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

// 初始化 Supabase 客户端
function initSupabase() {
    if (typeof window !== 'undefined' && window.supabaseClient) {
        supabase = window.supabaseClient;
        console.log('✅ 使用预初始化的 Supabase 客户端');
        return true;
    } else if (typeof window !== 'undefined' && typeof supabase !== 'undefined' && supabase.createClient) {
        const url = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://xgdfwbqcjmjxdsxvmgot.supabase.co';
        const key = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || '';
        supabase = supabase.createClient(url, key);
        window.supabaseClient = supabase;
        console.log('✅ 创建浏览器 Supabase 客户端');
        return true;
    }
    return false;
}

// 等待 Supabase 客户端初始化
function waitForSupabase(callback) {
    if (initSupabase()) {
        callback();
        return;
    }
    
    const onSupabaseReady = () => {
        if (initSupabase()) {
            window.removeEventListener('supabase-ready', onSupabaseReady);
            callback();
        }
    };
    window.addEventListener('supabase-ready', onSupabaseReady);
    
    let attempts = 0;
    const maxAttempts = 100;
    const checkInterval = setInterval(() => {
        attempts++;
        if (initSupabase()) {
            clearInterval(checkInterval);
            window.removeEventListener('supabase-ready', onSupabaseReady);
            callback();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            window.removeEventListener('supabase-ready', onSupabaseReady);
            console.error('❌ 等待 Supabase 客户端超时');
        }
    }, 100);
}

class ProfileManager {
    constructor() {
        this.currentUser = null;
        this.subscriptionStatus = { planType: 'free', subscription: null };
        this.usageStats = {
            wordTranslations: 0,
            aiChatCount: 0,
            vocabularyCount: 0
        };
        waitForSupabase(() => {
            this.init();
        });
    }

    async init() {
        await this.loadUserInfo();
        await this.loadSubscriptionStatus();
        await this.loadUsageStats();
        this.bindEvents();
    }

    async loadUserInfo() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            
            if (error) throw error;
            if (!user) {
                this.showError('未登录，请先登录');
                return;
            }

            this.currentUser = user;

            // 更新用户信息显示
            const userEmail = document.getElementById('userEmail');
            const userName = document.getElementById('userName');
            const userCreatedAt = document.getElementById('userCreatedAt');

            if (userEmail) {
                userEmail.textContent = user.email || '未设置';
            }

            if (userName) {
                // 尝试从 metadata 获取用户名
                const username = user.user_metadata?.username || user.email?.split('@')[0] || '用户';
                userName.textContent = username;
            }

            if (userCreatedAt) {
                const date = new Date(user.created_at);
                userCreatedAt.textContent = date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }

            // 加载用户设置
            this.loadAutoSaveSettings();
        } catch (error) {
            console.error('加载用户信息失败:', error);
            this.showError('加载用户信息失败：' + error.message);
        }
    }

    async loadSubscriptionStatus() {
        try {
            if (!supabase || !this.currentUser) return;

            // 查询用户订阅记录
            const { data, error } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('查询订阅状态失败:', error);
                this.subscriptionStatus = { planType: 'free', subscription: null };
            } else if (data) {
                // 检查订阅是否过期
                const now = new Date();
                const endDate = data.end_date ? new Date(data.end_date) : null;

                if (endDate && endDate < now) {
                    // 订阅已过期
                    await supabase
                        .from('subscriptions')
                        .update({ status: 'expired' })
                        .eq('id', data.id);
                    
                    this.subscriptionStatus = { planType: 'free', subscription: null };
                } else {
                    this.subscriptionStatus = {
                        planType: data.plan_type,
                        subscription: data
                    };
                }
            } else {
                this.subscriptionStatus = { planType: 'free', subscription: null };
            }

            this.updateSubscriptionUI();
            
            // 检查订阅到期提醒
            if (this.subscriptionStatus.subscription) {
                this.checkSubscriptionExpiry();
            }
        } catch (error) {
            console.error('加载订阅状态失败:', error);
            this.subscriptionStatus = { planType: 'free', subscription: null };
            this.updateSubscriptionUI();
        }
    }

    /**
     * 检查订阅到期提醒
     */
    checkSubscriptionExpiry() {
        const subscription = this.subscriptionStatus.subscription;
        if (!subscription || !subscription.end_date) return;

        const endDate = new Date(subscription.end_date);
        const now = new Date();
        const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        // 到期前7天提醒
        if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) {
            const planNames = {
                monthly: '月订阅',
                yearly: '年订阅'
            };
            const planName = planNames[this.subscriptionStatus.planType] || '订阅';
            
            this.showExpiryReminder(daysUntilExpiry, planName, endDate);
        }
    }

    /**
     * 显示到期提醒
     */
    showExpiryReminder(daysLeft, planName, endDate) {
        // 检查是否已经提醒过（使用 localStorage）
        const reminderKey = `subscription_reminder_${this.currentUser.id}_${endDate.toISOString().split('T')[0]}`;
        if (localStorage.getItem(reminderKey)) {
            return; // 今天已经提醒过了
        }

        const message = daysLeft === 1 
            ? `您的${planName}将在明天到期，请及时续费以继续享受服务。`
            : `您的${planName}将在${daysLeft}天后到期（${endDate.toLocaleDateString('zh-CN')}），请及时续费以继续享受服务。`;

        // 创建提醒弹窗
        const reminderDiv = document.createElement('div');
        reminderDiv.className = 'subscription-expiry-reminder';
        reminderDiv.innerHTML = `
            <div class="reminder-content">
                <div class="reminder-icon">⏰</div>
                <div class="reminder-message">${this.escapeHtml(message)}</div>
                <div class="reminder-actions">
                    <button class="reminder-button reminder-button-primary" id="renewSubscriptionBtn">立即续费</button>
                    <button class="reminder-button" id="dismissReminderBtn">稍后提醒</button>
                </div>
            </div>
        `;

        document.body.appendChild(reminderDiv);

        // 绑定事件
        const renewBtn = reminderDiv.querySelector('#renewSubscriptionBtn');
        const dismissBtn = reminderDiv.querySelector('#dismissReminderBtn');

        renewBtn.addEventListener('click', () => {
            reminderDiv.remove();
            this.showSubscriptionModal();
            // 标记为已提醒
            localStorage.setItem(reminderKey, 'true');
        });

        dismissBtn.addEventListener('click', () => {
            reminderDiv.remove();
            // 标记为已提醒（今天不再提醒）
            localStorage.setItem(reminderKey, 'true');
        });

        // 10秒后自动关闭
        setTimeout(() => {
            if (reminderDiv.parentNode) {
                reminderDiv.remove();
            }
        }, 10000);
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async loadUsageStats() {
        try {
            if (!supabase || !this.currentUser) return;

            const today = new Date().toISOString().split('T')[0];
            
            // 获取今日使用量
            const { data: usageData, error: usageError } = await supabase
                .from('usage_stats')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('date', today)
                .single();

            if (usageError && usageError.code !== 'PGRST116') {
                console.error('查询使用量失败:', usageError);
            } else if (usageData) {
                this.usageStats = {
                    wordTranslations: usageData.word_translations || 0,
                    aiChatCount: usageData.ai_chat_count || 0,
                    vocabularyCount: usageData.vocabulary_count || 0
                };
            }

            // 获取生词本总数（从translations表统计）
            const { count: vocabularyCount, error: vocabError } = await supabase
                .from('translations')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', this.currentUser.id);

            if (!vocabError && vocabularyCount !== null) {
                this.usageStats.vocabularyCount = vocabularyCount;
            }

            this.updateUsageUI();
        } catch (error) {
            console.error('加载使用量失败:', error);
        }
    }

    updateSubscriptionUI() {
        const { planType, subscription } = this.subscriptionStatus;
        const badge = document.getElementById('subscriptionBadge');
        const badgeText = document.getElementById('subscriptionType');
        const endDateEl = document.getElementById('subscriptionEndDate');
        const upgradeBtn = document.getElementById('upgradeSubscriptionBtn');
        const upgradeBtnText = document.getElementById('upgradeButtonText');
        const manageBtn = document.getElementById('manageSubscriptionBtn');

        // 更新徽章
        if (badge) {
            badge.className = `status-badge ${planType}`;
        }
        if (badgeText) {
            const planNames = {
                free: '免费版',
                monthly: '月订阅',
                yearly: '年订阅'
            };
            badgeText.textContent = planNames[planType] || '免费版';
        }

        // 更新到期时间
        if (endDateEl) {
            if (subscription && subscription.end_date) {
                const endDate = new Date(subscription.end_date);
                endDateEl.textContent = endDate.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } else {
                endDateEl.textContent = '-';
            }
        }

        // 更新按钮
        if (upgradeBtn) {
            if (planType === 'free') {
                upgradeBtn.style.display = 'flex';
                if (upgradeBtnText) upgradeBtnText.textContent = '升级订阅';
            } else if (planType === 'monthly') {
                upgradeBtn.style.display = 'flex';
                if (upgradeBtnText) upgradeBtnText.textContent = '升级到年订阅';
            } else {
                upgradeBtn.style.display = 'none';
            }
        }

        if (manageBtn) {
            manageBtn.style.display = (planType !== 'free') ? 'flex' : 'none';
        }
    }

    updateUsageUI() {
        const { planType } = this.subscriptionStatus;
        const limits = SUBSCRIPTION_LIMITS[planType] || SUBSCRIPTION_LIMITS.free;

        // 更新点词翻译
        this.updateUsageItem(
            'wordTranslationUsage',
            'wordTranslationProgress',
            this.usageStats.wordTranslations,
            limits.wordTranslations,
            '点词翻译'
        );

        // 更新AI助手
        this.updateUsageItem(
            'aiChatUsage',
            'aiChatProgress',
            this.usageStats.aiChatCount,
            limits.aiChat,
            'AI助手'
        );

        // 更新生词本
        this.updateUsageItem(
            'vocabularyUsage',
            'vocabularyProgress',
            this.usageStats.vocabularyCount,
            limits.vocabulary,
            '生词本'
        );
    }

    updateUsageItem(countElId, progressElId, current, limit, label) {
        const countEl = document.getElementById(countElId);
        const progressEl = document.getElementById(progressElId);

        if (!countEl || !progressEl) return;

        // 更新计数显示
        if (limit === Infinity) {
            countEl.textContent = '无限';
            countEl.classList.add('unlimited');
            progressEl.style.width = '0%';
            progressEl.className = 'usage-progress-bar';
        } else {
            countEl.textContent = `${current}/${limit}`;
            countEl.classList.remove('unlimited');
            
            // 更新进度条
            const percentage = Math.min(100, Math.round((current / limit) * 100));
            progressEl.style.width = `${percentage}%`;
            
            // 根据使用率设置颜色
            if (percentage >= 90) {
                progressEl.className = 'usage-progress-bar danger';
            } else if (percentage >= 70) {
                progressEl.className = 'usage-progress-bar warning';
            } else {
                progressEl.className = 'usage-progress-bar';
            }
        }
    }

    loadAutoSaveSettings() {
        // 从 localStorage 加载自动保存设置
        const autoSaveTranslations = localStorage.getItem('autoSaveTranslations') !== 'false';
        const autoSaveAnnotations = localStorage.getItem('autoSaveAnnotations') !== 'false';

        const autoSaveTranslationsCheck = document.getElementById('autoSaveTranslations');
        const autoSaveAnnotationsCheck = document.getElementById('autoSaveAnnotations');

        if (autoSaveTranslationsCheck) {
            autoSaveTranslationsCheck.checked = autoSaveTranslations;
        }

        if (autoSaveAnnotationsCheck) {
            autoSaveAnnotationsCheck.checked = autoSaveAnnotations;
        }
    }

    bindEvents() {
        console.log('开始绑定事件...');
        
        // 账号操作
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        const deleteAccountBtn = document.getElementById('deleteAccountBtn');

        console.log('changePasswordBtn:', changePasswordBtn);
        console.log('deleteAccountBtn:', deleteAccountBtn);

        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('修改密码按钮被点击');
                this.handleChangePassword();
            });
        } else {
            console.error('修改密码按钮未找到');
        }

        // 修改密码模态对话框事件
        const closePasswordModal = document.getElementById('closePasswordModal');
        const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
        const submitPasswordBtn = document.getElementById('submitPasswordBtn');
        const changePasswordForm = document.getElementById('changePasswordForm');

        if (closePasswordModal) {
            closePasswordModal.addEventListener('click', () => {
                this.hideChangePasswordModal();
            });
        }

        if (cancelPasswordBtn) {
            cancelPasswordBtn.addEventListener('click', () => {
                this.hideChangePasswordModal();
            });
        }

        if (submitPasswordBtn) {
            submitPasswordBtn.addEventListener('click', () => {
                this.submitPasswordChange();
            });
        }

        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitPasswordChange();
            });
        }

        // 点击模态对话框外部关闭
        const changePasswordModal = document.getElementById('changePasswordModal');
        if (changePasswordModal) {
            changePasswordModal.addEventListener('click', (e) => {
                if (e.target === changePasswordModal) {
                    this.hideChangePasswordModal();
                }
            });
        }

        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => {
                this.handleDeleteAccount();
            });
        }

        // 阅读设置
        const autoSaveTranslationsCheck = document.getElementById('autoSaveTranslations');
        const autoSaveAnnotationsCheck = document.getElementById('autoSaveAnnotations');

        if (autoSaveTranslationsCheck) {
            autoSaveTranslationsCheck.addEventListener('change', (e) => {
                localStorage.setItem('autoSaveTranslations', e.target.checked);
                this.showSuccess('自动保存翻译设置已更新');
            });
        }

        if (autoSaveAnnotationsCheck) {
            autoSaveAnnotationsCheck.addEventListener('change', (e) => {
                localStorage.setItem('autoSaveAnnotations', e.target.checked);
                this.showSuccess('自动保存标注设置已更新');
            });
        }

        // 数据管理
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        const exportDataBtn = document.getElementById('exportDataBtn');
        const importDataBtn = document.getElementById('importDataBtn');

        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                this.handleClearCache();
            });
        }

        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => {
                this.handleExportData();
            });
        }

        if (importDataBtn) {
            importDataBtn.addEventListener('click', () => {
                this.handleImportData();
            });
        }

        // 订阅相关事件
        const upgradeBtn = document.getElementById('upgradeSubscriptionBtn');
        const manageBtn = document.getElementById('manageSubscriptionBtn');
        const closeSubscriptionModal = document.getElementById('closeSubscriptionModal');
        const selectMonthlyPlan = document.getElementById('selectMonthlyPlan');
        const selectYearlyPlan = document.getElementById('selectYearlyPlan');

        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', () => {
                this.showSubscriptionModal();
            });
        }

        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                this.handleManageSubscription();
            });
        }

        if (closeSubscriptionModal) {
            closeSubscriptionModal.addEventListener('click', () => {
                this.hideSubscriptionModal();
            });
        }

        if (selectMonthlyPlan) {
            selectMonthlyPlan.addEventListener('click', () => {
                this.handleSelectPlan('monthly');
            });
        }

        if (selectYearlyPlan) {
            selectYearlyPlan.addEventListener('click', () => {
                this.handleSelectPlan('yearly');
            });
        }

        // 点击模态对话框外部关闭
        const subscriptionModal = document.getElementById('subscriptionModal');
        if (subscriptionModal) {
            subscriptionModal.addEventListener('click', (e) => {
                if (e.target === subscriptionModal) {
                    this.hideSubscriptionModal();
                }
            });
        }

    }

    async handleDeleteAccount() {
        if (!confirm('确定要删除账号吗？此操作不可恢复，所有数据将被永久删除。')) {
            return;
        }

        if (!confirm('再次确认：你真的要删除账号吗？')) {
            return;
        }

        try {
            this.showError('账号删除功能开发中...');
            // TODO: 实现账号删除功能
        } catch (error) {
            console.error('删除账号失败:', error);
            this.showError('删除账号失败：' + error.message);
        }
    }

    showChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        const form = document.getElementById('changePasswordForm');
        const errorDiv = document.getElementById('passwordFormError');
        
        if (modal) {
            modal.style.display = 'flex';
            // 清空表单
            if (form) {
                form.reset();
            }
            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }
            // 聚焦到第一个输入框
            const firstInput = document.getElementById('currentPassword');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    hideChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async handleChangePassword() {
        console.log('handleChangePassword 被调用');
        
        // 检查 supabase 是否已初始化
        if (!supabase) {
            console.error('Supabase 客户端未初始化');
            this.showError('系统未就绪，请刷新页面重试');
            return;
        }
        
        console.log('Supabase 客户端已初始化');

        // 检查用户是否已登录
        const { data: { user }, error: getUserError } = await supabase.auth.getUser();
        
        if (getUserError) {
            console.error('获取用户信息失败:', getUserError);
            this.showError('获取用户信息失败: ' + getUserError.message);
            return;
        }
        
        if (!user) {
            this.showError('请先登录');
            return;
        }

        console.log('用户已登录:', user.email);
        this.showChangePasswordModal();
    }

    async submitPasswordChange() {
        const currentPassword = document.getElementById('currentPassword')?.value;
        const newPassword = document.getElementById('newPassword')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;
        const errorDiv = document.getElementById('passwordFormError');
        const submitBtn = document.getElementById('submitPasswordBtn');

        // 清空之前的错误
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }

        // 验证输入
        if (!currentPassword || !newPassword || !confirmPassword) {
            if (errorDiv) {
                errorDiv.textContent = '请填写所有字段';
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (newPassword.length < 6) {
            if (errorDiv) {
                errorDiv.textContent = '密码长度至少为6个字符';
                errorDiv.style.display = 'block';
            }
            return;
        }

        if (newPassword !== confirmPassword) {
            if (errorDiv) {
                errorDiv.textContent = '两次输入的密码不一致';
                errorDiv.style.display = 'block';
            }
            return;
        }

        // 禁用提交按钮
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '处理中...';
        }

        try {
            // 获取当前用户
            const { data: { user }, error: getUserError } = await supabase.auth.getUser();
            
            if (getUserError || !user) {
                throw new Error('获取用户信息失败');
            }

            console.log('开始验证当前密码...');
            
            // 先验证当前密码（通过重新登录验证）
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword
            });

            if (signInError) {
                console.error('当前密码验证失败:', signInError);
                if (errorDiv) {
                    errorDiv.textContent = '当前密码不正确';
                    errorDiv.style.display = 'block';
                }
                return;
            }

            console.log('当前密码验证成功，开始更新密码...');

            // 更新密码
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) {
                console.error('更新密码错误:', updateError);
                if (errorDiv) {
                    errorDiv.textContent = '更新密码失败: ' + updateError.message;
                    errorDiv.style.display = 'block';
                }
                return;
            }

            console.log('密码修改成功');
            this.hideChangePasswordModal();
            this.showSuccess('密码修改成功');
        } catch (error) {
            console.error('修改密码失败:', error);
            const errorMessage = error.message || '修改密码失败，请重试';
            if (errorDiv) {
                errorDiv.textContent = errorMessage;
                errorDiv.style.display = 'block';
            }
        } finally {
            // 恢复提交按钮
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '确认修改';
            }
        }
    }

    async handleClearCache() {
        if (!confirm('确定要清除所有缓存数据吗？此操作不可恢复。')) {
            return;
        }

        try {
            // 清除 localStorage 中的缓存数据（保留设置）
            const autoSaveTranslations = localStorage.getItem('autoSaveTranslations');
            const autoSaveAnnotations = localStorage.getItem('autoSaveAnnotations');

            localStorage.clear();

            // 恢复设置
            if (autoSaveTranslations) localStorage.setItem('autoSaveTranslations', autoSaveTranslations);
            if (autoSaveAnnotations) localStorage.setItem('autoSaveAnnotations', autoSaveAnnotations);

            this.showSuccess('缓存已清除');
        } catch (error) {
            console.error('清除缓存失败:', error);
            this.showError('清除缓存失败：' + error.message);
        }
    }

    async handleExportData() {
        try {
            const data = {
                recentFiles: JSON.parse(localStorage.getItem('recentFiles') || '[]'),
                settings: {
                    autoSaveTranslations: localStorage.getItem('autoSaveTranslations'),
                    autoSaveAnnotations: localStorage.getItem('autoSaveAnnotations')
                },
                exportDate: new Date().toISOString()
            };

            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `l-reader-data-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showSuccess('数据导出成功');
        } catch (error) {
            console.error('导出数据失败:', error);
            this.showError('导出数据失败：' + error.message);
        }
    }

    async handleImportData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (data.recentFiles) {
                    localStorage.setItem('recentFiles', JSON.stringify(data.recentFiles));
                }

                if (data.settings) {
                    if (data.settings.autoSaveTranslations) localStorage.setItem('autoSaveTranslations', data.settings.autoSaveTranslations);
                    if (data.settings.autoSaveAnnotations) localStorage.setItem('autoSaveAnnotations', data.settings.autoSaveAnnotations);
                }

                this.loadAutoSaveSettings();
                this.showSuccess('数据导入成功');
            } catch (error) {
                console.error('导入数据失败:', error);
                this.showError('导入数据失败：' + error.message);
            }
        };
        input.click();
    }

    showError(message) {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.className = 'error-message';
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    }

    showSuccess(message) {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.className = 'success-message';
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 3000);
        }
    }

    showSubscriptionModal() {
        const modal = document.getElementById('subscriptionModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideSubscriptionModal() {
        const modal = document.getElementById('subscriptionModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async handleSelectPlan(planType) {
        try {
            if (!this.currentUser) {
                this.showError('请先登录');
                return;
            }

            // 显示处理中状态
            const planButton = planType === 'monthly' 
                ? document.getElementById('selectMonthlyPlan')
                : document.getElementById('selectYearlyPlan');
            
            if (planButton) {
                const originalText = planButton.textContent;
                planButton.disabled = true;
                planButton.textContent = '处理中...';
            }

            // 检查是否在Electron环境中
            const isElectron = typeof require !== 'undefined' && require('electron');
            
            if (isElectron) {
                // 在Electron环境中，使用StoreKit进行真实购买
                await this.purchaseWithStoreKit(planType);
            } else {
                // 在浏览器环境中，提示用户下载应用
                this.showError('请在 macOS 应用中完成订阅购买');
            }
            
        } catch (error) {
            console.error('选择订阅计划失败:', error);
            this.showError('订阅失败：' + error.message);
            
            // 恢复按钮状态
            const planButton = planType === 'monthly' 
                ? document.getElementById('selectMonthlyPlan')
                : document.getElementById('selectYearlyPlan');
            
            if (planButton) {
                planButton.disabled = false;
                planButton.textContent = planType === 'monthly' ? '选择月订阅' : '选择年订阅';
            }
        }
    }

    /**
     * 使用 StoreKit 购买订阅
     */
    async purchaseWithStoreKit(planType) {
        try {
            // 加载 StoreKit 管理器
            const { getStoreKitManager } = await import('../utils/storekit.js');
            const storeKit = getStoreKitManager();

            // 初始化 StoreKit
            const initResult = await storeKit.initialize();
            if (!initResult.success) {
                throw new Error(initResult.error || 'StoreKit 初始化失败');
            }

            // 加载产品信息
            const productsResult = await storeKit.loadProducts();
            if (!productsResult.success) {
                throw new Error(productsResult.error || '加载产品信息失败');
            }

            // 发起购买
            this.showSuccess('正在打开 App Store 支付...');
            const purchaseResult = await storeKit.purchaseSubscription(planType);

            if (purchaseResult.success) {
                // 购买成功，验证收据并更新订阅状态
                await this.verifyAndCreateSubscription(planType, purchaseResult.receipt);
            } else {
                // 检查是否是用户取消
                if (purchaseResult.error && purchaseResult.error.includes('cancelled')) {
                    this.showError('购买已取消');
                } else if (purchaseResult.error && purchaseResult.error.includes('需要配置')) {
                    // StoreKit 未完全配置，提供测试模式选项
                    const useTestMode = confirm(
                        'StoreKit 需要完整配置才能使用真实支付。\n\n' +
                        '是否使用测试模式创建订阅？（仅用于开发测试）\n\n' +
                        '要启用真实支付，请：\n' +
                        '1. 在 App Store Connect 中配置订阅产品\n' +
                        '2. 集成原生 StoreKit 模块\n' +
                        '3. 配置收据验证服务'
                    );
                    
                    if (useTestMode) {
                        await this.createSubscription(planType);
                    }
                } else {
                    throw new Error(purchaseResult.error || '购买失败');
                }
            }
        } catch (error) {
            console.error('StoreKit 购买失败:', error);
            this.showError('购买失败：' + error.message);
        }
    }

    /**
     * 验证收据并创建订阅
     */
    async verifyAndCreateSubscription(planType, receipt) {
        try {
            // 验证收据
            const verificationResult = await this.verifyReceipt(receipt, planType);
            
            if (!verificationResult.success) {
                throw new Error(verificationResult.error || '收据验证失败');
            }

            // 验证成功后创建订阅记录
            await this.createSubscription(planType, {
                receipt: receipt,
                transactionId: verificationResult.transactionId,
                originalTransactionId: verificationResult.originalTransactionId
            });
            
            // 重新加载订阅状态
            await this.loadSubscriptionStatus();
            await this.loadUsageStats();
            
            this.hideSubscriptionModal();
            this.showSuccess('订阅成功！感谢您的支持！');
        } catch (error) {
            console.error('验证收据失败:', error);
            this.showError('订阅验证失败：' + error.message);
        }
    }

    /**
     * 验证收据
     * @param {string} receipt - 购买收据
     * @param {string} planType - 订阅类型
     * @returns {Promise<Object>} 验证结果
     */
    async verifyReceipt(receipt, planType) {
        try {
            // 方案1：使用 Apple 的验证 API（推荐）
            // 需要服务器端实现，这里提供客户端验证的占位
            
            // 方案2：使用 App Store Connect API
            // 需要配置 API Key
            
            // 临时：对于测试模式，直接返回成功
            // 生产环境必须实现真实的收据验证
            
            if (!receipt || receipt === 'test') {
                // 测试模式
                return {
                    success: true,
                    transactionId: `test_${Date.now()}`,
                    originalTransactionId: `test_${Date.now()}`,
                    productId: planType === 'monthly' ? 'com.npdf.reader.monthly' : 'com.npdf.reader.yearly'
                };
            }

            // TODO: 实现真实的收据验证
            // 1. 将收据发送到您的服务器
            // 2. 服务器调用 Apple 验证 API
            // 3. 返回验证结果
            
            // 示例：调用服务器验证 API
            /*
            const response = await fetch('https://your-server.com/verify-receipt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    receipt: receipt,
                    productId: planType === 'monthly' ? 'com.npdf.reader.monthly' : 'com.npdf.reader.yearly'
                })
            });
            
            const result = await response.json();
            return result;
            */

            // 临时返回成功（仅用于开发测试）
            return {
                success: true,
                transactionId: `receipt_${Date.now()}`,
                originalTransactionId: `receipt_${Date.now()}`,
                productId: planType === 'monthly' ? 'com.npdf.reader.monthly' : 'com.npdf.reader.yearly'
            };
        } catch (error) {
            console.error('收据验证失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async createSubscription(planType, receiptData = {}) {
        try {
            if (!supabase || !this.currentUser) return;

            const now = new Date();
            const endDate = new Date();
            
            if (planType === 'monthly') {
                endDate.setMonth(endDate.getMonth() + 1);
            } else if (planType === 'yearly') {
                endDate.setFullYear(endDate.getFullYear() + 1);
            }

            // 如果已有活跃订阅，先取消旧的
            const { data: existingSubscriptions } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .eq('status', 'active');

            if (existingSubscriptions && existingSubscriptions.length > 0) {
                // 取消旧订阅
                for (const sub of existingSubscriptions) {
                    await supabase
                        .from('subscriptions')
                        .update({ status: 'cancelled' })
                        .eq('id', sub.id);
                }
            }

            // 创建新订阅
            const subscriptionData = {
                user_id: this.currentUser.id,
                plan_type: planType,
                status: 'active',
                start_date: now.toISOString(),
                end_date: endDate.toISOString()
            };

            // 如果有收据信息，添加到订阅数据中
            if (receiptData.transactionId) {
                subscriptionData.transaction_id = receiptData.transactionId;
            }
            if (receiptData.originalTransactionId) {
                subscriptionData.original_transaction_id = receiptData.originalTransactionId;
            }
            if (receiptData.receipt) {
                // 收据数据可以存储在单独的表中，这里只存储引用
                subscriptionData.receipt_data = JSON.stringify(receiptData.receipt);
            }

            const { data, error } = await supabase
                .from('subscriptions')
                .insert(subscriptionData)
                .select()
                .single();

            if (error) throw error;

            // 清除订阅缓存
            if (window.getStoreKitManager) {
                const storeKit = window.getStoreKitManager();
                if (storeKit && storeKit.clearCache) {
                    storeKit.clearCache();
                }
            }

            // 重新加载订阅状态
            await this.loadSubscriptionStatus();
            await this.loadUsageStats();
            
            return data;
        } catch (error) {
            console.error('创建订阅失败:', error);
            throw error;
        }
    }

    async handleManageSubscription() {
        try {
            if (!this.currentUser || !this.subscriptionStatus.subscription) {
                this.showError('没有活跃的订阅');
                return;
            }

            const subscription = this.subscriptionStatus.subscription;
            const planType = this.subscriptionStatus.planType;
            
            // 显示订阅管理弹窗
            this.showSubscriptionManagementModal(subscription, planType);
        } catch (error) {
            console.error('打开订阅管理失败:', error);
            this.showError('打开订阅管理失败：' + error.message);
        }
    }

    /**
     * 显示订阅管理弹窗
     */
    showSubscriptionManagementModal(subscription, planType) {
        // 创建管理弹窗
        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal-overlay';
        modalDiv.id = 'subscriptionManagementModal';
        modalDiv.style.display = 'flex';
        
        const endDate = subscription.end_date ? new Date(subscription.end_date) : null;
        const endDateStr = endDate ? endDate.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : '-';

        const planNames = {
            monthly: '月订阅',
            yearly: '年订阅'
        };

        modalDiv.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>订阅管理</h2>
                    <button class="modal-close" id="closeManagementModal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="subscription-details">
                        <div class="detail-item">
                            <span class="detail-label">订阅类型</span>
                            <span class="detail-value">${planNames[planType] || planType}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">订阅状态</span>
                            <span class="detail-value status-active">活跃</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">开始时间</span>
                            <span class="detail-value">${new Date(subscription.start_date).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">到期时间</span>
                            <span class="detail-value">${endDateStr}</span>
                        </div>
                    </div>
                    <div class="subscription-actions-management">
                        <button class="action-button action-button-primary" id="openAppStoreSubscriptionBtn">
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"/>
                            </svg>
                            在 App Store 中管理订阅
                        </button>
                        <button class="action-button" id="restorePurchasesBtn">
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path fill="currentColor" d="M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20C13.57,20 15.03,19.54 16.26,18.76L14.8,17.3C13.97,17.75 13,18 12,18M18.76,16.26L17.3,14.8C17.74,13.97 18,13 18,12A6,6 0 0,0 12,6C11,6 10.03,6.25 9.2,6.7L7.74,5.24C8.97,4.46 10.43,4 12,4A8,8 0 0,1 20,12C20,13.57 19.54,15.03 18.76,16.26M19,3L21,5V9H19V5H15V3H19M19,21V19H21V15H19V13H21V11H19V9H21V5H19V3H17V5H13V3H11V5H9V3H7V5H3V9H5V11H3V13H5V15H3V19H5V21H7V19H11V21H13V19H17V21H19Z"/>
                            </svg>
                            恢复购买
                        </button>
                    </div>
                    <div class="subscription-note-management">
                        <p>💡 取消订阅后，您仍可使用到订阅到期日</p>
                        <p>💡 订阅到期后，将自动降级为免费版</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);

        // 绑定事件
        const closeBtn = modalDiv.querySelector('#closeManagementModal');
        const openAppStoreBtn = modalDiv.querySelector('#openAppStoreSubscriptionBtn');
        const restoreBtn = modalDiv.querySelector('#restorePurchasesBtn');

        closeBtn.addEventListener('click', () => {
            modalDiv.remove();
        });

        modalDiv.addEventListener('click', (e) => {
            if (e.target === modalDiv) {
                modalDiv.remove();
            }
        });

        openAppStoreBtn.addEventListener('click', () => {
            this.openAppStoreSubscriptionManagement();
            modalDiv.remove();
        });

        restoreBtn.addEventListener('click', async () => {
            await this.restorePurchases();
            modalDiv.remove();
        });
    }

    /**
     * 打开 App Store 订阅管理页面
     */
    async openAppStoreSubscriptionManagement() {
        try {
            // 在 macOS 上打开系统订阅管理
            if (typeof require !== 'undefined' && require('electron')) {
                const { shell } = require('electron');
                // macOS 订阅管理 URL
                await shell.openExternal('https://apps.apple.com/account/subscriptions');
                this.showSuccess('正在打开 App Store 订阅管理...');
            } else {
                // 浏览器环境
                window.open('https://apps.apple.com/account/subscriptions', '_blank');
            }
        } catch (error) {
            console.error('打开订阅管理页面失败:', error);
            this.showError('打开订阅管理页面失败：' + error.message);
        }
    }

    /**
     * 恢复购买
     */
    async restorePurchases() {
        try {
            this.showSuccess('正在恢复购买...');

            // 检查是否在 Electron 环境中
            const isElectron = typeof require !== 'undefined' && require('electron');
            
            if (isElectron) {
                // 使用 StoreKit 恢复购买
                const { getStoreKitManager } = await import('../utils/storekit.js');
                const storeKit = getStoreKitManager();
                
                const result = await storeKit.restorePurchases();
                
                if (result.success) {
                    // 重新加载订阅状态
                    await this.loadSubscriptionStatus();
                    this.showSuccess('购买已恢复！');
                } else {
                    if (result.error && result.error.includes('需要配置')) {
                        // StoreKit 未配置，提示用户
                        this.showError('恢复购买功能需要完整配置 StoreKit');
                    } else {
                        this.showError('恢复购买失败：' + (result.error || '未知错误'));
                    }
                }
            } else {
                this.showError('请在 macOS 应用中恢复购买');
            }
        } catch (error) {
            console.error('恢复购买失败:', error);
            this.showError('恢复购买失败：' + error.message);
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new ProfileManager();
});

