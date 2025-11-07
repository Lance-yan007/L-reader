// 认证辅助工具模块
const { supabase } = require('./supabase');

class AuthHelper {
    constructor() {
        this.currentUser = null;
        this.session = null;
    }

    // 检查登录状态
    async checkAuth() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;
            
            this.session = session;
            this.currentUser = session?.user || null;
            
            return {
                isAuthenticated: !!session,
                user: this.currentUser,
                session: session
            };
        } catch (error) {
            console.error('检查登录状态失败:', error);
            return {
                isAuthenticated: false,
                user: null,
                session: null
            };
        }
    }

    // 获取当前用户信息
    async getCurrentUser() {
        if (this.currentUser) {
            return this.currentUser;
        }

        const { isAuthenticated, user } = await this.checkAuth();
        return user;
    }

    // 获取用户详细信息（从 users 表）
    async getUserProfile() {
        try {
            const user = await this.getCurrentUser();
            if (!user) return null;

            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('获取用户信息失败:', error);
            return null;
        }
    }

    // 登出
    async logout() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            
            this.currentUser = null;
            this.session = null;
            
            return { success: true };
        } catch (error) {
            console.error('登出失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 监听认证状态变化
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange((event, session) => {
            this.session = session;
            this.currentUser = session?.user || null;
            
            if (callback) {
                callback(event, session, this.currentUser);
            }
        });
    }
}

// 导出单例
const authHelper = new AuthHelper();
module.exports = { authHelper };

