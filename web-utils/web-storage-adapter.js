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
     * 检查用户是否已登录
     */
    async isUserLoggedIn() {
        try {
            if (!window.supabaseClient) return false;
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            return session !== null;
        } catch (error) {
            console.warn('检查登录状态失败:', error);
            return false;
        }
    }

    /**
     * 获取当前用户ID
     */
    async getCurrentUserId() {
        try {
            if (!window.supabaseClient) return null;
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            return session?.user?.id || null;
        } catch (error) {
            console.warn('获取用户ID失败:', error);
            return null;
        }
    }

    /**
     * 获取用户档案（包含会员状态）
     */
    async getUserProfile() {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) return null;

            const { data, error } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.warn('获取用户档案失败:', error);
                return null;
            }
            return data;
        } catch (error) {
            console.warn('获取用户档案异常:', error);
            return null;
        }
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
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 1. 保存到本地 IndexedDB
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

            const localResult = await new Promise((resolve, reject) => {
                const request = store.add(translationData);
                request.onsuccess = () => {
                    resolve({ success: true, id: request.result });
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });

            // 2. 如果已登录，同步到云端
            if (isLoggedIn && userId) {
                try {
                    const { error } = await window.supabaseClient
                        .from('translations')
                        .insert({
                            user_id: userId,
                            file_path: filePath,
                            original_text: translationData.originalText,
                            translated_text: translationData.translatedText,
                            context: translationData.context || '',
                            updated_at: new Date().toISOString()
                        });

                    if (error) {
                        console.warn('云端翻译同步失败:', error);
                    } else {
                        console.log('✅ 翻译已同步到云端');
                    }
                } catch (cloudError) {
                    console.warn('云端翻译同步异常:', cloudError);
                }
            }

            return localResult;
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
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 1. 删除本地 IndexedDB 记录
            const db = await this.ensureDB();
            const transaction = db.transaction(['translations'], 'readwrite');
            const store = transaction.objectStore('translations');

            // 先获取所有记录
            const getAllRequest = store.getAll();
            const localResult = await new Promise((resolve, reject) => {
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

            // 2. 如果已登录，同步删除云端记录
            if (isLoggedIn && userId) {
                try {
                    const { error } = await window.supabaseClient
                        .from('translations')
                        .delete()
                        .eq('user_id', userId)
                        .eq('file_path', filePath);

                    if (error) {
                        console.warn('云端翻译删除失败:', error);
                    } else {
                        console.log('✅ 云端翻译已删除');
                    }
                } catch (cloudError) {
                    console.warn('云端翻译删除异常:', cloudError);
                }
            }

            return localResult;
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
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 1. 保存到本地 IndexedDB
            const db = await this.ensureDB();
            const transaction = db.transaction(['annotations'], 'readwrite');
            const store = transaction.objectStore('annotations');

            // 先删除该文件的旧标注
            const getAllRequest = store.getAll();
            const localResult = await new Promise((resolve, reject) => {
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

            // 2. 如果已登录，同步到云端
            if (isLoggedIn && userId) {
                try {
                    // 序列化标注数据
                    const annotationsJson = typeof annotations === 'string' ? annotations : JSON.stringify(annotations);

                    const { error } = await window.supabaseClient
                        .from('annotations')
                        .upsert({
                            user_id: userId,
                            file_path: filePath,
                            data: annotationsJson,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'user_id,file_path'
                        });

                    if (error) {
                        console.warn('云端标注同步失败:', error);
                    } else {
                        console.log('✅ 标注已同步到云端');
                    }
                } catch (cloudError) {
                    console.warn('云端标注同步异常:', cloudError);
                }
            }

            return localResult;
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
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 1. 尝试从云端加载（如果已登录）
            if (isLoggedIn && userId) {
                try {
                    const { data, error } = await window.supabaseClient
                        .from('annotations')
                        .select('data')
                        .eq('user_id', userId)
                        .eq('file_path', filePath)
                        .single();

                    if (!error && data) {
                        console.log('✅ 从云端加载标注成功');
                        let annotations = data.data;
                        // 确保是对象格式
                        if (typeof annotations === 'string') {
                            try {
                                annotations = JSON.parse(annotations);
                            } catch (e) {
                                console.warn('解析云端标注失败:', e);
                            }
                        }

                        // 异步更新本地缓存
                        this.saveAnnotations(filePath, annotations).catch(e => console.warn('更新本地标注缓存失败:', e));

                        return { success: true, data: annotations };
                    }
                } catch (cloudError) {
                    console.warn('从云端加载标注失败，尝试本地加载:', cloudError);
                }
            }

            // 2. 从本地 IndexedDB 加载
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
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 保存到本地 IndexedDB（作为缓存）
            const db = await this.ensureDB();
            const transaction = db.transaction(['vocabulary'], 'readwrite');
            const store = transaction.objectStore('vocabulary');

            // 检查是否已存在
            const getAllRequest = store.getAll();
            const localResult = await new Promise((resolve, reject) => {
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

            // 如果用户已登录，同步到云端
            if (isLoggedIn && userId) {
                try {
                    const { data, error } = await window.supabaseClient
                        .from('vocabulary')
                        .upsert({
                            user_id: userId,
                            word: word,
                            translation: translation,
                            context: context,
                            last_reviewed: new Date().toISOString()
                        }, {
                            onConflict: 'user_id,word'
                        });

                    if (error) {
                        console.warn('云端同步失败，已保存到本地:', error);
                    } else {
                        console.log('✅ 生词已同步到云端');
                    }
                } catch (cloudError) {
                    console.warn('云端同步失败，已保存到本地:', cloudError);
                }
            }

            return localResult;
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
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 如果用户已登录，优先从云端获取
            if (isLoggedIn && userId) {
                try {
                    const { data: cloudData, error } = await window.supabaseClient
                        .from('vocabulary')
                        .select('*')
                        .eq('user_id', userId);

                    if (!error && cloudData) {
                        console.log(`✅ 从云端获取了 ${cloudData.length} 个生词`);
                        // 将云端数据格式化为本地格式
                        const formattedData = cloudData.map(item => ({
                            word: item.word,
                            translation: item.translation,
                            context: item.context,
                            createdAt: new Date(item.created_at).getTime(),
                            lastReviewed: new Date(item.last_reviewed).getTime(),
                            reviewCount: 0
                        }));
                        return { success: true, data: formattedData };
                    }
                } catch (cloudError) {
                    console.warn('从云端获取失败，使用本地数据:', cloudError);
                }
            }

            // 从本地 IndexedDB 获取（作为备用或离线模式）
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
     * 删除生词 (支持单个ID或ID数组)
     */
    async deleteVocabulary(wordIds) {
        try {
            const isLoggedIn = await this.isUserLoggedIn();
            const userId = await this.getCurrentUserId();

            // 1. 删除本地 IndexedDB 记录
            const db = await this.ensureDB();
            const transaction = db.transaction(['vocabulary'], 'readwrite');
            const store = transaction.objectStore('vocabulary');

            const ids = Array.isArray(wordIds) ? wordIds : [wordIds];

            // 获取要删除的单词内容（用于云端删除）
            const wordsToDelete = [];
            if (isLoggedIn && userId) {
                for (const id of ids) {
                    // 尝试获取单词内容
                    // 注意：这里可能需要先 get 再 delete，或者假设云端也有同样的 ID（通常不成立，因为 ID 生成机制不同）
                    // 更好的方式是根据 word 内容删除，或者在本地存储中保存云端 ID
                    // 简化处理：先从本地获取单词内容
                    try {
                        const getRequest = store.get(typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id);
                        await new Promise((resolve) => {
                            getRequest.onsuccess = () => {
                                if (getRequest.result) {
                                    wordsToDelete.push(getRequest.result.word);
                                }
                                resolve();
                            };
                            getRequest.onerror = () => resolve();
                        });
                    } catch (e) {
                        console.warn('获取待删除单词失败:', e);
                    }
                }
            }

            const localResult = await new Promise((resolve, reject) => {
                let deletedCount = 0;
                let errorCount = 0;
                let completed = 0;

                if (ids.length === 0) {
                    resolve({ success: true, count: 0 });
                    return;
                }

                ids.forEach(id => {
                    // 确保ID类型匹配 (IndexedDB keyPath autoIncrement 生成的是数字)
                    // 如果传入的是字符串数字，尝试转换
                    let key = id;
                    if (typeof id === 'string' && /^\d+$/.test(id)) {
                        key = parseInt(id, 10);
                    }

                    const request = store.delete(key);
                    request.onsuccess = () => {
                        deletedCount++;
                        completed++;
                        if (completed === ids.length) {
                            resolve({ success: true, count: deletedCount });
                        }
                    };
                    request.onerror = () => {
                        errorCount++;
                        completed++;
                        if (completed === ids.length) {
                            if (deletedCount > 0) {
                                resolve({ success: true, count: deletedCount, errors: errorCount });
                            } else {
                                reject(request.error);
                            }
                        }
                    };
                });
            });

            // 2. 如果已登录，同步删除云端记录
            if (isLoggedIn && userId && wordsToDelete.length > 0) {
                try {
                    const { error } = await window.supabaseClient
                        .from('vocabulary')
                        .delete()
                        .eq('user_id', userId)
                        .in('word', wordsToDelete);

                    if (error) {
                        console.warn('云端生词删除失败:', error);
                    } else {
                        console.log(`✅ 云端已删除 ${wordsToDelete.length} 个生词`);
                    }
                } catch (cloudError) {
                    console.warn('云端生词删除异常:', cloudError);
                }
            }

            return localResult;
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

