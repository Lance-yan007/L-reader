const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 IPC API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // IPC 调用（invoke）
  invoke: (channel, ...args) => {
    // 白名单：只允许特定的 IPC 通道
    const validChannels = [
      'get-app-config',
      'open-file-dialog',
      'open-folder-dialog',
      'read-file',
      'save-translation',
      'get-translations',
      'get-all-translations',
      'delete-translations',
      'open-profile-page',
      'storekit-initialize',
      'storekit-load-products',
      'storekit-purchase',
      'storekit-restore',
      'storekit-get-status',
      'save-annotations',
      'load-annotations',
      'save-annotations-to-pdf',
      'load-annotations-from-pdf',
      'open-file-from-main'
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    } else {
      console.warn(`Blocked IPC channel: ${channel}`);
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    }
  },

  // IPC 发送（send）
  send: (channel, ...args) => {
    const validChannels = [
      'auth-success',
      'open-document-tab',
      'window-state-changed'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`Blocked IPC channel: ${channel}`);
    }
  },

  // IPC 监听（on）
  on: (channel, callback) => {
    const validChannels = [
      'open-document-tab',
      'window-state-changed',
      'set-embed-mode',
      'file-opened'
    ];
    
    if (validChannels.includes(channel)) {
      // 使用 once 避免内存泄漏，或者使用 removeListener
      const wrappedCallback = (event, ...args) => callback(event, ...args);
      ipcRenderer.on(channel, wrappedCallback);
      
      // 返回清理函数
      return () => {
        ipcRenderer.removeListener(channel, wrappedCallback);
      };
    } else {
      console.warn(`Blocked IPC channel: ${channel}`);
    }
  },

  // IPC 发送到 host（用于 webview）
  sendToHost: (channel, ...args) => {
    const validChannels = [
      'close-tab-request',
      'update-tab-title'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.sendToHost(channel, ...args);
    } else {
      console.warn(`Blocked IPC channel: ${channel}`);
    }
  },

  // 移除监听器
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // 移除所有监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// 暴露版本信息（如果需要）
contextBridge.exposeInMainWorld('appVersion', {
  version: require('./package.json').version
});

