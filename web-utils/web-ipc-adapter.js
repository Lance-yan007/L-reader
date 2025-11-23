/**
 * IPC适配器 - 将Electron IPC调用适配为Web API
 * 这个文件模拟了Electron的IPC通信，使其在Web环境中也能工作
 */

// 模拟 ipcRenderer
const ipcAdapter = {
    // 存储事件监听器
    listeners: new Map(),

    // 模拟 invoke 方法
    invoke: async (channel, ...args) => {
        console.log(`[IPC Adapter] invoke: ${channel}`, args);

        // 根据不同的channel调用相应的处理函数
        switch (channel) {
            case 'get-app-config':
                return {
                    name: 'L-reader',
                    version: '1.0.0',
                    userDataPath: 'web-storage',
                    documentsPath: 'web-storage/documents',
                    translationsPath: 'web-storage/translations',
                    annotationsPath: 'web-storage/annotations'
                };

            case 'read-file':
                // 文件读取由 file-system-adapter 处理
                if (window.WebFSAdapter) {
                    return window.WebFSAdapter.readFile(args[0]);
                } else {
                    return { success: false, error: 'WebFSAdapter未初始化' };
                }

            case 'open-file-dialog':
                return window.WebFSAdapter.openFileDialog();

            case 'open-folder-dialog':
                return window.WebFSAdapter.openFolderDialog();

            case 'save-translation':
                return window.StorageAdapter.saveTranslation(args[0], args[1]);

            case 'get-translations':
                return window.StorageAdapter.getTranslations(args[0]);

            case 'get-all-translations':
                return window.StorageAdapter.getAllTranslations();

            case 'delete-translations':
                return window.StorageAdapter.deleteTranslations(args[0]);

            case 'save-annotations':
                return window.StorageAdapter.saveAnnotations(args[0], args[1]);

            case 'load-annotations':
                return window.StorageAdapter.loadAnnotations(args[0]);

            case 'save-annotations-to-pdf':
                // PDF保存功能在Web环境中需要特殊处理
                console.warn('save-annotations-to-pdf 在Web环境中暂不支持');
                return { success: false, message: 'Web环境不支持保存到PDF' };

            case 'load-annotations-from-pdf':
                return window.StorageAdapter.loadAnnotations(args[0]);

            case 'save-vocabulary':
                return window.StorageAdapter.saveVocabulary(args[0], args[1], args[2]);

            case 'get-vocabulary':
                return window.StorageAdapter.getAllVocabulary();

            case 'delete-vocabulary':
                return window.StorageAdapter.deleteVocabulary(args[0]);

            case 'open-profile-page':
                // 在Web环境中，直接导航到profile页面
                window.location.href = '#/profile';
                return { success: true };

            case 'open-file-from-main':
                // 触发文件打开事件
                window.dispatchEvent(new CustomEvent('file-opened', { detail: args[0] }));
                return { success: true };

            default:
                console.warn(`[IPC Adapter] 未处理的channel: ${channel}`);
                return { success: false, error: `Unknown channel: ${channel}` };
        }
    },

    // 模拟 send 方法
    send: (channel, ...args) => {
        console.log(`[IPC Adapter] send: ${channel}`, args);

        // 触发自定义事件
        window.dispatchEvent(new CustomEvent(`ipc-${channel}`, { detail: args }));
    },

    // 模拟 on 方法
    on: (channel, callback) => {
        console.log(`[IPC Adapter] 注册监听器: ${channel}`);

        const eventName = `ipc-${channel}`;
        const handler = (event) => {
            callback({}, ...event.detail);
        };

        window.addEventListener(eventName, handler);

        // 存储监听器以便后续移除（使用ipcAdapter.listeners而不是this.listeners）
        if (!ipcAdapter.listeners.has(channel)) {
            ipcAdapter.listeners.set(channel, []);
        }
        ipcAdapter.listeners.get(channel).push({ handler, callback });

        // 返回清理函数
        return () => {
            window.removeEventListener(eventName, handler);
            const listeners = ipcAdapter.listeners.get(channel);
            if (listeners) {
                const index = listeners.findIndex(l => l.callback === callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    },

    // 模拟 removeListener 方法
    removeListener: (channel, callback) => {
        const listeners = this.listeners.get(channel);
        if (listeners) {
            const index = listeners.findIndex(l => l.callback === callback);
            if (index > -1) {
                const { handler } = listeners[index];
                window.removeEventListener(`ipc-${channel}`, handler);
                listeners.splice(index, 1);
            }
        }
    },

    // 模拟 removeAllListeners 方法
    removeAllListeners: (channel) => {
        const listeners = ipcAdapter.listeners.get(channel);
        if (listeners) {
            listeners.forEach(({ handler }) => {
                window.removeEventListener(`ipc-${channel}`, handler);
            });
            ipcAdapter.listeners.delete(channel);
        }
    }
};

// 如果代码中直接使用 ipcRenderer，创建全局变量
if (typeof window !== 'undefined') {
    // 模拟 require('electron')
    window.require = window.require || function (module) {
        if (module === 'electron') {
            return {
                ipcRenderer: ipcAdapter,
                remote: {
                    getCurrentWindow: () => ({
                        webContents: {
                            openDevTools: () => console.log('开发者工具在Web环境中不可用')
                        }
                    })
                }
            };
        }
        throw new Error(`Cannot find module '${module}'`);
    };

    // 直接暴露 ipcRenderer
    window.ipcRenderer = ipcAdapter;

    // 暴露 electron 对象（模拟 contextBridge）
    window.electron = {
        invoke: ipcAdapter.invoke.bind(ipcAdapter),
        send: ipcAdapter.send.bind(ipcAdapter),
        on: ipcAdapter.on.bind(ipcAdapter),
        removeListener: ipcAdapter.removeListener.bind(ipcAdapter),
        removeAllListeners: ipcAdapter.removeAllListeners.bind(ipcAdapter)
    };
}

// 导出适配器
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ipcRenderer: ipcAdapter };
}

