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
        // 打开文件按钮
        document.getElementById('openFileBtn').addEventListener('click', () => {
            this.openFile();
        });

        // 打开文件夹按钮
        const openFolderBtn = document.getElementById('openFolderBtn');
        if (openFolderBtn) {
            openFolderBtn.addEventListener('click', () => {
                this.openFolder();
            });
        }

        // 标签切换
        document.getElementById('recentTab').addEventListener('click', () => {
            this.switchTab('recent');
        });

        document.getElementById('favoriteTab').addEventListener('click', () => {
            this.switchTab('favorite');
        });
    }

    switchTab(tabName) {
        // 更新标签状态
        document.querySelectorAll('.tab-item').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (tabName === 'recent') {
            document.getElementById('recentTab').classList.add('active');
            this.renderRecentFiles();
        } else if (tabName === 'favorite') {
            document.getElementById('favoriteTab').classList.add('active');
            this.showEmptyState('暂无收藏文件');
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
            
            // 获取预览区域的宽度
            const previewContainer = cardElement.querySelector('.file-preview');
            const containerWidth = previewContainer.offsetWidth || 180;
            
            // 计算缩放比例
            const viewport = page.getViewport({ scale: 1.0 });
            const scale = containerWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale: scale });
            
            // 设置canvas尺寸 - 只显示上2/5部分
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height * 0.4; // 只显示上40%
            
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
            
            // 将临时canvas的上2/5部分绘制到显示canvas
            context.drawImage(
                tempCanvas,
                0, 0, scaledViewport.width, scaledViewport.height * 0.4,  // 源区域（上2/5）
                0, 0, canvas.width, canvas.height  // 目标区域
            );
            
            // 隐藏占位符
            const placeholder = cardElement.querySelector('.preview-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            
            console.log('PDF预览生成成功（上2/5部分）:', filePath);
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
