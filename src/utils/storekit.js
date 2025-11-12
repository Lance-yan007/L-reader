// StoreKit 集成模块
// 用于处理 App Store 内购

const { ipcRenderer } = require('electron');

/**
 * StoreKit 订阅管理器
 */
class StoreKitManager {
    constructor() {
        this.products = {
            monthly: 'com.npdf.reader.monthly',
            yearly: 'com.npdf.reader.yearly'
        };
        this.isInitialized = false;
    }

    /**
     * 初始化 StoreKit
     */
    async initialize() {
        try {
            // 通过IPC调用主进程初始化StoreKit
            const result = await ipcRenderer.invoke('storekit-initialize');
            this.isInitialized = result.success;
            return result;
        } catch (error) {
            console.error('StoreKit初始化失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 加载订阅产品信息
     */
    async loadProducts() {
        try {
            const productIds = Object.values(this.products);
            const result = await ipcRenderer.invoke('storekit-load-products', productIds);
            return result;
        } catch (error) {
            console.error('加载产品信息失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 购买订阅
     * @param {string} planType - 'monthly' 或 'yearly'
     */
    async purchaseSubscription(planType) {
        try {
            const productId = this.products[planType];
            if (!productId) {
                throw new Error('无效的订阅类型');
            }

            // 通过IPC调用主进程购买
            const result = await ipcRenderer.invoke('storekit-purchase', productId);
            return result;
        } catch (error) {
            console.error('购买订阅失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 恢复购买
     */
    async restorePurchases() {
        try {
            const result = await ipcRenderer.invoke('storekit-restore');
            return result;
        } catch (error) {
            console.error('恢复购买失败:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取订阅状态
     */
    async getSubscriptionStatus() {
        try {
            const result = await ipcRenderer.invoke('storekit-get-status');
            return result;
        } catch (error) {
            console.error('获取订阅状态失败:', error);
            return { success: false, error: error.message };
        }
    }
}

// 导出单例
let storeKitManager = null;

function getStoreKitManager() {
    if (!storeKitManager) {
        storeKitManager = new StoreKitManager();
    }
    return storeKitManager;
}

// 浏览器环境导出
if (typeof window !== 'undefined') {
    window.StoreKitManager = StoreKitManager;
    window.getStoreKitManager = getStoreKitManager;
}

// Node.js环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StoreKitManager, getStoreKitManager };
}

