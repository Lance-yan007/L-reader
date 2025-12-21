// 认证管理模块
// 加载 Supabase 客户端
let supabase;

// Supabase 配置
// Supabase 配置
let SUPABASE_URL = 'https://xgdfwbqcjmjxdsxvmgot.supabase.co';
let SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZGZ3YnFjam1qeGRzeHZtZ290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNzk5MDgsImV4cCI6MjA3Nzk1NTkwOH0.YXHXZc71Ivl6WchD_1yNK7-wOVE0cxF5_uAqZCqR6Xw';

// 尝试从配置文件加载
if (typeof window !== 'undefined' && window.AppConfig) {
    SUPABASE_URL = window.AppConfig.supabase.url;
    SUPABASE_ANON_KEY = window.AppConfig.supabase.anonKey;
} else if (typeof require !== 'undefined') {
    try {
        const AppConfig = require('./config');
        SUPABASE_URL = AppConfig.supabase.url;
        SUPABASE_ANON_KEY = AppConfig.supabase.anonKey;
    } catch (e) {
        // 忽略错误，使用默认值
    }
}

// 初始化 Supabase 客户端
try {
    // 优先使用浏览器环境的 Supabase（通过 CDN 加载）
    // 检查是否已经在 HTML 中初始化了 Supabase 客户端
    if (typeof window !== 'undefined' && window.supabaseClient) {
        supabase = window.supabaseClient;
        console.log('✅ 使用预初始化的 Supabase 客户端');
    }
    // 如果还没有初始化，尝试使用全局 supabase 对象创建客户端
    else if (typeof window !== 'undefined' && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        // 优先使用 window.SUPABASE_CONFIG（如果存在），否则使用本地常量
        const url = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || SUPABASE_URL;
        const key = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || SUPABASE_ANON_KEY;
        supabase = window.supabase.createClient(url, key);
        window.supabaseClient = supabase; // 保存到全局，供后续使用
        console.log('✅ 创建浏览器 Supabase 客户端');
    }
    // 如果在 Electron 环境中，尝试使用 Node.js 版本
    else if (typeof require !== 'undefined') {
        try {
            const path = require('path');
            const possiblePaths = [
                path.join(__dirname, 'utils/supabase.js'),
                path.join(__dirname, '../utils/supabase.js'),
                path.join(__dirname, 'src/utils/supabase.js'),
                path.resolve(__dirname, 'utils/supabase.js'),
                path.resolve(__dirname, '../utils/supabase.js')
            ];

            let loaded = false;
            for (const tryPath of possiblePaths) {
                try {
                    const supabaseModule = require(tryPath);
                    supabase = supabaseModule.supabase;
                    console.log('✅ 使用 Node.js Supabase 客户端:', tryPath);
                    loaded = true;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!loaded) {
                throw new Error('无法加载 Supabase 模块');
            }
        } catch (e) {
            // 如果 require 失败，尝试使用浏览器版本
            console.warn('⚠️ Node.js 加载失败，尝试使用浏览器版本');
            if (typeof window !== 'undefined' && window.supabaseClient) {
                supabase = window.supabaseClient;
            } else if (typeof window !== 'undefined' && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                window.supabaseClient = supabase;
            } else {
                throw new Error('Supabase 库未加载，请确保 CDN 脚本已加载');
            }
        }
    } else {
        throw new Error('无法确定运行环境');
    }
} catch (e) {
    console.error('❌ 加载 Supabase 失败:', e.message);
    // 创建一个假的 supabase 对象，避免应用崩溃
    supabase = {
        auth: {
            signInWithPassword: async () => ({ data: null, error: new Error('Supabase 未加载') }),
            signUp: async () => ({ data: null, error: new Error('Supabase 未加载') }),
            getSession: async () => ({ data: { session: null }, error: null }),
            signOut: async () => ({ error: new Error('Supabase 未加载') })
        },
        from: () => ({
            insert: () => ({ error: new Error('Supabase 未加载') })
        })
    };
}

class AuthManager {
    constructor() {
        this.pendingVerificationEmail = null; // 保存待验证的邮箱
        this.init();
    }

    init() {
        // 检查 URL 参数，看是否从验证链接跳转回来
        this.checkVerificationCallback();

        // 检查是否已登录
        this.checkAuth();

        // 绑定事件
        this.bindEvents();
    }

    checkVerificationCallback() {
        // 检查 URL 中是否有验证相关的参数
        const urlParams = new URLSearchParams(window.location.search);
        const type = urlParams.get('type');
        const token = urlParams.get('token');

        if (type === 'signup' && token) {
            // 用户从验证链接跳转回来
            this.showSuccessMessage('邮箱验证成功！请使用你的邮箱和密码登录。');

            // 清理 URL 参数
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    bindEvents() {
        // 登录/注册切换
        const showRegisterBtn = document.getElementById('showRegister');
        const showLoginBtn = document.getElementById('showLogin');

        if (showRegisterBtn) {
            showRegisterBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegister();
            });
        }

        if (showLoginBtn) {
            showLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLogin();
            });
        }

        // 登录按钮
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.login();
            });
        }

        // 注册按钮
        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                this.register();
            });
        }

        // 回车键登录/注册
        document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });

        document.getElementById('registerPasswordConfirm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.register();
            }
        });

        // 重新发送验证邮件链接
        const resendLink = document.getElementById('resendVerificationLink');
        if (resendLink) {
            resendLink.addEventListener('click', (e) => {
                e.preventDefault();
                // 如果有保存的邮箱，直接发送；否则显示输入框
                if (this.pendingVerificationEmail) {
                    this.resendVerificationEmail();
                } else {
                    // 显示输入框
                    const resendForm = document.getElementById('resendVerificationForm');
                    if (resendForm) {
                        resendForm.style.display = resendForm.style.display === 'none' ? 'block' : 'none';
                    }
                }
            });
        }

        // 重新发送验证邮件按钮（输入框中的）
        const resendEmailBtn = document.getElementById('resendEmailBtn');
        const resendEmailInput = document.getElementById('resendEmailInput');
        if (resendEmailBtn && resendEmailInput) {
            resendEmailBtn.addEventListener('click', () => {
                const email = resendEmailInput.value.trim();
                if (email) {
                    this.resendVerificationEmail(email);
                } else {
                    this.showError('请输入邮箱地址');
                    resendEmailInput.focus();
                }
            });

            // 回车键发送
            resendEmailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    resendEmailBtn.click();
                }
            });
        }
    }

    showLogin() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const resendContainer = document.getElementById('resendVerificationContainer');
        const resendForm = document.getElementById('resendVerificationForm');

        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';

        // 如果有待验证的邮箱，显示重新发送链接
        if (resendContainer) {
            resendContainer.style.display = 'block'; // 总是显示，让用户可以输入邮箱
        }

        // 默认隐藏输入框
        if (resendForm) {
            resendForm.style.display = 'none';
        }

        this.hideError();
    }

    showRegister() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
        this.hideError();
    }

    showError(message) {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.className = 'error-message'; // 确保是错误样式
            errorEl.style.display = 'block';
            setTimeout(() => {
                this.hideError();
            }, 5000);
        }
    }

    showSuccessMessage(message) {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.className = 'error-message success-message'; // 添加成功样式类
            errorEl.style.display = 'block';
            // 成功消息显示更长时间
            setTimeout(() => {
                this.hideError();
            }, 10000);
        }
    }

    hideError() {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    async resendVerificationEmail(email = null) {
        // 如果没有提供邮箱，使用保存的邮箱或登录框中的邮箱
        const emailToUse = email || this.pendingVerificationEmail || document.getElementById('loginEmail')?.value;

        if (!emailToUse) {
            this.showError('请输入邮箱地址');
            // 如果登录框为空，聚焦到登录邮箱输入框
            const loginEmailInput = document.getElementById('loginEmail');
            if (loginEmailInput) {
                loginEmailInput.focus();
            }
            return;
        }

        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailToUse)) {
            this.showError('邮箱格式不正确');
            return;
        }

        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: emailToUse
            });

            if (error) {
                // 提供更友好的错误信息
                let errorMessage = '重新发送失败';
                if (error.message.includes('rate limit')) {
                    errorMessage = '发送过于频繁，请稍后再试';
                } else if (error.message.includes('not found')) {
                    errorMessage = '该邮箱未注册，请先注册';
                } else {
                    errorMessage = '重新发送失败：' + error.message;
                }
                this.showError(errorMessage);
            } else {
                this.showSuccessMessage(
                    `验证邮件已重新发送到 ${emailToUse}。\n\n` +
                    `请检查你的邮箱（包括垃圾邮件文件夹）。\n` +
                    `如果仍然没收到，请等待几分钟后重试。`
                );
                // 保存邮箱地址
                this.pendingVerificationEmail = emailToUse;
            }
        } catch (error) {
            console.error('重新发送验证邮件时出错:', error);
            this.showError('重新发送失败：' + (error.message || '未知错误'));
        }
    }

    async login() {
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;

        if (!email || !password) {
            this.showError('请填写邮箱和密码');
            return;
        }

        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = '登录中...';
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // 登录成功，跳转到主界面
            if (window.location.pathname.includes('auth.html')) {
                window.location.href = '/app.html';
            } else {
                // 在 Electron 中，使用 IPC 通知主进程
                if (window.electron && window.electron.ipcRenderer) {
                    window.electron.ipcRenderer.send('auth-success', data);
                } else {
                    window.location.href = '/app.html';
                }
            }
        } catch (error) {
            this.showError(error.message || '登录失败，请检查邮箱和密码');
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = '登录';
            }
        }
    }

    async register() {
        const email = document.getElementById('registerEmail')?.value;
        const username = document.getElementById('registerUsername')?.value;
        const password = document.getElementById('registerPassword')?.value;
        const passwordConfirm = document.getElementById('registerPasswordConfirm')?.value;

        if (!email || !password) {
            this.showError('请填写邮箱和密码');
            return;
        }

        if (password.length < 6) {
            this.showError('密码长度至少6位');
            return;
        }

        if (password !== passwordConfirm) {
            this.showError('两次密码不一致');
            return;
        }

        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.textContent = '注册中...';
        }

        try {
            // 1. 注册认证账号
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username: username || null
                    }
                }
            });

            if (authError) {
                console.error('Supabase 认证错误:', authError);
                // 提供更友好的错误信息
                if (authError.message.includes('already registered')) {
                    throw new Error('该邮箱已被注册，请直接登录');
                } else if (authError.message.includes('Invalid email')) {
                    throw new Error('邮箱格式不正确');
                } else if (authError.message.includes('Password')) {
                    throw new Error('密码不符合要求');
                } else {
                    throw new Error(authError.message || '注册失败，请检查网络连接');
                }
            }

            if (!authData.user) {
                throw new Error('注册失败，请重试');
            }

            console.log('✅ 认证账号创建成功，用户ID:', authData.user.id);

            // 2. 检查是否有 session（如果 Supabase 配置为自动确认，注册后会立即返回 session）
            if (authData.session) {
                console.log('✅ 注册成功，已自动登录，session 已返回');
                // 注册成功且已登录，跳转到主界面
                // 注意：用户记录应该由数据库触发器自动创建，不需要手动插入
                if (window.location.pathname.includes('auth.html')) {
                    window.location.href = '/app.html';
                } else {
                    if (window.electron && window.electron.ipcRenderer) {
                        window.electron.ipcRenderer.send('auth-success', authData);
                    } else {
                        window.location.href = '/app.html';
                    }
                }
                return; // 直接返回，不执行后续代码
            }

            // 3. 如果没有 session（需要邮箱验证）
            // 注意：不要尝试创建用户记录，因为：
            // 1. 没有 session token，会触发 401 错误
            // 2. 用户记录应该由数据库触发器自动创建
            // 3. 如果触发器不存在，用户验证邮箱后登录时再创建也可以
            console.log('ℹ️ 注册成功，但需要邮箱验证');

            // 显示友好的提示信息（使用成功消息，不是错误消息）
            this.showSuccessMessage(
                `注册成功！我们已向 ${email} 发送了一封验证邮件。\n\n` +
                `请检查你的邮箱（包括垃圾邮件文件夹），点击验证链接完成注册。\n\n` +
                `验证成功后，你就可以使用邮箱和密码登录了。`
            );

            // 保存邮箱地址，用于重新发送验证邮件
            this.pendingVerificationEmail = email;

            // 切换到登录页面，但显示提示
            this.showLogin();

            // 清空注册表单
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerUsername').value = '';
            document.getElementById('registerPassword').value = '';
            document.getElementById('registerPasswordConfirm').value = '';
        } catch (error) {
            console.error('注册过程出错:', error);
            this.showError(error.message || '注册失败，请重试');
        } finally {
            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.textContent = '注册';
            }
        }
    }

    async checkAuth() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                // 已登录，跳转到主界面
                if (window.location.pathname.includes('auth.html')) {
                    window.location.href = '/app.html';
                }
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
        }
    }
}

// 初始化 - 等待 Supabase 客户端准备好
function initAuthManager() {
    // 如果 Supabase 客户端已经初始化，直接创建 AuthManager
    if (typeof window !== 'undefined' && window.supabaseClient) {
        new AuthManager();
        return;
    }

    // 否则等待 Supabase 客户端初始化
    // 优先监听自定义事件
    const onSupabaseReady = () => {
        if (typeof window !== 'undefined' && window.supabaseClient) {
            window.removeEventListener('supabase-ready', onSupabaseReady);
            new AuthManager();
        }
    };
    window.addEventListener('supabase-ready', onSupabaseReady);

    // 同时使用轮询作为备用（最多等待 10 秒）
    let attempts = 0;
    const maxAttempts = 100; // 100 * 100ms = 10秒

    const checkSupabase = setInterval(() => {
        attempts++;

        if (typeof window !== 'undefined' && window.supabaseClient) {
            clearInterval(checkSupabase);
            window.removeEventListener('supabase-ready', onSupabaseReady);
            new AuthManager();
        } else if (attempts >= maxAttempts) {
            clearInterval(checkSupabase);
            window.removeEventListener('supabase-ready', onSupabaseReady);
            console.error('❌ 等待 Supabase 客户端超时');
            // 即使超时也尝试创建，让错误处理机制处理
            new AuthManager();
        }
    }, 100);
}

// 在 DOMContentLoaded 时初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthManager);
} else {
    // DOM 已经加载完成，直接初始化
    initAuthManager();
}

