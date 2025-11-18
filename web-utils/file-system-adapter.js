/**
 * 文件系统适配器 - 将Electron文件系统API适配为Web File API
 */

class FileSystemAdapter {
    constructor() {
        this.fileHandles = new Map(); // 存储文件句柄
        this.directoryHandles = new Map(); // 存储目录句柄
    }
    
    /**
     * 打开文件对话框
     */
    async openFileDialog(options = {}) {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = options.filters?.map(f => f.extensions.map(ext => `.${ext}`).join(',')).join(',') || 
                          '.pdf,.doc,.docx,.txt';
            input.multiple = options.multiple || false;
            
            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) {
                    resolve({ canceled: true });
                    return;
                }
                
                if (options.multiple) {
                    const results = await Promise.all(
                        files.map(file => this.processFile(file))
                    );
                    resolve({ canceled: false, filePaths: results.map(r => r.path) });
                } else {
                    const result = await this.processFile(files[0]);
                    // 同时返回filePath和filePaths以兼容不同代码
                    resolve({ 
                        canceled: false, 
                        filePath: result.path,
                        filePaths: [result.path]
                    });
                }
            };
            
            input.oncancel = () => {
                resolve({ canceled: true });
            };
            
            input.click();
        });
    }
    
    /**
     * 打开文件夹对话框
     */
    async openFolderDialog() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.directory = true;
            input.multiple = true;
            
            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) {
                    resolve({ canceled: true });
                    return;
                }
                
                // 获取文件夹路径（使用第一个文件的目录）
                const folderPath = files[0].webkitRelativePath.split('/')[0];
                const fileList = files.map(file => ({
                    name: file.name,
                    path: file.webkitRelativePath,
                    size: file.size,
                    lastModified: file.lastModified
                }));
                
                resolve({ 
                    canceled: false, 
                    folderPath: folderPath,
                    files: fileList
                });
            };
            
            input.oncancel = () => {
                resolve({ canceled: true });
            };
            
            input.click();
        });
    }
    
    /**
     * 处理文件，存储到IndexedDB并返回路径
     */
    async processFile(file) {
        const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const filePath = `web://${fileId}/${file.name}`;
        
        // 将文件存储到IndexedDB
        await this.storeFile(fileId, file);
        
        // 存储文件元数据
        const metadata = {
            id: fileId,
            name: file.name,
            path: filePath,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
        };
        
        await this.storeMetadata(fileId, metadata);
        
        return {
            path: filePath,
            name: file.name,
            size: file.size,
            type: file.type
        };
    }
    
    /**
     * 读取文件内容
     */
    async readFile(filePath) {
        try {
            // 如果filePath是File对象（直接从input获取），直接处理
            if (filePath instanceof File) {
                const fileType = this.getFileType(filePath.name);
                
                if (fileType === 'pdf') {
                    const arrayBuffer = await filePath.arrayBuffer();
                    return {
                        success: true,
                        data: arrayBuffer,
                        type: 'pdf',
                        name: filePath.name
                    };
                } else if (fileType === 'txt') {
                    const text = await filePath.text();
                    return {
                        success: true,
                        data: text,
                        type: 'text',
                        name: filePath.name
                    };
                } else {
                    const arrayBuffer = await filePath.arrayBuffer();
                    return {
                        success: true,
                        data: arrayBuffer,
                        type: 'binary',
                        name: filePath.name
                    };
                }
            }
            
            // 从路径中提取文件ID
            const fileId = this.extractFileId(filePath);
            
            if (!fileId) {
                throw new Error('无效的文件路径');
            }
            
            // 从IndexedDB读取文件
            const file = await this.retrieveFile(fileId);
            
            if (!file) {
                throw new Error('文件不存在');
            }
            
            // 根据文件类型返回不同的数据
            const fileType = this.getFileType(filePath);
            
            if (fileType === 'pdf') {
                // PDF文件返回ArrayBuffer
                const arrayBuffer = await file.arrayBuffer();
                return {
                    success: true,
                    data: arrayBuffer,
                    type: 'pdf'
                };
            } else if (fileType === 'txt') {
                // 文本文件返回字符串
                const text = await file.text();
                return {
                    success: true,
                    data: text,
                    type: 'text'
                };
            } else {
                // 其他文件返回ArrayBuffer
                const arrayBuffer = await file.arrayBuffer();
                return {
                    success: true,
                    data: arrayBuffer,
                    type: 'binary'
                };
            }
        } catch (error) {
            console.error('读取文件失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 从路径中提取文件ID
     */
    extractFileId(filePath) {
        const match = filePath.match(/web:\/\/([^/]+)/);
        return match ? match[1] : null;
    }
    
    /**
     * 获取文件类型
     */
    getFileType(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const typeMap = {
            'pdf': 'pdf',
            'txt': 'txt',
            'doc': 'docx',
            'docx': 'docx'
        };
        return typeMap[ext] || 'unknown';
    }
    
    /**
     * 存储文件到IndexedDB
     */
    async storeFile(fileId, file) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LReaderFiles', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['files'], 'readwrite');
                const store = transaction.objectStore('files');
                
                const fileData = {
                    id: fileId,
                    file: file,
                    timestamp: Date.now()
                };
                
                const putRequest = store.put(fileData);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };
        });
    }
    
    /**
     * 从IndexedDB检索文件
     */
    async retrieveFile(fileId) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LReaderFiles', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['files'], 'readonly');
                const store = transaction.objectStore('files');
                const getRequest = store.get(fileId);
                
                getRequest.onsuccess = () => {
                    const result = getRequest.result;
                    resolve(result ? result.file : null);
                };
                getRequest.onerror = () => reject(getRequest.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };
        });
    }
    
    /**
     * 存储文件元数据
     */
    async storeMetadata(fileId, metadata) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LReaderFiles', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(['metadata'], 'readwrite');
                
                if (!db.objectStoreNames.contains('metadata')) {
                    const metadataStore = db.createObjectStore('metadata', { keyPath: 'id' });
                }
                
                const store = transaction.objectStore('metadata');
                const putRequest = store.put(metadata);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'id' });
                }
            };
        });
    }
    
    /**
     * 获取文件元数据
     */
    async getMetadata(fileId) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('LReaderFiles', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('metadata')) {
                    resolve(null);
                    return;
                }
                
                const transaction = db.transaction(['metadata'], 'readonly');
                const store = transaction.objectStore('metadata');
                const getRequest = store.get(fileId);
                
                getRequest.onsuccess = () => {
                    resolve(getRequest.result || null);
                };
                getRequest.onerror = () => reject(getRequest.error);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'id' });
                }
            };
        });
    }
}

// 创建全局实例
window.FileSystemAdapter = new FileSystemAdapter();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileSystemAdapter;
}

