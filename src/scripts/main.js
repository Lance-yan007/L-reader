const { ipcRenderer } = require('electron');

class MainApp {
    constructor() {
        this.recentFiles = [];
        this.currentFolder = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadRecentFiles();
        this.updateStatus('就绪');
    }

    bindEvents() {
        // 打开文件按钮
        document.getElementById('openFileBtn').addEventListener('click', () => {
            this.openFile();
        });

        // 打开文件夹按钮
        document.getElementById('openFolderBtn').addEventListener('click', () => {
            this.openFolder();
        });

        // 清空最近文件记录
        document.getElementById('clearRecentBtn').addEventListener('click', () => {
            this.clearRecentFiles();
        });

        // 返回主界面
        document.getElementById('backToMainBtn').addEventListener('click', () => {
            this.showMainView();
        });

        // IPC事件监听
        ipcRenderer.on('folder-opened', (event, folderPath) => {
            this.handleFolderOpened(folderPath);
        });
    }

    async openFile() {
        try {
            this.updateStatus('正在打开文件...');
            
            const result = await ipcRenderer.invoke('open-file-dialog');
            
            if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                await this.handleFileOpened(filePath);
            }
        } catch (error) {
            this.showError('打开文件失败: ' + error.message);
        } finally {
            this.updateStatus('就绪');
        }
    }

    async openFolder() {
        try {
            this.updateStatus('正在打开文件夹...');
            
            const result = await ipcRenderer.invoke('open-folder-dialog');
            
            if (!result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                this.handleFolderOpened(folderPath);
            }
        } catch (error) {
            this.showError('打开文件夹失败: ' + error.message);
        } finally {
            this.updateStatus('就绪');
        }
    }

    async handleFileOpened(filePath) {
        // 添加到最近文件列表
        this.addToRecentFiles(filePath);
        
        // 发送文件路径到主进程，打开阅读器窗口
        // 这里主进程会自动创建阅读器窗口
        this.updateStatus(`已打开文件: ${this.getFileName(filePath)}`);
    }

    handleFolderOpened(folderPath) {
        this.currentFolder = folderPath;
        this.showFolderView(folderPath);
        this.updateStatus(`已打开文件夹: ${folderPath}`);
    }

    showFolderView(folderPath) {
        // 隐藏欢迎区域和最近文件区域
        document.getElementById('welcomeSection').style.display = 'none';
        document.getElementById('recentFilesSection').style.display = 'none';
        
        // 显示文件夹内容区域
        const folderSection = document.getElementById('folderContentSection');
        folderSection.style.display = 'block';
        
        // 更新文件夹路径标题
        document.getElementById('folderPathTitle').textContent = `文件夹: ${folderPath}`;
        
        // 加载文件夹内容
        this.loadFolderContents(folderPath);
    }

    showMainView() {
        // 显示欢迎区域
        document.getElementById('welcomeSection').style.display = 'block';
        
        // 显示最近文件区域（如果有文件）
        if (this.recentFiles.length > 0) {
            document.getElementById('recentFilesSection').style.display = 'block';
        } else {
            document.getElementById('recentFilesSection').style.display = 'none';
        }
        
        // 隐藏文件夹内容区域
        document.getElementById('folderContentSection').style.display = 'none';
        
        this.currentFolder = null;
        this.updateStatus('就绪');
    }

    async loadFolderContents(folderPath) {
        try {
            // 这里应该调用主进程的API来获取文件夹内容
            // 暂时使用模拟数据
            const files = await this.getFolderFiles(folderPath);
            this.renderFileList('folderFileList', files, 'folder');
        } catch (error) {
            this.showError('加载文件夹内容失败: ' + error.message);
        }
    }

    async getFolderFiles(folderPath) {
        // 模拟文件夹内容
        // 实际实现中应该调用主进程的API
        return [
            {
                name: 'sample.pdf',
                path: folderPath + '/sample.pdf',
                size: '2.3 MB',
                date: '2024-01-15',
                type: 'pdf'
            },
            {
                name: 'document.docx',
                path: folderPath + '/document.docx',
                size: '1.8 MB',
                date: '2024-01-14',
                type: 'docx'
            }
        ];
    }

    loadRecentFiles() {
        // 从本地存储加载最近文件
        const stored = localStorage.getItem('recentFiles');
        if (stored) {
            this.recentFiles = JSON.parse(stored);
            this.renderRecentFiles();
        }
    }

    addToRecentFiles(filePath) {
        const fileInfo = {
            path: filePath,
            name: this.getFileName(filePath),
            date: new Date().toISOString(),
            type: this.getFileType(filePath)
        };

        // 移除已存在的相同文件
        this.recentFiles = this.recentFiles.filter(file => file.path !== filePath);
        
        // 添加到列表开头
        this.recentFiles.unshift(fileInfo);
        
        // 限制最多保存20个文件
        if (this.recentFiles.length > 20) {
            this.recentFiles = this.recentFiles.slice(0, 20);
        }

        // 保存到本地存储
        localStorage.setItem('recentFiles', JSON.stringify(this.recentFiles));
        
        // 更新显示
        this.renderRecentFiles();
    }

    renderRecentFiles() {
        if (this.recentFiles.length === 0) {
            document.getElementById('recentFilesSection').style.display = 'none';
            return;
        }

        document.getElementById('recentFilesSection').style.display = 'block';
        this.renderFileList('recentFileList', this.recentFiles, 'recent');
    }

    renderFileList(containerId, files, type) {
        const container = document.getElementById(containerId);
        const template = document.getElementById('fileItemTemplate');
        
        // 清空容器
        container.innerHTML = '';

        files.forEach((file, index) => {
            const clone = template.content.cloneNode(true);
            const fileItem = clone.querySelector('.file-item');
            
            // 设置文件路径
            fileItem.setAttribute('data-file-path', file.path);
            fileItem.style.setProperty('--item-index', index);
            
            // 设置文件信息
            fileItem.querySelector('.file-name').textContent = file.name;
            fileItem.querySelector('.file-size').textContent = file.size || this.formatFileSize(file.size);
            fileItem.querySelector('.file-date').textContent = this.formatDate(file.date);
            
            // 设置文件图标
            const fileIcon = fileItem.querySelector('.file-icon svg');
            this.setFileIcon(fileIcon, file.type || this.getFileType(file.path));
            
            // 设置点击事件
            const openBtn = fileItem.querySelector('.file-actions .btn-icon:first-child');
            const removeBtn = fileItem.querySelector('.file-actions .btn-icon:last-child');
            
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openFileFromList(file.path);
            });
            
            if (type === 'recent') {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeFromRecentFiles(file.path);
                });
            } else {
                removeBtn.style.display = 'none';
            }
            
            // 整个文件项点击事件
            fileItem.addEventListener('click', () => {
                this.openFileFromList(file.path);
            });
            
            container.appendChild(clone);
        });
    }

    async openFileFromList(filePath) {
        try {
            this.updateStatus('正在打开文件...');
            await this.handleFileOpened(filePath);
        } catch (error) {
            this.showError('打开文件失败: ' + error.message);
        }
    }

    removeFromRecentFiles(filePath) {
        this.recentFiles = this.recentFiles.filter(file => file.path !== filePath);
        localStorage.setItem('recentFiles', JSON.stringify(this.recentFiles));
        this.renderRecentFiles();
    }

    clearRecentFiles() {
        this.recentFiles = [];
        localStorage.removeItem('recentFiles');
        this.renderRecentFiles();
        this.updateStatus('已清空最近文件记录');
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

    setFileIcon(svgElement, fileType) {
        const iconPaths = {
            pdf: "M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z",
            word: "M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z",
            text: "M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z",
            file: "M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"
        };
        
        const path = svgElement.querySelector('path');
        if (path) {
            path.setAttribute('d', iconPaths[fileType] || iconPaths.file);
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return date.toLocaleDateString('zh-CN');
        }
    }

    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }

    showError(message) {
        console.error(message);
        this.updateStatus('错误: ' + message);
        
        // 可以添加更友好的错误提示
        setTimeout(() => {
            this.updateStatus('就绪');
        }, 3000);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new MainApp();
});
