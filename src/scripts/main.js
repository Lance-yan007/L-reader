const { ipcRenderer } = require('electron');
const path = require('path');

class MainApp {
    constructor() {
        this.recentFiles = [];
        this.pdfLib = null;
        this.homeTabId = 'tab-home';
        this.tabs = [];
        this.activeTabId = null;
        this.tabLookupByPath = new Map();
        this.tabStrip = null;
        this.tabAddButton = null;
        this.homeView = null;
        this.documentPanels = null;
        this.handleWindowResize = this.handleWindowResize.bind(this);
        this.init();
    }

    async init() {
        this.cacheDom();
        this.setupTabSystem();
        await this.loadPDFJS();
        this.bindEvents();
        this.loadRecentFiles();
        this.setupWindowStateListener();
    }

    async loadPDFJS() {
        try {
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            if (!pdfjsLib) {
                this.pdfLib = require('pdfjs-dist');
                this.pdfLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.js';
            } else {
                this.pdfLib = pdfjsLib;
            }
            console.log('PDF.js加载成功');
        } catch (error) {
            console.error('加载PDF.js失败:', error);
        }
    }

    cacheDom() {
        this.tabStrip = document.getElementById('tabStrip');
        this.tabAddButton = document.getElementById('tabAddButton');
        this.homeView = document.getElementById('homeView');
        this.vocabularyView = document.getElementById('vocabularyView');
        this.documentPanels = document.getElementById('documentPanels');
    }

    setupTabSystem() {
        if (!this.tabStrip || !this.homeView) {
            return;
        }

        this.homeView.dataset.tabId = this.homeTabId;
        if (!this.homeView.getAttribute('role')) {
            this.homeView.setAttribute('role', 'tabpanel');
        }
        this.homeView.setAttribute('aria-labelledby', this.homeTabId);

        const homeTab = {
            id: this.homeTabId,
            type: 'home',
            title: '主页',
            icon: 'home',
            displayLabel: false,
            closable: false,
            panelElement: this.homeView
        };

        this.tabs = [homeTab];
        this.activeTabId = this.homeTabId;

        this.renderTabStrip();
        this.updateTabStates();

        if (this.tabAddButton) {
            this.tabAddButton.addEventListener('click', () => {
                this.openFile();
            });
        }
    }

    createTabButton(tab) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab-item';
        button.setAttribute('role', 'tab');
        button.setAttribute('id', tab.id);
        button.dataset.tabId = tab.id;

        const titleText = tab.title || '未命名';
        button.setAttribute('title', titleText);

        if (tab.panelElement && tab.panelElement.id) {
            button.setAttribute('aria-controls', tab.panelElement.id);
        }

        if (tab.icon) {
            const iconMarkup = this.getTabIconMarkup(tab.icon);
            if (iconMarkup) {
                const iconSpan = document.createElement('span');
                iconSpan.className = 'tab-icon';
                iconSpan.innerHTML = iconMarkup;
                button.appendChild(iconSpan);
            }
        }

        const shouldShowLabel = tab.displayLabel !== false;

        if (shouldShowLabel) {
            const label = document.createElement('span');
            label.className = 'tab-label';
            label.textContent = titleText;
            button.appendChild(label);
        } else {
            button.classList.add('tab-icon-only');
            button.setAttribute('aria-label', titleText);
        }

        if (tab.closable) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'tab-close';
            closeBtn.setAttribute('aria-label', '关闭标签');
            closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L12 13.41l-4.89 4.89-1.41-1.41L10.59 12 5.7 7.11 7.11 5.7 12 10.59l4.89-4.89z" /></svg>';
            closeBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                this.closeTab(tab.id);
            });
            button.appendChild(closeBtn);
        }

        button.addEventListener('click', () => {
            this.setActiveTab(tab.id);
        });

        return button;
    }

    getTabIconMarkup(name) {
        switch (name) {
            case 'home':
                return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
            default:
                return '';
        }
    }

    renderTabStrip() {
        if (!this.tabStrip) {
            return;
        }

        this.tabStrip.innerHTML = '';
        this.tabs.forEach(tab => {
            tab.buttonElement = this.createTabButton(tab);
            this.tabStrip.appendChild(tab.buttonElement);
        });
    }

    updateTabStates() {
        this.tabs.forEach(tab => {
            const isActive = tab.id === this.activeTabId;
            if (tab.buttonElement) {
                tab.buttonElement.classList.toggle('is-active', isActive);
                tab.buttonElement.setAttribute('aria-selected', isActive ? 'true' : 'false');
                tab.buttonElement.setAttribute('tabindex', isActive ? '0' : '-1');
            }
            if (tab.panelElement) {
                tab.panelElement.classList.toggle('is-active', isActive);
            }
        });

        if (this.tabStrip) {
            this.tabStrip.setAttribute('aria-activedescendant', this.activeTabId || '');
        }
    }

    ensureActiveTabVisible() {
        if (!this.tabStrip) {
            return;
        }

        const activeTab = this.tabs.find(tab => tab.id === this.activeTabId);
        if (!activeTab || !activeTab.buttonElement) {
            return;
        }

        const tabRect = activeTab.buttonElement.getBoundingClientRect();
        const stripRect = this.tabStrip.getBoundingClientRect();

        if (tabRect.left < stripRect.left) {
            this.tabStrip.scrollBy({ left: tabRect.left - stripRect.left - 12, behavior: 'smooth' });
        } else if (tabRect.right > stripRect.right) {
            this.tabStrip.scrollBy({ left: tabRect.right - stripRect.right + 12, behavior: 'smooth' });
        }
    }

    setActiveTab(tabId) {
        const targetTab = this.tabs.find(tab => tab.id === tabId);
        if (!targetTab) {
            return;
        }

        this.activeTabId = tabId;
        this.updateTabStates();
        this.ensureActiveTabVisible();

        // 根据标签类型显示/隐藏相应的视图
        if (targetTab.type === 'document') {
            // 隐藏home view和vocabulary view
            if (this.homeView) {
                this.homeView.classList.remove('is-active');
                this.homeView.style.display = 'none';
            }
            if (this.vocabularyView) {
                this.vocabularyView.classList.remove('is-active');
                this.vocabularyView.style.display = 'none';
            }
            // 显示对应的文档面板，隐藏其他面板
            if (this.documentPanels) {
                const panels = this.documentPanels.querySelectorAll('.document-panel');
                panels.forEach(panel => {
                    const panelTabId = panel.dataset.tabId;
                    if (panelTabId === tabId) {
                        panel.classList.add('is-active');
                        panel.style.display = 'flex';
                    } else {
                        panel.classList.remove('is-active');
                        panel.style.display = 'none';
                    }
                });
            }
            // 更新导航状态
            this.updateNavActiveState(null);
            // 聚焦webview
            if (targetTab.webview) {
                try {
                    targetTab.webview.focus();
                } catch (error) {
                    console.warn('无法聚焦文档标签:', error);
                }
            }
        } else if (targetTab.type === 'home') {
            // 显示home view
            if (this.homeView) {
                this.homeView.classList.add('is-active');
                this.homeView.style.display = 'flex';
            }
            // 隐藏vocabulary view和文档面板
            if (this.vocabularyView) {
                this.vocabularyView.classList.remove('is-active');
                this.vocabularyView.style.display = 'none';
            }
            if (this.documentPanels) {
                const panels = this.documentPanels.querySelectorAll('.document-panel');
                panels.forEach(panel => {
                    panel.classList.remove('is-active');
                    panel.style.display = 'none';
                });
            }
            // 更新导航状态
            this.updateNavActiveState('home');
        }
    }

    openDocumentTab(filePath) {
        if (!filePath || !this.documentPanels) {
            return;
        }

        const normalizedPath = path.resolve(filePath);
        const existingTabId = this.tabLookupByPath.get(normalizedPath);
        if (existingTabId) {
            this.setActiveTab(existingTabId);
            return;
        }

        // 隐藏home view和vocabulary view
        if (this.homeView) {
            this.homeView.classList.remove('is-active');
            this.homeView.style.display = 'none';
        }
        if (this.vocabularyView) {
            this.vocabularyView.classList.remove('is-active');
            this.vocabularyView.style.display = 'none';
        }

        const tabId = `tab-doc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        const panel = document.createElement('div');
        panel.className = 'tab-panel document-panel is-active';
        panel.id = `${tabId}-panel`;
        panel.dataset.tabId = tabId;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tabId);

        const webview = document.createElement('webview');
        webview.className = 'document-frame';
        webview.setAttribute('src', 'reader.html');
        webview.setAttribute('nodeintegration', '');
        webview.setAttribute('webpreferences', 'contextIsolation=false');

        panel.appendChild(webview);
        this.documentPanels.appendChild(panel);

        const newTab = {
            id: tabId,
            type: 'document',
            title: this.getFileName(filePath),
            filePath: normalizedPath,
            closable: true,
            panelElement: panel,
            webview
        };

        this.tabs.push(newTab);
        this.tabLookupByPath.set(normalizedPath, tabId);

        this.attachWebviewEvents(newTab, normalizedPath);
        this.renderTabStrip();
        this.setActiveTab(tabId);
    }

    attachWebviewEvents(tab, filePath) {
        if (!tab.webview) {
            return;
        }

        const sendFileToReader = () => {
            try {
                tab.webview.send('set-embed-mode', { embedded: true });
                tab.webview.send('file-opened', filePath);
            } catch (error) {
                console.error('向阅读器标签发送文件失败:', error);
            }
        };

        tab.webview.addEventListener('did-finish-load', sendFileToReader);
        
        // 为webview添加开发者工具快捷键支持
        // 在webview中按 F12 或 Ctrl+Shift+I (Windows/Linux) 或 Cmd+Option+I (Mac) 打开开发者工具
        tab.webview.addEventListener('dom-ready', () => {
            // 通过IPC让webview打开开发者工具
            tab.webview.addEventListener('console-message', (e) => {
                // 将所有webview的console输出也输出到主窗口控制台
                console.log(`[WebView ${tab.id}]:`, e.message);
            });
        });

        tab.webview.addEventListener('ipc-message', (event) => {
            if (!event || !event.channel) {
                return;
            }

            if (event.channel === 'close-tab-request') {
                this.closeTab(tab.id);
            } else if (event.channel === 'update-tab-title' && event.args && event.args[0]) {
                const newTitle = event.args[0].title;
                if (newTitle && tab.title !== newTitle) {
                    tab.title = newTitle;
                    this.renderTabStrip();
                    this.updateTabStates();
                }
            }
        });
    }

    closeTab(tabId) {
        const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
        if (tabIndex === -1) {
            return;
        }

        const tab = this.tabs[tabIndex];
        if (!tab.closable) {
            return;
        }

        const isActive = this.activeTabId === tabId;
        
        // 先隐藏面板，避免白屏
        if (tab.panelElement && tab.type === 'document') {
            tab.panelElement.style.display = 'none';
        }

        // 确定下一个要激活的标签
        let nextActiveId = null;
        if (isActive) {
            // 优先选择同类型的下一个标签，如果没有则选择主页
            const nextTab = this.tabs[tabIndex + 1] || this.tabs[tabIndex - 1];
            nextActiveId = nextTab ? nextTab.id : this.homeTabId;
        }

        // 先切换到下一个标签（如果关闭的是当前标签）
        if (isActive && nextActiveId) {
            this.setActiveTab(nextActiveId);
        }

        // 延迟删除DOM元素，避免阻塞UI
        setTimeout(() => {
            if (tab.panelElement && tab.panelElement.parentNode) {
                tab.panelElement.parentNode.removeChild(tab.panelElement);
            }
        }, 100);

        if (tab.filePath) {
            this.tabLookupByPath.delete(tab.filePath);
        }

        this.tabs.splice(tabIndex, 1);
        this.renderTabStrip();

        // 如果没有下一个标签，确保显示主页
        if (!nextActiveId || this.tabs.length === 1) {
            this.activeTabId = this.homeTabId;
            this.setActiveTab(this.homeTabId);
            this.updateNavActiveState('home');
        }
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
                // 隐藏vocabulary view
                if (this.vocabularyView) {
                    this.vocabularyView.classList.remove('is-active');
                    this.vocabularyView.style.display = 'none';
                }
                // 显示home view
                if (this.homeView) {
                    this.homeView.classList.add('is-active');
                    this.homeView.style.display = 'flex';
                }
                if (this.recentFiles.length > 0) {
                    this.showFilesView();
                    this.renderRecentFiles();
                } else {
                    this.showWelcomeView();
                }
                this.setActiveTab(this.homeTabId);
                this.updateNavActiveState('home');
            });
        }

        const vocabularyNavBtn = document.getElementById('vocabularyNavBtn');
        if (vocabularyNavBtn) {
            vocabularyNavBtn.addEventListener('click', () => {
                this.showVocabularyView();
            });
        }

        if (this.tabStrip) {
            this.tabStrip.addEventListener('wheel', (event) => {
                if (event.deltaY !== 0) {
                    event.preventDefault();
                    this.tabStrip.scrollBy({ left: event.deltaY, behavior: 'auto' });
                }
            }, { passive: false });
        }

        ipcRenderer.on('open-document-tab', (_event, filePath) => {
            if (filePath) {
                this.handleFileOpened(filePath);
            }
        });

        this.initSidebarInteractions();
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

    showVocabularyView() {
        // 隐藏home view
        if (this.homeView) {
            this.homeView.classList.remove('is-active');
            this.homeView.style.display = 'none';
        }
        // 显示vocabulary view
        if (this.vocabularyView) {
            this.vocabularyView.classList.add('is-active');
            this.vocabularyView.style.display = 'flex';
        }
        // 隐藏所有文档面板
        if (this.documentPanels) {
            const panels = this.documentPanels.querySelectorAll('.document-panel');
            panels.forEach(panel => {
                panel.style.display = 'none';
            });
        }
        this.updateNavActiveState('vocabulary');
    }

    updateNavActiveState(activeView) {
        const homeNavBtn = document.getElementById('homeNavBtn');
        const vocabularyNavBtn = document.getElementById('vocabularyNavBtn');
        
        if (homeNavBtn) {
            homeNavBtn.classList.toggle('active', activeView === 'home');
        }
        if (vocabularyNavBtn) {
            vocabularyNavBtn.classList.toggle('active', activeView === 'vocabulary');
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
        try {
            const fs = require('fs');
            const stats = fs.statSync(filePath);
            fileSize = this.formatFileSize(stats.size);
        } catch (error) {
            console.error('获取文件大小失败:', error);
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
            
            card.addEventListener('click', () => {
                this.openFileFromCard(file.path);
            });
            
            grid.appendChild(clone);
            
            if (file.type === 'pdf') {
                this.generatePDFPreview(file.path, card);
            }
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
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new MainApp();
});
