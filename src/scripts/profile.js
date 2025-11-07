// 个人中心管理模块
let supabase;

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
        waitForSupabase(() => {
            this.init();
        });
    }

    async init() {
        await this.loadUserInfo();
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
            link.download = `npdf-data-export-${new Date().toISOString().split('T')[0]}.json`;
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
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new ProfileManager();
});

