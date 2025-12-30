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
                        this.updateUsageStats('word_translations');
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
     * 更新使用统计
     * @param {string} type - 'word_translations' | 'ai_chat_count' | 'vocabulary_count'
     */
    async updateUsageStats(type) {
        try {
            const userId = await this.getCurrentUserId();
            if (!userId) return;

            const date = new Date().toISOString().split('T')[0];

            // 1. 获取今日统计
            const { data: stats, error: fetchError } = await window.supabaseClient
                .from('usage_stats')
                .select('*')
                .eq('user_id', userId)
                .eq('date', date)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
                console.warn('获取今日统计失败:', fetchError);
                return;
            }

            // 2. 更新或插入
            const currentVal = stats ? (stats[type] || 0) : 0;
            const updates = {
                user_id: userId,
                date: date,
                updated_at: new Date().toISOString()
            };
            updates[type] = currentVal + 1;

            // 如果没有记录，初始化其他字段
            if (!stats) {
                if (type !== 'word_translations') updates.word_translations = 0;
                if (type !== 'ai_chat_count') updates.ai_chat_count = 0;
                if (type !== 'vocabulary_count') updates.vocabulary_count = 0;
            }

            const { error: upsertError } = await window.supabaseClient
                .from('usage_stats')
                .upsert(updates, { onConflict: 'user_id,date' });

            if (upsertError) {
                console.warn('更新统计失败:', upsertError);
            }
        } catch (e) {
            console.warn('更新使用统计异常:', e);
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
                        // 如果是新添加的词，更新统计
                        if (!localResult.updated) {
                            this.updateUsageStats('vocabulary_count');
                        }
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

    async getVocabularyForReview() {
        const userId = await this.getCurrentUserId();
        if (!userId) return [];
        try {
            const { data } = await window.supabaseClient
                .from('vocabulary_progress')
                .select('*')
                .eq('user_id', userId)
                .lte('next_review', new Date().toISOString())
                .lt('proficiency_level', 5);
            return data || [];
        } catch (e) { return []; }
    }

    async getNewVocabulary() {
        const userId = await this.getCurrentUserId();
        if (!userId) return [];
        try {
            const { data: all } = await window.supabaseClient.from('vocabulary').select('*').eq('user_id', userId);
            const { data: studied } = await window.supabaseClient.from('vocabulary_progress').select('word').eq('user_id', userId);
            const studiedSet = new Set((studied || []).map(w => w.word));
            return (all || []).filter(v => !studiedSet.has(v.word));
        } catch (e) { return []; }
    }

    async updateVocabularyProgress(data) {
        const userId = await this.getCurrentUserId();
        if (!userId) return { success: false };
        try {
            await window.supabaseClient.from('vocabulary_progress').upsert({
                user_id: userId, word: data.word, proficiency_level: data.proficiency_level,
                review_count: data.review_count, last_reviewed: new Date().toISOString(),
                next_review: data.next_review, ease_factor: data.ease_factor,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,word' });
            return { success: true };
        } catch (e) { return { success: false }; }
    }

    async getStudySessions(days = 90) {
        const userId = await this.getCurrentUserId();
        if (!userId) return [];
        try {
            const start = new Date();
            start.setDate(start.getDate() - days);
            const { data } = await window.supabaseClient.from('study_sessions').select('*')
                .eq('user_id', userId).gte('study_date', start.toISOString().split('T')[0]);
            return data || [];
        } catch (e) { return []; }
    }

    async recordStudySession(data) {
        const userId = await this.getCurrentUserId();
        if (!userId) return { success: false };
        try {
            await window.supabaseClient.from('study_sessions').upsert({
                user_id: userId, study_date: new Date().toISOString().split('T')[0],
                words_studied: data.words_studied, words_reviewed: data.words_reviewed,
                accuracy_rate: data.accuracy_rate, study_duration: data.study_duration
            }, { onConflict: 'user_id,study_date' });
            return { success: true };
        } catch (e) { return { success: false }; }
    }

    // --- User Settings & Daily Progress ---

    async getUserSettings() {
        const defaultSettings = {
            dailyReviewGoal: 50,
            lastStudyDate: null
        };
        const stored = localStorage.getItem('user_settings');
        return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    }

    async saveUserSettings(settings) {
        const current = await this.getUserSettings();
        const updated = { ...current, ...settings };
        localStorage.setItem('user_settings', JSON.stringify(updated));
        return updated;
    }

    async getDailyProgress() {
        const today = new Date().toISOString().split('T')[0];
        const stored = localStorage.getItem('daily_study_progress');
        let progress = stored ? JSON.parse(stored) : { date: today, count: 0 };

        // Reset if date changed
        if (progress.date !== today) {
            progress = { date: today, count: 0 };
            localStorage.setItem('daily_study_progress', JSON.stringify(progress));
        }

        return progress;
    }

    async updateDailyProgress(increment = 1) {
        const progress = await this.getDailyProgress();
        progress.count += increment;
        localStorage.setItem('daily_study_progress', JSON.stringify(progress));
        return progress;
    }

    async updateVocabulary(wordObj) {
        try {
            const db = await this.ensureDB();
            const transaction = db.transaction(['vocabulary'], 'readwrite');
            const store = transaction.objectStore('vocabulary');

            // Ensure SM-2 fields are preserved/updated
            const updatedWord = {
                ...wordObj,
                lastReviewed: Date.now(),
                // Ensure these exist if not present
                nextReview: wordObj.nextReview || Date.now(),
                interval: wordObj.interval || 0,
                repetitions: wordObj.repetitions || 0,
                easeFactor: wordObj.easeFactor || 2.5
            };

            store.put(updatedWord);
            return { success: true };
        } catch (error) {
            console.error('Failed to update vocabulary:', error);
            return { success: false, error: error.message };
        }
    }
}


// 创建全局实例
window.StorageAdapter = new StorageAdapter();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageAdapter;
}
