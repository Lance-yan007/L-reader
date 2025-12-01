const { ipcRenderer } = require('electron');
const path = require('path');

// Web版本：完全移除Supabase/Auth相关逻辑
const authHelper = null;

class MainApp {
    constructor() {
        this.recentFiles = [];
        this.pdfLib = null;
        this.activeView = 'home';
        this.homeView = null;
        this.vocabularyView = null;
        this.profileView = null;
        this.documentPanels = null;
        this.currentRenamingCard = null;
        this.currentRenamingInput = null;
        this.handleWindowResize = this.handleWindowResize.bind(this);
        this.init();
    }

    async init() {
        console.log('MainApp initializing...');
        this.cacheDom();
        await this.loadPDFJS();
        this.bindEvents();
        this.loadRecentFiles();
        this.setupWindowStateListener();
        this.checkSubscriptionStatus();
        this.checkPaymentStatus();
        await this.initDailyGoal();
    }

    checkPaymentStatus() {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');

        if (status === 'success') {
            // 显示成功消息
            setTimeout(() => {
                alert('支付成功！感谢您的支持，会员权益已生效。');
            }, 500);

            // 刷新订阅状态
            this.checkSubscriptionStatus();

            // 清除 URL 参数
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, newUrl);
        }
    }

    async checkSubscriptionStatus() {
        try {
            // 仅在Web环境下检查
            if (window.StorageAdapter && window.StorageAdapter.getUserProfile) {
                const profile = await window.StorageAdapter.getUserProfile();
                const badge = document.getElementById('subscriptionBadge');

                if (badge) {
                    badge.style.display = 'inline-block';
                    if (profile && profile.subscription_tier === 'pro') {
                        badge.textContent = 'PRO';
                        badge.className = 'subscription-badge pro';
                    } else {
                        badge.textContent = 'FREE';
                        badge.className = 'subscription-badge free';
                    }
                }
            }
        } catch (error) {
            console.warn('检查订阅状态失败:', error);
        }
    }

    async loadPDFJS() {
        try {
            // 优先使用适配器加载
            if (window.PDFJSAdapter) {
                this.pdfLib = await window.PDFJSAdapter.load();
                console.log('PDF.js loaded via adapter');
            } else if (window.pdfjsLib) {
                this.pdfLib = window.pdfjsLib;
                console.log('PDF.js found in window');
            } else {
                // Fallback for Electron environment
                this.pdfLib = require('pdfjs-dist');
                this.pdfLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.js';
                console.log('PDF.js loaded via require');
            }
        } catch (error) {
            console.error('加载PDF.js失败:', error);
        }
    }

    cacheDom() {
        // this.tabStrip = document.getElementById('tabStrip');
        // this.tabAddButton = document.getElementById('tabAddButton');
        this.homeView = document.getElementById('homeView');
        this.vocabularyView = document.getElementById('vocabularyView');
        this.studyView = document.getElementById('studyView');
        this.profileView = document.getElementById('profileView');
        this.documentPanels = document.getElementById('documentPanels');
    }

    switchView(viewName) {
        this.activeView = viewName;

        // Hide all views first
        if (this.homeView) {
            this.homeView.classList.remove('is-active');
            this.homeView.style.display = 'none';
        }
        if (this.vocabularyView) {
            this.vocabularyView.classList.remove('is-active');
            this.vocabularyView.style.display = 'none';
        }
        if (this.studyView) {
            this.studyView.classList.remove('is-active');
            this.studyView.style.display = 'none';
        }
        if (this.profileView) {
            this.profileView.classList.remove('is-active');
            this.profileView.style.display = 'none';
        }
        if (this.documentPanels) {
            const panels = this.documentPanels.querySelectorAll('.document-panel');
            panels.forEach(panel => {
                panel.classList.remove('is-active');
                panel.style.display = 'none';
            });
        }

        // Show requested view
        if (viewName === 'home') {
            if (this.homeView) {
                this.homeView.classList.add('is-active');
                this.homeView.style.display = 'flex';
            }
            this.updateNavActiveState('home');
        } else if (viewName === 'vocabulary') {
            if (this.vocabularyView) {
                this.vocabularyView.classList.add('is-active');
                this.vocabularyView.style.display = 'flex';
            }
            this.updateNavActiveState('vocabulary');
        } else if (viewName === 'study') {
            if (this.studyView) {
                this.studyView.classList.add('is-active');
                this.studyView.style.display = 'block';
                this.updateStudyDashboard();
            }
            this.updateNavActiveState('study');
        } else if (viewName === 'profile') {
            if (this.profileView) {
                this.profileView.classList.add('is-active');
                this.profileView.style.display = 'flex';
            }
            this.updateNavActiveState('profile');
        }
    }

    openDocumentTab(filePath) {
        if (!filePath || !this.documentPanels) {
            return;
        }

        // In web version, file paths from WebFSAdapter are already in correct format
        const normalizedPath = filePath;

        // Hide other views
        this.switchView('document');

        // Check if panel already exists (simplified logic for web version)
        // For now, we just create a new one or reuse if we had a map. 
        // Since we removed tabLookupByPath, let's just create a new one for simplicity 
        // or clear existing ones if we want single document mode.
        // Let's clear existing for single doc mode in web version for now to keep it simple.
        this.documentPanels.innerHTML = '';

        // 直接导航到阅读器页面，使用web-loader的路由系统
        console.log('[Main] Navigating to reader for file:', normalizedPath);

        // 存储文件路径到sessionStorage（web-loader期望的key）
        sessionStorage.setItem('currentFile', normalizedPath);

        // 使用hash路由导航到阅读器
        window.location.hash = '#reader';

        // Update nav state to show no active sidebar item
        this.updateNavActiveState(null);
    }

    bindEvents() {
        const openFileBtn = document.getElementById('openFileBtn');
        if (openFileBtn) {
            openFileBtn.addEventListener('click', () => {
                this.openFile();
            });
        }

        const openFolderBtn = document.getElementById('openFolderBtn');
        if (openFolderBtn) {
            openFolderBtn.addEventListener('click', () => {
                this.openFolder();
            });
        }

        const homeNavBtn = document.getElementById('homeNavBtn');
        if (homeNavBtn) {
            homeNavBtn.addEventListener('click', () => {
                this.switchView('home');
                if (this.recentFiles.length > 0) {
                    this.showFilesView();
                    this.renderRecentFiles();
                } else {
                    this.showWelcomeView();
                }
            });
        }

        const vocabularyNavBtn = document.getElementById('vocabularyNavBtn');
        if (vocabularyNavBtn) {
            vocabularyNavBtn.addEventListener('click', () => {
                this.switchView('vocabulary');
            });
        }

        const studyNavBtn = document.getElementById('studyNavBtn');
        if (studyNavBtn) {
            studyNavBtn.addEventListener('click', () => {
                this.switchView('study');
            });
        }

        // 个人中心按钮
        const profileNavBtn = document.getElementById('profileNavBtn');
        if (profileNavBtn) {
            profileNavBtn.addEventListener('click', () => {
                this.switchView('profile');
            });
        }

        // 个人中心操作按钮
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        const changeEmailBtn = document.getElementById('changeEmailBtn');
        const deleteAccountBtn = document.getElementById('deleteAccountBtn');

        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => {
                alert('修改密码功能开发中...');
            });
        }

        if (changeEmailBtn) {
            changeEmailBtn.addEventListener('click', () => {
                alert('修改邮箱功能开发中...');
            });
        }

        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => {
                this.handleDeleteAccount();
            });
        }

        // if (this.tabStrip) {
        //     this.tabStrip.addEventListener('wheel', (event) => {
        //         if (event.deltaY !== 0) {
        //             event.preventDefault();
        //             this.tabStrip.scrollBy({ left: event.deltaY, behavior: 'auto' });
        //         }
        //     }, { passive: false });
        // }

        ipcRenderer.on('open-document-tab', (_event, filePath) => {
            if (filePath) {
                this.handleFileOpened(filePath);
            }
        });

        // 点击外部关闭所有文件卡片菜单和取消重命名
        document.addEventListener('click', (e) => {
            // Event delegation for Start Focus Mode button
            if (e.target.closest('.start-btn')) {
                if (window.webApp) {
                    window.webApp.navigate('study-card');
                } else {
                    window.location.hash = '#/study-card';
                }
            }

            if (!e.target.closest('.file-card')) {
                this.closeAllFileCardMenus();

                // 如果正在重命名，取消重命名
                if (this.currentRenamingCard && this.currentRenamingInput) {
                    const nameCard = this.currentRenamingCard.querySelector('.file-name-card');
                    const currentName = nameCard ? nameCard.textContent : '';
                    this.cancelRenameFile(this.currentRenamingCard, nameCard, this.currentRenamingInput, currentName);
                }
            }
        });

        this.initSidebarInteractions();

        // Listen for messages from reader iframe
        window.addEventListener('message', (event) => {
            if (event.data && event.data.channel === 'close-document') {
                console.log('[Main] Received close-document signal');
                this.switchView('home');
                if (this.recentFiles.length > 0) {
                    this.showFilesView();
                    this.renderRecentFiles();
                } else {
                    this.showWelcomeView();
                }
            }
        });
    }

    initSidebarInteractions() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            return;
        }

        const collapseBtn = document.getElementById('collapseSidebarBtn');
        const updateSidebarState = () => {
            const isCollapsed = document.body.classList.contains('sidebar-collapsed');
            if (collapseBtn) {
                collapseBtn.classList.toggle('is-collapsed', isCollapsed);
                collapseBtn.setAttribute('aria-pressed', String(isCollapsed));
            }
            if (!isCollapsed) {
                document.body.classList.remove('sidebar-hovering');
            }
        };

        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                const willCollapse = !document.body.classList.contains('sidebar-collapsed');
                if (willCollapse) {
                    document.body.classList.add('sidebar-collapsed');
                    document.body.classList.remove('sidebar-hovering');
                } else {
                    document.body.classList.remove('sidebar-collapsed');
                    document.body.classList.remove('sidebar-hovering');
                }
                updateSidebarState();
            });
        }

        const hoverZone = document.getElementById('sidebarHoverZone');

        const enableHoverState = () => {
            if (document.body.classList.contains('sidebar-collapsed')) {
                document.body.classList.add('sidebar-hovering');
            }
        };

        const disableHoverState = () => {
            if (document.body.classList.contains('sidebar-collapsed')) {
                document.body.classList.remove('sidebar-hovering');
            }
        };

        if (hoverZone) {
            hoverZone.addEventListener('mouseenter', enableHoverState);
            hoverZone.addEventListener('mouseleave', disableHoverState);
        }

        sidebar.addEventListener('mouseenter', enableHoverState);
        sidebar.addEventListener('mouseleave', disableHoverState);

        updateSidebarState();
    }

    setupWindowStateListener() {
        window.addEventListener('resize', this.handleWindowResize);
        this.handleWindowResize();

        ipcRenderer.on('window-state-changed', (_event, state) => {
            if (state && typeof state.maximized === 'boolean') {
                this.applyWindowMaximizedState(state.maximized);
            }
        });
    }

    handleWindowResize() {
        const tolerance = 12;
        const isWidthMax = window.outerWidth >= (window.screen.availWidth - tolerance);
        const isHeightMax = window.outerHeight >= (window.screen.availHeight - tolerance);
        const isMaximized = isWidthMax && isHeightMax;
        this.applyWindowMaximizedState(isMaximized);
    }

    applyWindowMaximizedState(isMaximized) {
        document.body.classList.toggle('window-maximized', isMaximized);
        if (!isMaximized) {
            document.body.classList.remove('sidebar-hovering');
        }
    }

    showWelcomeView() {
        document.getElementById('welcomeSection').style.display = 'flex';
        document.getElementById('filesView').style.display = 'none';
    }

    showFilesView() {
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('filesView').style.display = 'flex';
    }



    showProfileView() {
        // 隐藏home view
        if (this.homeView) {
            this.homeView.classList.remove('is-active');
            this.homeView.style.display = 'none';
        }
        // 隐藏vocabulary view
        if (this.vocabularyView) {
            this.vocabularyView.classList.remove('is-active');
            this.vocabularyView.style.display = 'none';
        }
        // 隐藏所有文档面板
        if (this.documentPanels) {
            const panels = this.documentPanels.querySelectorAll('.document-panel');
            panels.forEach(panel => {
                panel.classList.remove('is-active');
                panel.style.display = 'none';
            });
        }
        // 显示profile view
        if (this.profileView) {
            this.profileView.classList.add('is-active');
            this.profileView.style.display = 'flex';
        }
        // 不要调用 setActiveTab，因为那会重新显示 home view
        // 只更新导航状态
        this.updateNavActiveState('profile');
    }

    async updateStudyDashboard() {
        if (!window.StorageAdapter) return;

        try {
            // Fetch real vocabulary data
            const allWords = await window.StorageAdapter.getVocabularyList();

            // Calculate Stats
            const stats = {
                todayFocus: 0,
                mastered: 0,
                streak: 0, // Need to implement streak logic in StorageAdapter later
                bookSource: 0
            };

            // Calculate Mastered (proficiency >= 4)
            // Assuming vocabulary structure has proficiency or similar
            // For now, let's assume we can get this from progress table if available, 
            // or just count words that have been reviewed many times.
            // Since we don't have full progress data in simple list, we might need to fetch progress.
            // For MVP, let's count total words as "Mastered" candidate if we don't have proficiency yet.
            // Actually, let's just show total words for now as "已收录" if mastered is 0
            stats.mastered = allWords.length;

            // Calculate Book Sources
            const sources = new Set(allWords.map(w => w.source).filter(s => s));
            stats.bookSource = sources.size;

            // Calculate Today's Focus (Mock logic for now until we have full SM-2 schedule)
            // In a real SM-2 system, we'd query words with nextReview <= today
            // For now, let's say 10% of total words are due, plus 5 new words
            stats.todayFocus = Math.ceil(allWords.length * 0.1) + 5;
            if (stats.todayFocus > allWords.length) stats.todayFocus = allWords.length;
            if (stats.todayFocus === 0 && allWords.length > 0) stats.todayFocus = 1; // Always show something if we have words

            // Update numbers
            const focusEl = document.getElementById('todayFocusCount');
            if (focusEl) focusEl.textContent = stats.todayFocus;

            const masteredEl = document.getElementById('masteredCount');
            if (masteredEl) masteredEl.textContent = stats.mastered;

            const streakEl = document.getElementById('streakDays');
            if (streakEl) streakEl.textContent = stats.streak;

            const sourceEl = document.getElementById('bookSourceCount');
            if (sourceEl) sourceEl.textContent = stats.bookSource;

            // Animate Progress Ring
            const circle = document.getElementById('focusRingProgress');
            if (circle) {
                const radius = circle.r.baseVal.value;
                const circumference = radius * 2 * Math.PI;
                // Calculate percentage based on completed/total for today (mocked as 0 completed for now)
                const percent = 0;
                const offset = circumference - (percent / 100) * circumference;

                circle.style.strokeDasharray = `${circumference} ${circumference}`;
                circle.style.strokeDashoffset = offset;

                // Animate to target (e.g. if we had progress)
                // setTimeout(() => circle.style.strokeDashoffset = targetOffset, 100);
            }

            // Populate "Recent Added"
            const recentListEl = document.getElementById('recentWordsList');
            if (recentListEl && allWords.length > 0) {
                // Sort by id (assuming auto-increment or timestamp) descending
                // Or just take the last ones if array is chronological
                const recentWords = [...allWords].reverse().slice(0, 3);

                recentListEl.innerHTML = recentWords.map(word => `
                    <div class="list-item">
                        <span class="word-text">${word.word}</span>
                        <span class="word-source">${word.source || '未知来源'}</span>
                    </div>
                `).join('');
            } else if (recentListEl) {
                recentListEl.innerHTML = '<div class="list-item" style="color:#999; justify-content:center;">暂无生词</div>';
            }

            // Populate "At Risk" (Mock for now, random words)
            const riskListEl = document.getElementById('riskWordsList');
            if (riskListEl && allWords.length > 0) {
                // Pick random words as "At Risk" for now
                const riskWords = [];
                if (allWords.length > 0) riskWords.push(allWords[Math.floor(Math.random() * allWords.length)]);
                if (allWords.length > 1) riskWords.push(allWords[Math.floor(Math.random() * allWords.length)]);

                riskListEl.innerHTML = riskWords.map(word => `
                    <div class="list-item">
                        <span class="word-text">${word.word}</span>
                        <span class="risk-tag">需复习</span>
                    </div>
                `).join('');
            } else if (riskListEl) {
                riskListEl.innerHTML = '<div class="list-item" style="color:#999; justify-content:center;">暂无数据</div>';
            }

            // Update Context Preview Card
            if (allWords.length > 0) {
                // Pick a random word for context review
                const randomWord = allWords[Math.floor(Math.random() * allWords.length)];

                const previewSourceEl = document.getElementById('previewSource');
                if (previewSourceEl) previewSourceEl.textContent = randomWord.source || '未知来源';

                const contextPreviewEl = document.querySelector('.context-preview');
                if (contextPreviewEl) {
                    // If word has context (sentence), use it. Otherwise use a placeholder or definition.
                    if (randomWord.context) {
                        contextPreviewEl.textContent = `"${randomWord.context}"`;
                    } else if (randomWord.translation) {
                        contextPreviewEl.textContent = `(释义) ${randomWord.translation}`;
                        contextPreviewEl.style.fontStyle = 'normal';
                    } else {
                        contextPreviewEl.textContent = "暂无例句";
                    }
                }
            } else {
                // No words state
                const contextPreviewEl = document.querySelector('.context-preview');
                if (contextPreviewEl) contextPreviewEl.textContent = "快去阅读添加生词吧！";
            }

            // Bind Start Button
            const startBtn = document.querySelector('.start-btn');
            // Note: Click handling is now done via event delegation in bindEvents
            // to ensure it works even if the button is re-rendered.

        } catch (error) {
            console.error('Error updating study dashboard:', error);
        }
    }

    async loadProfileData() {
        try {
            if (!authHelper) {
                console.warn('authHelper 未加载，无法加载个人中心数据');
                return;
            }

            const user = await authHelper.getCurrentUser();
            if (!user) {
                return;
            }

            // 更新个人中心显示
            const userEmail = document.getElementById('userEmail');
            const userName = document.getElementById('userName');
            const userCreatedAt = document.getElementById('userCreatedAt');

            if (userEmail) {
                userEmail.textContent = user.email || '未设置';
            }

            if (userName) {
                const username = user.user_metadata?.username || user.email?.split('@')[0] || '用户';
                userName.textContent = username;
            }

            if (userCreatedAt) {
                const date = new Date(user.created_at);
                userCreatedAt.textContent = date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }

            // 加载统计数据
            await this.loadProfileStats();
        } catch (error) {
            console.error('加载个人中心数据失败:', error);
        }
    }

    async loadProfileStats() {
        try {
            // TODO: 从 Supabase 加载实际统计数据
            const documentsCount = document.getElementById('documentsCount');
            const translationsCount = document.getElementById('translationsCount');
            const annotationsCount = document.getElementById('annotationsCount');

            if (documentsCount) documentsCount.textContent = '0';
            if (translationsCount) translationsCount.textContent = '0';
            if (annotationsCount) annotationsCount.textContent = '0';
        } catch (error) {
            console.error('加载统计数据失败:', error);
        }
    }

    updateNavActiveState(activeView) {
        const homeNavBtn = document.getElementById('homeNavBtn');
        const vocabularyNavBtn = document.getElementById('vocabularyNavBtn');
        const studyNavBtn = document.getElementById('studyNavBtn');
        const profileNavBtn = document.getElementById('profileNavBtn');

        // Reset all
        if (homeNavBtn) homeNavBtn.classList.remove('active');
        if (vocabularyNavBtn) vocabularyNavBtn.classList.remove('active');
        if (studyNavBtn) studyNavBtn.classList.remove('active');
        if (profileNavBtn) profileNavBtn.classList.remove('active');

        // Set active
        if (activeView === 'home' && homeNavBtn) {
            homeNavBtn.classList.add('active');
        } else if (activeView === 'vocabulary' && vocabularyNavBtn) {
            vocabularyNavBtn.classList.add('active');
        } else if (activeView === 'study' && studyNavBtn) {
            studyNavBtn.classList.add('active');
        } else if (activeView === 'profile' && profileNavBtn) {
            profileNavBtn.classList.add('active');
        }
    }

    showEmptyState(message) {
        const grid = document.getElementById('filesGrid');
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #8e8e93;">
                <svg viewBox="0 0 24 24" width="64" height="64" style="margin-bottom: 16px; opacity: 0.3;">
                    <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                </svg>
                <p style="font-size: 15px;">${message}</p>
            </div>
        `;
    }

    async openFile() {
        try {
            const result = await ipcRenderer.invoke('open-file-dialog');

            if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                await this.handleFileOpened(filePath);
            }
        } catch (error) {
            console.error('打开文件失败:', error);
        }
    }

    async openFolder() {
        try {
            const result = await ipcRenderer.invoke('open-folder-dialog');

            if (!result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                console.log('打开文件夹:', folderPath);
            }
        } catch (error) {
            console.error('打开文件夹失败:', error);
        }
    }

    async handleFileOpened(filePath) {
        try {
            await this.addToRecentFiles(filePath);
            this.openDocumentTab(filePath);
        } catch (error) {
            console.error('处理文件失败:', error);
        }
    }

    loadRecentFiles() {
        const stored = localStorage.getItem('recentFiles');
        if (stored) {
            try {
                this.recentFiles = JSON.parse(stored);
                if (this.recentFiles.length > 0) {
                    this.showFilesView();
                    this.renderRecentFiles();
                }
            } catch (error) {
                console.error('加载最近文件失败:', error);
                this.recentFiles = [];
            }
        }
    }

    async addToRecentFiles(filePath) {
        const fileName = this.getFileName(filePath);
        const fileType = this.getFileType(filePath);

        let fileSize = 'unknown';

        // Web version: fs module is not available
        // If we have metadata from WebFSAdapter, we could use it, but for now let's skip fs.statSync
        if (window.WebFSAdapter) {
            // Try to get metadata if possible, or just leave as unknown
            // For recent files, weadily available to query size without re-opening
        }

        const fileInfo = {
            path: filePath,
            name: fileName,
            date: new Date().toISOString(),
            type: fileType,
            size: fileSize
        };

        this.recentFiles = this.recentFiles.filter(file => file.path !== filePath);
        this.recentFiles.unshift(fileInfo);

        if (this.recentFiles.length > 20) {
            this.recentFiles = this.recentFiles.slice(0, 20);
        }

        localStorage.setItem('recentFiles', JSON.stringify(this.recentFiles));

        this.showFilesView();
        this.renderRecentFiles();
    }

    renderRecentFiles() {
        if (this.recentFiles.length === 0) {
            this.showEmptyState('暂无最近打开的文件');
            return;
        }

        const grid = document.getElementById('filesGrid');
        const template = document.getElementById('fileCardTemplate');

        grid.innerHTML = '';

        this.recentFiles.forEach((file, index) => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.file-card');

            card.setAttribute('data-file-path', file.path);
            card.querySelector('.file-name-card').textContent = file.name;
            card.querySelector('.file-date-card').textContent = this.formatDate(file.date);
            card.querySelector('.file-size-card').textContent = file.size || '';

            // 获取菜单相关元素
            const menuBtn = clone.querySelector('.file-card-menu-btn');
            const menu = clone.querySelector('.file-card-menu');
            const renameBtn = clone.querySelector('[data-action="rename"]');
            const deleteBtn = clone.querySelector('[data-action="delete"]');
            const nameCard = clone.querySelector('.file-name-card');
            const nameInput = clone.querySelector('.file-name-input');

            // 菜单按钮点击事件
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFileCardMenu(card, menu);
            });

            // 重命名按钮点击事件
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeAllFileCardMenus();
                this.startRenameFile(file.path, card, nameCard, nameInput);
            });

            // 删除按钮点击事件
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeAllFileCardMenus();
                this.deleteFile(file.path, card);
            });

            // 卡片点击事件（排除菜单区域和重命名模式）
            card.addEventListener('click', (e) => {
                // 如果点击的是菜单按钮或菜单本身，不触发打开文件
                if (e.target.closest('.file-card-menu-btn') || e.target.closest('.file-card-menu')) {
                    return;
                }
                // 如果正在重命名模式，不触发打开文件
                if (card.classList.contains('is-renaming')) {
                    return;
                }
                // 如果点击的是重命名输入框，不触发打开文件
                if (e.target.closest('.file-name-input')) {
                    return;
                }
                this.openFileFromCard(file.path);
            });

            grid.appendChild(clone);

            if (file.type === 'pdf') {
                this.generatePDFPreview(file.path, card);
            }
        });
    }

    toggleFileCardMenu(card, menu) {
        const isOpen = menu.classList.contains('is-open');

        // 先关闭所有其他菜单
        this.closeAllFileCardMenus();

        // 切换当前菜单
        if (!isOpen) {
            menu.classList.add('is-open');
        }
    }

    closeAllFileCardMenus() {
        const allMenus = document.querySelectorAll('.file-card-menu.is-open');
        allMenus.forEach(menu => {
            menu.classList.remove('is-open');
        });
    }

    async generatePDFPreview(filePath, cardElement) {
        if (!this.pdfLib) {
            console.log('PDF.js未加载，无法生成预览');
            return;
        }

        try {
            const result = await ipcRenderer.invoke('read-file', filePath);

            if (!result.success) {
                console.error('读取PDF失败:', result.error);
                return;
            }

            const loadingTask = this.pdfLib.getDocument({
                data: result.data,
                cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
                cMapPacked: true
            });

            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);

            const canvas = cardElement.querySelector('.preview-canvas');
            const context = canvas.getContext('2d');

            // 获取预览区域的尺寸
            const previewContainer = cardElement.querySelector('.file-preview');
            const previewStyles = window.getComputedStyle(previewContainer);
            const paddingLeft = parseFloat(previewStyles.paddingLeft) || 0;
            const paddingRight = parseFloat(previewStyles.paddingRight) || 0;
            const paddingTop = parseFloat(previewStyles.paddingTop) || 0;
            const paddingBottom = parseFloat(previewStyles.paddingBottom) || 0;
            const rawWidth = previewContainer.clientWidth - paddingLeft - paddingRight;
            const rawHeight = previewContainer.clientHeight - paddingTop - paddingBottom;
            const containerWidth = rawWidth > 0 ? rawWidth : 180;
            const containerHeight = rawHeight > 0 ? rawHeight : 200;

            // 计算高分辨率缩放比例 - 提高清晰度
            const viewport = page.getViewport({ scale: 1.0 });
            const previewHeightPortion = 0.35;
            const previewWidthPortion = 0.6;

            const deviceRatio = window.devicePixelRatio || 1;
            const baseScale = containerWidth / (viewport.width * previewWidthPortion);
            const oversample = 2; // 超采样提升清晰度
            const highDpiScale = Math.max(baseScale * deviceRatio * oversample, baseScale * deviceRatio);
            const scaledViewport = page.getViewport({ scale: highDpiScale });

            // 设置canvas尺寸 - 高分辨率，只截取左上区域
            canvas.width = scaledViewport.width * previewWidthPortion;
            canvas.height = scaledViewport.height * previewHeightPortion;

            // 设置canvas显示尺寸，保持宽高比
            const displayWidth = containerWidth;
            const displayHeight = displayWidth * (canvas.height / canvas.width);
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';

            // 创建临时canvas渲染完整页面
            const tempCanvas = document.createElement('canvas');
            const tempContext = tempCanvas.getContext('2d');
            tempCanvas.width = scaledViewport.width;
            tempCanvas.height = scaledViewport.height;

            // 渲染完整PDF页面到临时canvas
            await page.render({
                canvasContext: tempContext,
                viewport: scaledViewport
            }).promise;

            // 将临时canvas的左上部分绘制到显示canvas
            context.drawImage(
                tempCanvas,
                0, 0, scaledViewport.width * previewWidthPortion, scaledViewport.height * previewHeightPortion,  // 源区域（左上区域）
                0, 0, canvas.width, canvas.height  // 目标区域
            );

            // 隐藏占位符
            const placeholder = cardElement.querySelector('.preview-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }

            console.log('PDF预览生成成功（截取左上区域）:', filePath);
        } catch (error) {
            console.error('生成PDF预览失败:', error);
        }
    }

    async openFileFromCard(filePath) {
        try {
            await this.addToRecentFiles(filePath);
            this.openDocumentTab(filePath);
            console.log('从卡片打开文件:', filePath);
        } catch (error) {
            console.error('打开文件失败:', error);
        }
    }

    startRenameFile(filePath, cardElement, nameCard, nameInput) {
        const currentName = this.getFileName(filePath);

        // 保存原始信息，用于失败时恢复
        cardElement.dataset.originalName = currentName;
        cardElement.dataset.originalPath = filePath;

        // 进入重命名模式
        cardElement.classList.add('is-renaming');

        // 设置输入框的值
        nameInput.value = currentName;

        // 阻止输入框点击事件冒泡，避免触发卡片点击
        nameInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 聚焦输入框并选中文件名（不包括扩展名）
        setTimeout(() => {
            nameInput.focus();
            const lastDotIndex = currentName.lastIndexOf('.');
            if (lastDotIndex > 0) {
                // 选中文件名部分，保留扩展名
                nameInput.setSelectionRange(0, lastDotIndex);
            } else {
                // 没有扩展名，选中全部
                nameInput.select();
            }
        }, 10);

        // 确认重命名
        const confirmRename = async () => {
            const newName = nameInput.value.trim();

            if (!newName || newName === currentName) {
                // 取消重命名模式
                this.cancelRenameFile(cardElement, nameCard, nameInput, currentName);
                return;
            }

            // 执行重命名
            const success = await this.executeRenameFile(filePath, newName, cardElement);

            if (success) {
                // 退出重命名模式
                this.cancelRenameFile(cardElement, nameCard, nameInput, newName);
            } else {
                // 重命名失败，恢复原文件名
                this.cancelRenameFile(cardElement, nameCard, nameInput, currentName);
            }
        };

        // 取消重命名
        const cancelRename = () => {
            this.cancelRenameFile(cardElement, nameCard, nameInput, currentName);
        };

        // 绑定事件 - 使用捕获阶段确保优先处理
        nameInput.addEventListener('blur', confirmRename, { once: true });

        // 处理标准快捷键 - 在捕获阶段处理，确保优先于全局监听器
        const handleKeydown = (e) => {
            // 允许标准快捷键（Ctrl/Cmd + A, C, V, X, Z, Y）
            // Mac使用Cmd键（metaKey），Windows/Linux使用Ctrl键
            const isModifierKey = e.metaKey || e.ctrlKey;

            // 标准编辑快捷键：全选、复制、粘贴、剪切、撤销
            if (isModifierKey && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
                // 不阻止默认行为，让浏览器处理
                e.stopPropagation(); // 阻止事件冒泡到其他监听器
                e.stopImmediatePropagation(); // 阻止同一元素上的其他监听器
                return;
            }

            // Mac上Cmd+Shift+Z用于重做，Windows/Linux上Ctrl+Y用于重做
            if (isModifierKey && e.shiftKey && e.key.toLowerCase() === 'z') {
                // 允许重做快捷键（Mac）
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                // Windows/Linux的Ctrl+Y重做
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }

            // 应用特定的快捷键
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                nameInput.blur(); // 触发 blur 事件
                nameInput.removeEventListener('keydown', handleKeydown); // 移除监听器
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelRename();
                nameInput.removeEventListener('keydown', handleKeydown); // 移除监听器
            }
        };

        // 在捕获阶段添加监听器，确保优先处理
        nameInput.addEventListener('keydown', handleKeydown, { capture: true });

        // 点击外部取消（通过全局点击事件处理）
        this.currentRenamingCard = cardElement;
        this.currentRenamingInput = nameInput;
    }

    cancelRenameFile(cardElement, nameCard, nameInput, name) {
        cardElement.classList.remove('is-renaming');
        nameInput.value = name;
        nameCard.textContent = name;
        this.currentRenamingCard = null;
        this.currentRenamingInput = null;
    }

    async executeRenameFile(filePath, newName, cardElement) {
        try {
            // 构建新路径（使用字符串操作，因为渲染进程不能使用path模块）
            const lastSlash = filePath.lastIndexOf('/');
            const lastBackslash = filePath.lastIndexOf('\\');
            const lastSeparator = Math.max(lastSlash, lastBackslash);
            const dir = lastSeparator >= 0 ? filePath.substring(0, lastSeparator + 1) : '';
            const newPath = dir + newName;

            const result = await ipcRenderer.invoke('rename-file', {
                oldPath: filePath,
                newPath: newPath
            });

            if (result.success) {
                // 更新最近文件列表
                const fileIndex = this.recentFiles.findIndex(f => f.path === filePath);
                if (fileIndex >= 0) {
                    this.recentFiles[fileIndex].path = newPath;
                    this.recentFiles[fileIndex].name = newName;
                    this.saveRecentFiles();
                    // 更新当前卡片的文件名显示和路径
                    cardElement.setAttribute('data-file-path', newPath);
                    const nameCard = cardElement.querySelector('.file-name-card');
                    if (nameCard) {
                        nameCard.textContent = newName;
                    }
                }

                // 如果该文件正在标签页中打开，更新标签页标题
                const tab = this.tabs.find(t => t.filePath === filePath);
                if (tab) {
                    tab.filePath = newPath;
                    tab.title = newName;
                    this.tabLookupByPath.delete(filePath);
                    this.tabLookupByPath.set(newPath, tab.id);
                    this.renderTabStrip();
                }

                return true;
            } else {
                alert('重命名失败: ' + result.error);
                return false;
            }
        } catch (error) {
            console.error('重命名文件失败:', error);
            alert('重命名失败: ' + error.message);
            return false;
        }
    }

    async deleteFile(filePath, cardElement) {
        if (!confirm('确定要删除这个文件吗？此操作不可撤销。')) {
            return;
        }

        try {
            const result = await ipcRenderer.invoke('delete-file', filePath);

            // 无论文件是否存在，都从列表中移除
            // 从最近文件列表中移除
            this.recentFiles = this.recentFiles.filter(f => f.path !== filePath);
            this.saveRecentFiles();

            // 如果该文件正在标签页中打开，关闭该标签页
            const tab = this.tabs.find(t => t.filePath === filePath);
            if (tab) {
                this.closeTab(tab.id);
            }

            // 从标签页查找表中移除
            this.tabLookupByPath.delete(filePath);

            // 重新渲染文件列表
            this.renderRecentFiles();

            // 如果有警告信息（如文件不存在或删除失败），在控制台记录，但不显示错误弹窗
            if (result.warning) {
                console.log('删除操作完成，但有提示:', result.warning);
            }
        } catch (error) {
            console.error('删除文件失败:', error);
            // 即使出错，也从列表中移除
            this.recentFiles = this.recentFiles.filter(f => f.path !== filePath);
            this.saveRecentFiles();
            this.tabLookupByPath.delete(filePath);
            this.renderRecentFiles();
        }
    }

    getFileName(filePath) {
        return filePath.split('/').pop() || filePath.split('\\').pop();
    }

    getFileType(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const typeMap = {
            'pdf': 'pdf',
            'doc': 'word',
            'docx': 'word',
            'txt': 'text'
        };
        return typeMap[ext] || 'file';
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return '今天';
        } else if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}周前`;
        } else {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${month}/${day}`;
        }
    }

    updateStatus(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    saveRecentFiles() {
        localStorage.setItem('recentFiles', JSON.stringify(this.recentFiles));
    }

    // Daily Review Pack System
    async initDailyGoal() {
        if (!window.StorageAdapter) {
            console.warn('StorageAdapter not available for review pack');
            return;
        }

        // Load daily progress
        this.dailyProgress = await window.StorageAdapter.getDailyProgress();

        // Generate today's review pack
        await this.generateReviewPack();

        // Bind reset button
        const resetBtn = document.getElementById('resetReviewBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetDailyReview());
        }

        // Update UI
        this.updateReviewPackUI();

        // Sync heights initially and on resize
        setTimeout(() => this.syncCardHeights(), 100);
        window.addEventListener('resize', () => this.syncCardHeights());
    }

    async generateReviewPack() {
        if (!window.StorageAdapter) return;

        try {
            const response = await window.StorageAdapter.getAllVocabulary();
            const allWords = response.data || [];
            const now = Date.now();

            // 1. Get due review words (nextReview <= now)
            const dueWords = allWords.filter(w => {
                return w.nextReview && w.nextReview <= now;
            }).sort((a, b) => a.nextReview - b.nextReview);

            // 2. Get new words (never studied)
            const newWords = allWords.filter(w => !w.repetitions || w.repetitions === 0);

            // 3. Calculate pack composition
            const minPackSize = 20;
            const maxPackSize = 50;

            let reviewCount = Math.min(dueWords.length, maxPackSize);
            let newCount = 0;

            // If we have space, add new words
            if (reviewCount < minPackSize && newWords.length > 0) {
                newCount = Math.min(newWords.length, minPackSize - reviewCount);
            } else if (reviewCount < maxPackSize && newWords.length > 0) {
                // Add some new words even if we have due reviews
                newCount = Math.min(newWords.length, Math.floor((maxPackSize - reviewCount) * 0.3));
            }

            this.reviewPack = {
                dueWords: dueWords.slice(0, reviewCount),
                newWords: newWords.slice(0, newCount),
                total: reviewCount + newCount
            };

            console.log('Review pack generated:', this.reviewPack);
        } catch (error) {
            console.error('Failed to generate review pack:', error);
            this.reviewPack = { dueWords: [], newWords: [], total: 0 };
        }
    }

    updateReviewPackUI() {
        const packTotalEl = document.getElementById('packTotal');
        const packReviewEl = document.getElementById('packReview');
        const packNewEl = document.getElementById('packNew');
        const startBtn = document.getElementById('startFocusBtn');
        const resetBtn = document.getElementById('resetReviewBtn');

        const pack = this.reviewPack || { dueWords: [], newWords: [], total: 0 };
        const isCompleted = this.dailyProgress && this.dailyProgress.completed;

        // Update pack info (now just numbers)
        if (packTotalEl) {
            packTotalEl.textContent = pack.total;
        }
        if (packReviewEl) {
            packReviewEl.textContent = pack.dueWords.length;
        }
        if (packNewEl) {
            packNewEl.textContent = pack.newWords.length;
        }

        // Update button states
        if (startBtn) {
            if (isCompleted) {
                startBtn.disabled = true;
                startBtn.textContent = '今日已完成！';
                if (resetBtn) resetBtn.style.display = 'block';
            } else if (pack.total === 0) {
                startBtn.disabled = true;
                startBtn.textContent = '暂无待复习单词';
                if (resetBtn) resetBtn.style.display = 'none';
            } else {
                startBtn.disabled = false;
                startBtn.textContent = '开始专注模式';
                if (resetBtn) resetBtn.style.display = 'none';
            }
        }
    }

    async resetDailyReview() {
        if (!window.StorageAdapter) return;

        if (confirm('确定要重置今日复习吗？这将清除今天的学习进度。')) {
            // Reset daily progress
            const today = new Date().toISOString().split('T')[0];
            const resetProgress = { date: today, count: 0, completed: false };
            localStorage.setItem('daily_study_progress', JSON.stringify(resetProgress));

            this.dailyProgress = resetProgress;

            // Regenerate pack
            await this.generateReviewPack();
            this.updateReviewPackUI();

            // Force reload to ensure UI is fresh
            window.location.reload();
        }
    }

    // Sync heights of review card and side cards
    syncCardHeights() {
        const reviewCard = document.getElementById('startReviewCard');
        const sideCards = document.querySelector('.side-cards');

        if (reviewCard && sideCards) {
            // Reset height first to get natural height
            sideCards.style.height = 'auto';

            // Get review card height
            const height = reviewCard.offsetHeight;

            // Apply to side cards
            sideCards.style.height = `${height}px`;

            // Ensure last card stretches
            const lastCard = sideCards.querySelector('.card:last-child');
            if (lastCard) {
                lastCard.style.flex = '1';
                lastCard.style.display = 'flex';
                lastCard.style.flexDirection = 'column';

                // Make list scrollable if needed
                const list = lastCard.querySelector('#recentWordsList');
                if (list) {
                    list.style.flex = '1';
                    list.style.overflowY = 'auto';
                    list.style.minHeight = '0'; // Important for flex scrolling
                }
            }
        }
    }

    async updateGoal(newGoal) {
        // Deprecated - no longer used
    }

    updateDailyGoalUI() {
        // Deprecated - replaced by updateReviewPackUI
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new MainApp();
});
