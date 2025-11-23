/**
 * 存储适配器 - 将Electron文件系统存储适配为Web存储（IndexedDB + localStorage）
 */

class StorageAdapter {
    constructor() {
        this.dbName = 'LReaderStorage';
        this.dbVersion = 1;
        this.db = null;
        this.initDB();
    }
    
    /**
     * 初始化IndexedDB
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建对象存储
                if (!db.objectStoreNames.contains('translations')) {
                    db.createObjectStore('translations', { keyPath: 'id', autoIncrement: true });
                }
                
                if (!db.objectStoreNames.contains('annotations')) {
                    db.createObjectStore('annotations', { keyPath: 'id', autoIncrement: true });
                }
                
                if (!db.objectStoreNames.contains('vocabulary')) {
                    db.createObjectStore('vocabulary', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }
    
    /**
     * 确保数据库已初始化
     */
    async ensureDB() {
        if (!this.db) {
            await this.initDB();
        }
        return this.db;
    }
    
    /**
     * 保存翻译记录
     */
    async saveTranslation(filePath, translation) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['translations'], 'readwrite');
            const store = transaction.objectStore('translations');
            
            const translationData = {
                filePath: filePath,
                originalText: translation.originalText || translation.text,
                translatedText: translation.translatedText || translation.translation,
                timestamp: Date.now(),
                ...translation
            };
            
            return new Promise((resolve, reject) => {
                const request = store.add(translationData);
                request.onsuccess = () => {
                    resolve({ success: true, id: request.result });
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('保存翻译失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 获取指定文件的翻译记录
     */
    async getTranslations(filePath) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['translations'], 'readonly');
            const store = transaction.objectStore('translations');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const allTranslations = request.result;
                    const fileTranslations = allTranslations.filter(t => t.filePath === filePath);
                    resolve({ success: true, data: fileTranslations });
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('获取翻译失败:', error);
            return { success: false, error: error.message, data: [] };
        }
    }
    
    /**
     * 获取所有翻译记录
     */
    async getAllTranslations() {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['translations'], 'readonly');
            const store = transaction.objectStore('translations');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    resolve({ success: true, data: request.result });
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('获取所有翻译失败:', error);
            return { success: false, error: error.message, data: [] };
        }
    }
    
    /**
     * 删除翻译记录
     */
    async deleteTranslations(filePath) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['translations'], 'readwrite');
            const store = transaction.objectStore('translations');
            
            // 先获取所有记录
            const getAllRequest = store.getAll();
            return new Promise((resolve, reject) => {
                getAllRequest.onsuccess = () => {
                    const allTranslations = getAllRequest.result;
                    const toDelete = allTranslations.filter(t => t.filePath === filePath);
                    
                    if (toDelete.length === 0) {
                        resolve({ success: true, deleted: 0 });
                        return;
                    }
                    
                    let deleted = 0;
                    let errors = 0;
                    
                    toDelete.forEach(translation => {
                        const deleteRequest = store.delete(translation.id);
                        deleteRequest.onsuccess = () => deleted++;
                        deleteRequest.onerror = () => errors++;
                    });
                    
                    // 等待所有删除操作完成
                    transaction.oncomplete = () => {
                        resolve({ success: true, deleted, errors });
                    };
                    transaction.onerror = () => {
                        reject(transaction.error);
                    };
                };
                getAllRequest.onerror = () => {
                    reject(getAllRequest.error);
                };
            });
        } catch (error) {
            console.error('删除翻译失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 保存标注数据
     */
    async saveAnnotations(filePath, annotations) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['annotations'], 'readwrite');
            const store = transaction.objectStore('annotations');
            
            // 先删除该文件的旧标注
            const getAllRequest = store.getAll();
            return new Promise((resolve, reject) => {
                getAllRequest.onsuccess = async () => {
                    const allAnnotations = getAllRequest.result;
                    const toDelete = allAnnotations.filter(a => a.filePath === filePath);
                    
                    // 删除旧标注
                    for (const annotation of toDelete) {
                        await new Promise((res, rej) => {
                            const deleteRequest = store.delete(annotation.id);
                            deleteRequest.onsuccess = () => res();
                            deleteRequest.onerror = () => rej(deleteRequest.error);
                        });
                    }
                    
                    // 保存新标注
                    const annotationData = {
                        filePath: filePath,
                        annotations: annotations,
                        timestamp: Date.now()
                    };
                    
                    const addRequest = store.add(annotationData);
                    addRequest.onsuccess = () => {
                        resolve({ success: true, id: addRequest.result });
                    };
                    addRequest.onerror = () => {
                        reject(addRequest.error);
                    };
                };
                getAllRequest.onerror = () => {
                    reject(getAllRequest.error);
                };
            });
        } catch (error) {
            console.error('保存标注失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 加载标注数据
     */
    async loadAnnotations(filePath) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['annotations'], 'readonly');
            const store = transaction.objectStore('annotations');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const allAnnotations = request.result;
                    const fileAnnotations = allAnnotations.find(a => a.filePath === filePath);
                    
                    if (fileAnnotations) {
                        resolve({ 
                            success: true, 
                            data: fileAnnotations.annotations || [] 
                        });
                    } else {
                        resolve({ success: true, data: [] });
                    }
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('加载标注失败:', error);
            return { success: false, error: error.message, data: [] };
        }
    }
    
    /**
     * 保存生词
     */
    async saveVocabulary(word, translation, context) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['vocabulary'], 'readwrite');
            const store = transaction.objectStore('vocabulary');
            
            // 检查是否已存在
            const getAllRequest = store.getAll();
            return new Promise((resolve, reject) => {
                getAllRequest.onsuccess = () => {
                    const existing = getAllRequest.result.find(
                        v => v.word.toLowerCase() === word.toLowerCase()
                    );
                    
                    if (existing) {
                        // 更新现有记录
                        existing.translation = translation;
                        existing.context = context;
                        existing.lastReviewed = Date.now();
                        existing.reviewCount = (existing.reviewCount || 0) + 1;
                        
                        const updateRequest = store.put(existing);
                        updateRequest.onsuccess = () => {
                            resolve({ success: true, id: existing.id, updated: true });
                        };
                        updateRequest.onerror = () => reject(updateRequest.error);
                    } else {
                        // 添加新记录
                        const vocabularyData = {
                            word: word,
                            translation: translation,
                            context: context,
                            createdAt: Date.now(),
                            lastReviewed: Date.now(),
                            reviewCount: 0
                        };
                        
                        const addRequest = store.add(vocabularyData);
                        addRequest.onsuccess = () => {
                            resolve({ success: true, id: addRequest.result, updated: false });
                        };
                        addRequest.onerror = () => reject(addRequest.error);
                    }
                };
                getAllRequest.onerror = () => reject(getAllRequest.error);
            });
        } catch (error) {
            console.error('保存生词失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 获取所有生词
     */
    async getAllVocabulary() {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['vocabulary'], 'readonly');
            const store = transaction.objectStore('vocabulary');
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    resolve({ success: true, data: request.result });
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('获取生词失败:', error);
            return { success: false, error: error.message, data: [] };
        }
    }
    
    /**
     * 删除生词
     */
    async deleteVocabulary(wordId) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['vocabulary'], 'readwrite');
            const store = transaction.objectStore('vocabulary');
            
            return new Promise((resolve, reject) => {
                const request = store.delete(wordId);
                request.onsuccess = () => {
                    resolve({ success: true });
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('删除生词失败:', error);
            return { success: false, error: error.message };
        }
    }
}

// 创建全局实例
window.StorageAdapter = new StorageAdapter();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageAdapter;
}

