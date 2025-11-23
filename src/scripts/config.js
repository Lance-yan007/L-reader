/**
 * 应用配置文件
 * 包含 Supabase 连接信息和其他全局配置
 */

const AppConfig = {
    supabase: {
        // 用户的 Supabase 项目配置
        url: 'https://rjmumvfwpbcvtkllcehm.supabase.co',
        anonKey: 'sb_publishable_F2pZVeDCJMnxy7K8ZsqTuQ_UrG5w3BM'
    }
};

// 导出配置供不同环境使用
if (typeof window !== 'undefined') {
    window.AppConfig = AppConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppConfig;
}
