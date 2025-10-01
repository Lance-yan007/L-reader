const { ipcRenderer } = require('electron');

class ReaderApp {
    constructor() {
        this.currentFile = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.zoomLevel = 1;
        this.selectedText = '';
        this.highlights = [];
        this.bookmarks = [];
        this.notes = [];
        this.translations = [];
        this.isSidebarCollapsed = false;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadTranslations();
        this.updateStatus('就绪');
    }

    bindEvents() {
        // 返回主界面
        document.getElementById('backToMainBtn').addEventListener('click', () => {
            this.goBackToMain();
        });

        // 缩放控制
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            this.zoomOut();
        });

        // 全屏切换
        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // 侧边栏切换
        document.getElementById('toggleSidebarBtn').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // 侧边栏标签页
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 文本选择事件
        document.addEventListener('mouseup', (e) => {
            this.handleTextSelection();
        });

        // 翻译相关事件
        document.getElementById('translateBtn').addEventListener('click', () => {
            this.showTranslationModal();
        });

        document.getElementById('closeTranslationModal').addEventListener('click', () => {
            this.hideTranslationModal();
        });

        document.getElementById('saveTranslationBtn').addEventListener('click', () => {
            this.saveTranslation();
        });

        document.getElementById('copyTranslationBtn').addEventListener('click', () => {
            this.copyTranslation();
        });

        // 注释相关事件
        document.getElementById('addNoteBtn').addEventListener('click', () => {
            this.showNoteModal();
        });

        document.getElementById('closeNoteModal').addEventListener('click', () => {
            this.hideNoteModal();
        });

        document.getElementById('saveNoteBtn').addEventListener('click', () => {
            this.saveNote();
        });

        document.getElementById('cancelNoteBtn').addEventListener('click', () => {
            this.hideNoteModal();
        });

        // 高亮按钮
        document.getElementById('highlightBtn').addEventListener('click', () => {
            this.addHighlight();
        });

        // IPC事件监听
        ipcRenderer.on('file-opened', (event, filePath) => {
            console.log('阅读器窗口接收到文件路径:', filePath);
            this.loadFile(filePath);
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }

    async loadFile(filePath) {
        try {
            console.log('开始加载文件:', filePath);
            this.updateStatus('正在加载文件...');
            this.showLoading(true);
            
            this.currentFile = filePath;
            this.updateFileName(this.getFileName(filePath));
            
            // 根据文件类型加载不同的内容
            const fileType = this.getFileType(filePath);
            console.log('检测到文件类型:', fileType);
            
            switch (fileType) {
                case 'pdf':
                    console.log('加载PDF文件');
                    await this.loadPDF(filePath);
                    break;
                case 'docx':
                case 'doc':
                    console.log('加载Word文件');
                    await this.loadWord(filePath);
                    break;
                case 'txt':
                    console.log('加载文本文件');
                    await this.loadText(filePath);
                    break;
                default:
                    console.log('不支持的文件格式:', fileType);
                    throw new Error('不支持的文件格式: ' + fileType);
            }
            
            this.loadTranslations();
            this.updateStatus('文件加载完成');
            console.log('文件加载完成');
        } catch (error) {
            console.error('文件加载失败:', error);
            this.showError('加载文件失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    async loadPDF(filePath) {
        try {
            // 动态加载PDF.js
            const pdfjsLib = await this.loadPDFJS();
            
            // 读取PDF文件
            const result = await ipcRenderer.invoke('read-file', filePath);
            if (!result.success) {
                throw new Error(result.error);
            }
            
            // 加载PDF文档
            const loadingTask = pdfjsLib.getDocument({
                data: result.data,
                cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
                cMapPacked: true,
                disableAutoFetch: true,
                disableStream: true,
                disableRange: true
            });
            
            const pdf = await loadingTask.promise;
            this.totalPages = pdf.numPages;
            this.updatePageInfo();
            
            // 渲染第一页
            await this.renderPDFPage(pdf, 1);
            
        } catch (error) {
            console.error('PDF加载失败:', error);
            // 显示错误信息
            const container = document.getElementById('documentContainer');
            container.innerHTML = `
                <div style="max-width: 800px; margin: 0 auto; padding: 40px; background: white; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 8px; text-align: center;">
                    <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e0e0e0;">
                        <h2 style="color: #e74c3c; margin-bottom: 8px;">❌ PDF加载失败</h2>
                        <p style="color: #7f8c8d; font-size: 14px;">文件: ${this.getFileName(filePath)}</p>
                    </div>
                    <div style="margin-top: 20px; color: #2c3e50;">
                        <p>错误信息: ${error.message}</p>
                        <p style="margin-top: 10px; font-size: 14px; color: #7f8c8d;">
                            请确保文件是有效的PDF格式，或者尝试重新打开文件。
                        </p>
                    </div>
                </div>
            `;
        }
    }

    async loadPDFJS() {
        // 动态加载PDF.js
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '../node_modules/pdfjs-dist/build/pdf.min.js';
            script.onload = () => {
                if (window.pdfjsLib) {
                    // 配置PDF.js Worker
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';
                    resolve(window.pdfjsLib);
                } else {
                    reject(new Error('PDF.js加载失败'));
                }
            };
            script.onerror = () => reject(new Error('PDF.js脚本加载失败'));
            document.head.appendChild(script);
        });
    }

    async renderPDFPage(pdf, pageNum) {
        try {
            const page = await pdf.getPage(pageNum);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            const container = document.getElementById('documentContainer');
            container.innerHTML = `
                <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
                    <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #4A90E2;">
                        <h2 style="color: #2c3e50; margin-bottom: 8px;">📄 ${this.getFileName(this.currentFile)}</h2>
                        <p style="color: #7f8c8d; font-size: 14px;">PDF文档 - 第${pageNum}页，共${this.totalPages}页</p>
                    </div>
                    <div class="pdf-page" style="text-align: center; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden;">
                        ${canvas.outerHTML}
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('PDF页面渲染失败:', error);
            throw error;
        }
    }

    async loadWord(filePath) {
        // 这里应该使用mammoth.js来解析Word文档
        const container = document.getElementById('documentContainer');
        container.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding: 40px; background: white; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                <h2>Word文档内容</h2>
                <p>文件: ${this.getFileName(filePath)}</p>
                <div style="margin-top: 20px; line-height: 1.8; font-size: 16px;">
                    <p>这里将显示Word文档的转换内容。支持文本选择、高亮和翻译功能。</p>
                    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                    <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                </div>
            </div>
        `;
        
        this.totalPages = 1;
        this.updatePageInfo();
    }

    async loadText(filePath) {
        try {
            console.log('开始读取文本文件:', filePath);
            const result = await ipcRenderer.invoke('read-file', filePath);
            console.log('文件读取结果:', result);
            
            if (result.success) {
                const text = result.data.toString('utf8');
                console.log('文本内容长度:', text.length);
                
                const container = document.getElementById('documentContainer');
                console.log('文档容器元素:', container);
                
                if (container) {
                    container.innerHTML = `
                        <div style="max-width: 800px; margin: 0 auto; padding: 40px; background: white; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 8px;">
                            <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e0e0e0;">
                                <h2 style="color: #2c3e50; margin-bottom: 8px;">📄 ${this.getFileName(filePath)}</h2>
                                <p style="color: #7f8c8d; font-size: 14px;">文本文件</p>
                            </div>
                            <div style="margin-top: 20px; line-height: 1.8; font-size: 16px; white-space: pre-wrap; color: #2c3e50; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                                ${text}
                            </div>
                        </div>
                    `;
                    console.log('文本内容已渲染到DOM');
                } else {
                    console.error('找不到documentContainer元素');
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('读取文本文件失败:', error);
            throw new Error('读取文本文件失败: ' + error.message);
        }
        
        this.totalPages = 1;
        this.updatePageInfo();
    }

    handleTextSelection() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        if (text.length > 0) {
            this.selectedText = text;
            this.showHighlightTools();
        } else {
            this.hideHighlightTools();
        }
    }

    showHighlightTools() {
        const tools = document.getElementById('highlightTools');
        tools.style.display = 'flex';
    }

    hideHighlightTools() {
        const tools = document.getElementById('highlightTools');
        tools.style.display = 'none';
    }

    async showTranslationModal() {
        if (!this.selectedText) {
            this.showError('请先选择要翻译的文本');
            return;
        }

        document.getElementById('originalText').textContent = this.selectedText;
        document.getElementById('translatedText').textContent = '正在翻译...';
        
        const modal = document.getElementById('translationModal');
        modal.style.display = 'flex';

        try {
            // 这里应该调用AI翻译API
            const translation = await this.translateText(this.selectedText);
            document.getElementById('translatedText').textContent = translation;
        } catch (error) {
            document.getElementById('translatedText').textContent = '翻译失败: ' + error.message;
        }
    }

    hideTranslationModal() {
        const modal = document.getElementById('translationModal');
        modal.style.display = 'none';
    }

    async translateText(text) {
        // 模拟AI翻译
        // 实际实现中应该调用Claude或Gemini API
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve('这是翻译结果: ' + text);
            }, 1000);
        });
    }

    async saveTranslation() {
        const originalText = document.getElementById('originalText').textContent;
        const translatedText = document.getElementById('translatedText').textContent;
        
        if (!originalText || !translatedText) {
            this.showError('翻译内容不完整');
            return;
        }

        try {
            const translationData = {
                filePath: this.currentFile,
                originalText: originalText,
                translatedText: translatedText,
                page: this.currentPage,
                timestamp: new Date().toISOString()
            };

            const result = await ipcRenderer.invoke('save-translation', translationData);
            
            if (result.success) {
                this.translations.push(translationData);
                this.updateTranslationsList();
                this.hideTranslationModal();
                this.updateStatus('翻译已保存');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showError('保存翻译失败: ' + error.message);
        }
    }

    copyTranslation() {
        const translatedText = document.getElementById('translatedText').textContent;
        navigator.clipboard.writeText(translatedText).then(() => {
            this.updateStatus('翻译已复制到剪贴板');
        }).catch(() => {
            this.showError('复制失败');
        });
    }

    showNoteModal() {
        if (!this.selectedText) {
            this.showError('请先选择要注释的文本');
            return;
        }

        document.getElementById('selectedTextForNote').textContent = this.selectedText;
        document.getElementById('noteTextarea').value = '';
        
        const modal = document.getElementById('noteModal');
        modal.style.display = 'flex';
    }

    hideNoteModal() {
        const modal = document.getElementById('noteModal');
        modal.style.display = 'none';
    }

    saveNote() {
        const selectedText = document.getElementById('selectedTextForNote').textContent;
        const noteText = document.getElementById('noteTextarea').value.trim();
        
        if (!noteText) {
            this.showError('请输入注释内容');
            return;
        }

        const note = {
            id: Date.now(),
            selectedText: selectedText,
            noteText: noteText,
            page: this.currentPage,
            timestamp: new Date().toISOString()
        };

        this.notes.push(note);
        this.updateNotesList();
        this.hideNoteModal();
        this.updateStatus('注释已保存');
    }

    addHighlight() {
        if (!this.selectedText) {
            this.showError('请先选择要高亮的文本');
            return;
        }

        const highlight = {
            id: Date.now(),
            text: this.selectedText,
            page: this.currentPage,
            timestamp: new Date().toISOString()
        };

        this.highlights.push(highlight);
        this.updateStatus('已添加高亮');
        
        // 这里应该实际高亮显示选中的文本
        this.highlightSelectedText();
    }

    highlightSelectedText() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = 'text-highlight';
            span.style.backgroundColor = 'rgba(255, 235, 59, 0.6)';
            
            try {
                range.surroundContents(span);
            } catch (e) {
                // 如果无法包围内容，则插入高亮标记
                span.textContent = selection.toString();
                range.deleteContents();
                range.insertNode(span);
            }
        }
    }

    async loadTranslations() {
        if (!this.currentFile) return;

        try {
            const result = await ipcRenderer.invoke('get-translations', this.currentFile);
            if (result.success) {
                this.translations = result.data;
                this.updateTranslationsList();
            }
        } catch (error) {
            console.error('加载翻译记录失败:', error);
        }
    }

    updateTranslationsList() {
        const container = document.getElementById('translationsList');
        container.innerHTML = '';

        this.translations.forEach(translation => {
            const item = document.createElement('div');
            item.className = 'translation-item';
            item.innerHTML = `
                <div class="translation-original">${translation.originalText}</div>
                <div class="translation-result">${translation.translatedText}</div>
                <div class="translation-meta">
                    <span class="translation-date">${this.formatDate(translation.timestamp)}</span>
                    <span class="translation-page">第${translation.page}页</span>
                </div>
            `;
            container.appendChild(item);
        });
    }

    updateNotesList() {
        const container = document.getElementById('notesList');
        container.innerHTML = '';

        this.notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item';
            item.innerHTML = `
                <div class="note-text">${note.noteText}</div>
                <div class="note-meta">
                    <span class="note-date">${this.formatDate(note.timestamp)}</span>
                    <span class="note-page">第${note.page}页</span>
                </div>
            `;
            container.appendChild(item);
        });
    }

    switchTab(tabName) {
        // 更新标签按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 更新面板显示
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}Panel`).classList.add('active');
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        this.isSidebarCollapsed = !this.isSidebarCollapsed;
        
        if (this.isSidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel + 0.1, 3);
        this.applyZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5);
        this.applyZoom();
    }

    applyZoom() {
        const container = document.getElementById('documentContainer');
        container.style.transform = `scale(${this.zoomLevel})`;
        container.style.transformOrigin = 'top center';
        
        document.getElementById('zoomLevel').textContent = Math.round(this.zoomLevel * 100) + '%';
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    goBackToMain() {
        // 这里应该返回到主窗口
        // 实际实现中可能需要关闭当前窗口或切换到主窗口
        window.close();
    }

    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '=':
                case '+':
                    e.preventDefault();
                    this.zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    this.zoomOut();
                    break;
                case '0':
                    e.preventDefault();
                    this.zoomLevel = 1;
                    this.applyZoom();
                    break;
            }
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    updateFileName(name) {
        document.getElementById('currentFileName').textContent = name;
    }

    updatePageInfo() {
        document.getElementById('pageInfo').textContent = `第 ${this.currentPage} 页，共 ${this.totalPages} 页`;
    }

    updateStatus(message) {
        document.getElementById('fileStatus').textContent = message;
    }

    showError(message) {
        console.error(message);
        this.updateStatus('错误: ' + message);
        
        setTimeout(() => {
            this.updateStatus('就绪');
        }, 3000);
    }

    getFileName(filePath) {
        return filePath.split('/').pop() || filePath.split('\\').pop();
    }

    getFileType(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const typeMap = {
            'pdf': 'pdf',
            'doc': 'docx',
            'docx': 'docx',
            'txt': 'txt'
        };
        return typeMap[ext] || 'txt';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
}

// 初始化阅读器应用
document.addEventListener('DOMContentLoaded', () => {
    new ReaderApp();
});
