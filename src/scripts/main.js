const { ipcRenderer } = require('electron');

class MainApp {
    constructor() {
        this.recentFiles = [];
        this.pdfLib = null;
        this.init();
    }

    async init() {
        await this.loadPDFJS();
        this.bindEvents();
        this.loadRecentFiles();
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
                if (this.recentFiles.length > 0) {
                    this.showFilesView();
                    this.renderRecentFiles();
                } else {
                    this.showWelcomeView();
                }
            });
        }

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

    showWelcomeView() {
        document.getElementById('welcomeSection').style.display = 'flex';
        document.getElementById('filesView').style.display = 'none';
    }

    showFilesView() {
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('filesView').style.display = 'flex';
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
            
            const result = await ipcRenderer.invoke('open-file-from-main', filePath);
            
            if (result.success) {
                console.log('文件已打开:', filePath);
            }
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
            const result = await ipcRenderer.invoke('open-file-from-main', filePath);
            if (result.success) {
                console.log('从卡片打开文件:', filePath);
            }
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
