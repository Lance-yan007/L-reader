const ipcRenderer = window.ipcRenderer;

class VocabularyApp {
    constructor() {
        this.translations = [];
        this.filteredTranslations = [];
        this.editMode = false;
        this.selectedIds = new Set();
        this.autoRefreshInterval = null;
        this.lastUpdateTime = 0;
        this.subscriptionHelper = null;
        this.currentUserId = null;
        this.subscriptionStatus = { planType: 'free', subscription: null };
        this.init();
    }

    init() {
        this.cacheDom();
        this.bindEvents();
        this.initSubscriptionHelper(); // 初始化订阅助手
        this.loadTranslations(true); // 首次加载时显示加载指示器
        this.startAutoRefresh();
    }

    /**
     * 初始化订阅助手
     */
    async initSubscriptionHelper() {
        try {
            // 检查是否有Supabase客户端
            if (typeof window !== 'undefined' && window.supabaseClient) {
                const SubscriptionHelper = window.SubscriptionHelper ||
                    (await import('../utils/subscription-helper.js')).default;

                if (SubscriptionHelper) {
                    this.subscriptionHelper = new SubscriptionHelper(window.supabaseClient);

                    // 获取当前用户ID
                    const { data: { user } } = await window.supabaseClient.auth.getUser();
                    if (user) {
                        this.currentUserId = user.id;
                        // 获取订阅状态
                        this.subscriptionStatus = await this.subscriptionHelper.getSubscriptionStatus(user.id);
                    }
                }
            }
        } catch (error) {
            console.error('初始化订阅助手失败:', error);
        }
    }

    cacheDom() {
        this.loadingState = document.getElementById('loadingState');
        this.emptyState = document.getElementById('emptyState');
        this.vocabularyList = document.getElementById('vocabularyList');
        this.editBtn = document.getElementById('editBtn');
        this.editToolbar = document.getElementById('editToolbar');
        this.normalToolbar = document.getElementById('normalToolbar');
        this.selectAllBtn = document.getElementById('selectAllBtn');
        this.deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        this.cancelEditBtn = document.getElementById('cancelEditBtn');
    }

    bindEvents() {
        if (this.editBtn) {
            this.editBtn.addEventListener('click', () => {
                this.enterEditMode();
            });
        }
        if (this.cancelEditBtn) {
            this.cancelEditBtn.addEventListener('click', () => {
                this.exitEditMode();
            });
        }
        if (this.selectAllBtn) {
            this.selectAllBtn.addEventListener('click', () => {
                this.toggleSelectAll();
            });
        }
        if (this.deleteSelectedBtn) {
            this.deleteSelectedBtn.addEventListener('click', () => {
                this.deleteSelected();
            });
        }

        // 监听页面可见性变化，当页面变为可见时自动刷新
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.loadTranslations();
            }
        });

        // 监听窗口焦点变化
        window.addEventListener('focus', () => {
            this.loadTranslations();
        });
    }

    startAutoRefresh() {
        // 每5秒自动刷新一次（仅在页面可见时）
        this.autoRefreshInterval = setInterval(() => {
            if (!document.hidden && !this.editMode) {
                this.loadTranslations();
            }
        }, 5000);
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    async loadTranslations(showLoadingIndicator = false) {
        try {
            // 只在首次加载或手动刷新时显示加载指示器
            if (showLoadingIndicator) {
                this.showLoading();
            }

            const result = await ipcRenderer.invoke('get-vocabulary');

            if (result.success) {
                const newTranslations = result.data || [];

                // 检查是否有新数据（比较时间戳）
                const hasNewData = this.checkForNewTranslations(newTranslations);

                // 规范化数据结构
                this.translations = newTranslations.map(item => ({
                    ...item,
                    originalText: item.originalText || item.word,
                    translatedText: item.translatedText || item.translation,
                    timestamp: item.timestamp || item.createdAt || item.lastReviewed
                }));
                this.filteredTranslations = this.translations;

                // 去重：如果同一个单词有多个翻译，只保留最新的
                this.filteredTranslations = this.deduplicateTranslations(this.filteredTranslations);

                // 如果有新数据或首次加载，重新渲染列表
                if (hasNewData || showLoadingIndicator) {
                    this.renderVocabularyList();
                    // 更新订阅状态显示（如果有）
                    this.updateSubscriptionDisplay();
                }

                this.lastUpdateTime = Date.now();
            } else {
                if (showLoadingIndicator) {
                    this.showError('加载翻译失败: ' + result.error);
                }
            }
        } catch (error) {
            console.error('加载翻译失败:', error);
            if (showLoadingIndicator) {
                this.showError('加载翻译失败: ' + error.message);
            }
        }
    }

    checkForNewTranslations(newTranslations) {
        if (this.translations.length === 0) {
            return true; // 首次加载
        }

        // 检查是否有新的翻译记录（通过比较数量或时间戳）
        if (newTranslations.length !== this.translations.length) {
            return true;
        }

        // 检查是否有更新的翻译（比较最新记录的时间戳）
        const newLatest = newTranslations[0]?.timestamp || newTranslations[0]?.id || 0;
        const currentLatest = this.translations[0]?.timestamp || this.translations[0]?.id || 0;

        return newLatest > currentLatest;
    }

    /**
     * 去重翻译记录
     * 如果同一个单词（不区分大小写）有多个翻译，只保留最新的
     */
    deduplicateTranslations(translations) {
        const wordMap = new Map();

        translations.forEach(translation => {
            const word = (translation.originalText || '').toLowerCase().trim();
            if (!word) return;

            // 如果这个单词还没有记录，或者当前记录更新，则更新
            if (!wordMap.has(word)) {
                wordMap.set(word, translation);
            } else {
                const existing = wordMap.get(word);
                const existingTime = new Date(existing.timestamp || existing.id || 0).getTime();
                const currentTime = new Date(translation.timestamp || translation.id || 0).getTime();

                if (currentTime > existingTime) {
                    wordMap.set(word, translation);
                }
            }
        });

        return Array.from(wordMap.values());
    }

    renderVocabularyList() {
        if (this.filteredTranslations.length === 0) {
            this.showEmpty();
            return;
        }

        this.hideLoading();
        this.hideEmpty();
        this.vocabularyList.style.display = 'block';
        this.vocabularyList.innerHTML = '';

        this.filteredTranslations.forEach((translation, index) => {
            const card = this.createVocabularyCard(translation);
            this.vocabularyList.appendChild(card);
        });

        // 绑定复选框事件
        this.bindCheckboxEvents();

        // 更新编辑模式显示
        if (this.editMode) {
            this.updateEditModeDisplay();
        }
    }

    bindCheckboxEvents() {
        const checkboxes = this.vocabularyList.querySelectorAll('.vocabulary-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const translationId = e.target.dataset.translationId;
                if (e.target.checked) {
                    this.selectedIds.add(translationId);
                } else {
                    this.selectedIds.delete(translationId);
                }
                this.updateDeleteButtonState();
            });
        });
    }

    createVocabularyCard(translation) {
        const card = document.createElement('div');
        card.className = 'vocabulary-card';
        card.dataset.translationId = translation.id || translation.timestamp;

        const word = translation.originalText || '未知单词';
        const translationText = translation.translatedText || '暂无翻译';
        const timestamp = translation.timestamp || translation.id;
        const date = this.formatDate(timestamp);
        const translationId = translation.id || translation.timestamp;

        card.innerHTML = `
            <div class="vocabulary-card-checkbox" style="display: none;">
                <input type="checkbox" class="vocabulary-checkbox" data-translation-id="${translationId}">
            </div>
            <div class="vocabulary-card-content">
                <div class="vocabulary-word">${this.escapeHtml(word)}</div>
                <div class="vocabulary-card-separator"></div>
                <div class="vocabulary-translation">${this.escapeHtml(translationText)}</div>
                <div class="vocabulary-card-date">${date}</div>
            </div>
        `;

        return card;
    }

    formatDate(timestamp) {
        if (!timestamp) return '';

        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return '今天';
            } else if (diffDays === 1) {
                return '昨天';
            } else if (diffDays < 7) {
                return `${diffDays}天前`;
            } else {
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const year = date.getFullYear();
                return `${year}-${month}-${day}`;
            }
        } catch (error) {
            return '';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading() {
        if (this.loadingState) {
            this.loadingState.style.display = 'flex';
        }
        if (this.emptyState) {
            this.emptyState.style.display = 'none';
        }
        if (this.vocabularyList) {
            this.vocabularyList.style.display = 'none';
        }
    }

    hideLoading() {
        if (this.loadingState) {
            this.loadingState.style.display = 'none';
        }
    }

    showEmpty() {
        if (this.loadingState) {
            this.loadingState.style.display = 'none';
        }
        if (this.emptyState) {
            this.emptyState.style.display = 'flex';
        }
        if (this.vocabularyList) {
            this.vocabularyList.style.display = 'none';
        }
    }

    hideEmpty() {
        if (this.emptyState) {
            this.emptyState.style.display = 'none';
        }
    }

    showError(message) {
        console.error(message);
        this.showEmpty();
        if (this.emptyState) {
            const p = this.emptyState.querySelector('p');
            if (p) {
                p.textContent = message;
            }
        }
    }

    enterEditMode() {
        this.editMode = true;
        this.selectedIds.clear();
        this.updateEditModeDisplay();
    }

    exitEditMode() {
        this.editMode = false;
        this.selectedIds.clear();
        this.updateEditModeDisplay();

        // 取消所有复选框选中
        const checkboxes = this.vocabularyList.querySelectorAll('.vocabulary-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    updateEditModeDisplay() {
        const cards = this.vocabularyList.querySelectorAll('.vocabulary-card');
        const checkboxes = this.vocabularyList.querySelectorAll('.vocabulary-card-checkbox');

        if (this.editMode) {
            // 显示编辑工具栏
            if (this.editToolbar) {
                this.editToolbar.style.display = 'flex';
            }
            if (this.normalToolbar) {
                this.normalToolbar.style.display = 'none';
            }
            // 显示复选框
            checkboxes.forEach(checkbox => {
                checkbox.style.display = 'block';
            });
            // 添加编辑模式样式
            cards.forEach(card => {
                card.classList.add('edit-mode');
            });
        } else {
            // 隐藏编辑工具栏
            if (this.editToolbar) {
                this.editToolbar.style.display = 'none';
            }
            if (this.normalToolbar) {
                this.normalToolbar.style.display = 'flex';
            }
            // 隐藏复选框
            checkboxes.forEach(checkbox => {
                checkbox.style.display = 'none';
            });
            // 移除编辑模式样式
            cards.forEach(card => {
                card.classList.remove('edit-mode');
            });
        }
        this.updateDeleteButtonState();
    }

    toggleSelectAll() {
        const checkboxes = this.vocabularyList.querySelectorAll('.vocabulary-checkbox');
        const allSelected = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(checkbox => {
            checkbox.checked = !allSelected;
            const translationId = checkbox.dataset.translationId;
            if (!allSelected) {
                this.selectedIds.add(translationId);
            } else {
                this.selectedIds.delete(translationId);
            }
        });

        this.updateDeleteButtonState();
    }

    updateDeleteButtonState() {
        if (this.deleteSelectedBtn) {
            const hasSelection = this.selectedIds.size > 0;
            this.deleteSelectedBtn.disabled = !hasSelection;
            this.deleteSelectedBtn.classList.toggle('disabled', !hasSelection);
        }
    }

    async deleteSelected() {
        if (this.selectedIds.size === 0) {
            return;
        }

        if (!confirm(`确定要删除选中的 ${this.selectedIds.size} 个单词吗？`)) {
            return;
        }

        try {
            // 调用IPC删除翻译
            const result = await ipcRenderer.invoke('delete-translations', Array.from(this.selectedIds));

            if (result.success) {
                // 从列表中移除已删除的翻译
                this.filteredTranslations = this.filteredTranslations.filter(
                    t => !this.selectedIds.has(String(t.id || t.timestamp))
                );
                this.translations = this.translations.filter(
                    t => !this.selectedIds.has(String(t.id || t.timestamp))
                );

                this.selectedIds.clear();
                this.renderVocabularyList();
                this.exitEditMode();
            } else {
                alert('删除失败: ' + result.error);
            }
        } catch (error) {
            console.error('删除翻译失败:', error);
            alert('删除失败: ' + error.message);
        }
    }

    /**
     * 更新订阅状态显示
     */
    async updateSubscriptionDisplay() {
        try {
            if (!this.subscriptionHelper || !this.currentUserId) return;

            // 重新获取订阅状态
            this.subscriptionStatus = await this.subscriptionHelper.getSubscriptionStatus(this.currentUserId);

            // 获取生词本总数
            const vocabularyCount = this.translations.length;
            const limits = SubscriptionHelper.LIMITS[this.subscriptionStatus.planType] || SubscriptionHelper.LIMITS.free;
            const limit = limits.vocabulary;

            // 在页面上显示生词本使用情况
            const header = document.getElementById('vocabularyTitle') || document.querySelector('.vocabulary-header h1');
            if (header) {
                if (limit === Infinity) {
                    header.textContent = `生词本 (${vocabularyCount})`;
                    header.style.color = '';
                } else {
                    header.textContent = `生词本 (${vocabularyCount}/${limit})`;

                    // 如果接近上限，添加警告样式
                    const percentage = (vocabularyCount / limit) * 100;
                    if (percentage >= 90) {
                        header.style.color = '#ff3b30';
                    } else if (percentage >= 70) {
                        header.style.color = '#ff9500';
                    } else {
                        header.style.color = '';
                    }
                }
            }

            // 如果达到上限，显示提示
            if (limit !== Infinity && vocabularyCount >= limit) {
                this.showVocabularyLimitWarning();
            }
        } catch (error) {
            console.error('更新订阅显示失败:', error);
        }
    }

    /**
     * 显示生词本上限警告
     */
    showVocabularyLimitWarning() {
        // 检查是否已经显示过警告
        if (document.getElementById('vocabularyLimitWarning')) {
            return;
        }

        const warningDiv = document.createElement('div');
        warningDiv.id = 'vocabularyLimitWarning';
        warningDiv.className = 'vocabulary-limit-warning';
        warningDiv.innerHTML = `
            <div class="warning-content">
                <div class="warning-icon">⚠️</div>
                <div class="warning-message">
                    生词本已达到上限。升级订阅可享受更多容量。
                </div>
                <button class="warning-button" id="upgradeFromVocabularyBtn">升级订阅</button>
                <button class="warning-close" id="closeVocabularyWarning">&times;</button>
            </div>
        `;

        const main = document.querySelector('.vocabulary-content');
        if (main) {
            main.insertBefore(warningDiv, main.firstChild);
        }

        // 绑定事件
        const upgradeBtn = warningDiv.querySelector('#upgradeFromVocabularyBtn');
        const closeBtn = warningDiv.querySelector('#closeVocabularyWarning');

        upgradeBtn.addEventListener('click', () => {
            // 打开个人中心订阅页面
            if (typeof window !== 'undefined' && window.electron && window.electron.invoke) {
                window.electron.invoke('open-profile-page').catch(err => {
                    console.error('打开个人中心失败:', err);
                    // 降级方案：尝试直接跳转
                    if (typeof window !== 'undefined') {
                        window.location.href = 'profile.html';
                    }
                });
            } else if (typeof ipcRenderer !== 'undefined') {
                // 兼容旧版本（如果直接使用 ipcRenderer）
                ipcRenderer.invoke('open-profile-page').catch(err => {
                    console.error('打开个人中心失败:', err);
                });
            } else {
                // 降级方案：直接跳转
                if (typeof window !== 'undefined') {
                    window.location.href = 'profile.html';
                }
            }
        });

        closeBtn.addEventListener('click', () => {
            warningDiv.remove();
        });
    }
}

// 订阅限制配置（与 subscription-helper.js 保持一致）
VocabularyApp.LIMITS = {
    free: {
        vocabulary: 100
    },
    monthly: {
        vocabulary: 500
    },
    yearly: {
        vocabulary: Infinity
    }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new VocabularyApp();
});

