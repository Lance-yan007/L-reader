/**
 * 应用配置文件
 * 包含 Supabase 连接信息和其他全局配置
 */

const AppConfig = {
    supabase: {
        // 用户的 Supabase 项目配置
        url: 'https://rjmumvfwpbcvtkllcehm.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqbXVtdmZ3cGJjdnRrbGxjZWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDI1NTgsImV4cCI6MjA3OTQxODU1OH0.yL8AyCuRIY7qRN0dl7p4-A_An39ft3ZroQRVBFzctNQ'
    },
    payment: {
        prices: {
            lifetime: '39.90' // USD or equivalent CNY
        }
    }
};

// 导出配置供不同环境使用
if (typeof window !== 'undefined') {
    window.AppConfig = AppConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppConfig;
}
