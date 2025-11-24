console.log('✅ Reader script loaded (Version: cachebust1)');
let ipcRenderer;
try {
    // Try to load from Electron
    if (window.require && window.require.name !== 'require') { // Check if it's real Electron require or our mock? 
        // Actually, our mock require works fine.
        const electron = require('electron');
        ipcRenderer = electron.ipcRenderer;
    } else {
        throw new Error('Not in Electron');
    }
} catch (e) {
    // Fallback to window.ipcRenderer (Web Adapter)
    ipcRenderer = window.ipcRenderer;
}

if (!ipcRenderer) {
    console.error('ipcRenderer not found. Ensure web-adapter.js is loaded.');
}

// Always listen for messages from parent window if we are in an iframe (Web Mode)
if (window.self !== window.top || window.ipcRenderer) {
    console.log('🎧 Initializing iframe message listener');
    window.addEventListener('message', (event) => {
        if (event.data && event.data.channel) {
            const { channel, args } = event.data;
            console.log('[Reader] Received postMessage:', channel, args);

            // Dispatch custom event that ipcAdapter.on() listens for
            window.dispatchEvent(new CustomEvent(`ipc-${channel}`, {
                detail: args || []
            }));
        }
    });

    // Send ready signal to parent
    if (window.parent && window.parent !== window) {
        console.log('👋 Sending reader-ready signal to parent');
        window.parent.postMessage({ channel: 'reader-ready' }, '*');
    }
}

class ReaderApp {
    constructor() {
        this.currentFile = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.zoomLevel = 1;
        this.minZoom = 0.2;
        this.maxZoom = 2.0;
        this.zoomStep = 0.05; // 降低缩放速度，从0.1改为0.05
        this.selectedText = '';
        this.highlights = [];
        this.bookmarks = [];
        this.notes = [];
        this.translations = [];
        this.isSidebarCollapsed = false;
        this.isEmbedded = false;

        // 点词翻译相关状态
        this.wordTranslateMode = false; // 是否开启点词翻译模式
        this.wordTranslationMap = new Map(); // 单词翻译映射表 word -> {translation, positions}
        this.sentenceTranslationMap = new Map(); // 句子翻译映射表 highlightId -> translation
        this.highlightedWords = new Set(); // 已高亮的单词集合
        this.wordTooltip = null; // 悬浮框DOM元素
        this.currentHoverWord = null; // 当前hover的单词
        this.contextMenu = null; // 右键菜单DOM元素
        this.currentContextTarget = null; // 当前右键点击的元素
        this.currentSelection = null; // 当前文本选择对象

        // 默认高亮颜色（紫色）- 会随着用户选择颜色而更新
        this.defaultHighlightColor = '#CDBBEB';

        // Gemini API配置
        this.geminiApiKey = 'AIzaSyCqcvZmcr1-BbAthoDVIvotcjM2gANMklY';
        // 使用Gemini 2.0 Flash模型 - 快速且稳定
        this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';

        // API请求限流器配置（免费层：15次/分钟）
        this.apiRequestQueue = []; // 请求时间戳队列
        this.maxRequestsPerMinute = 12; // 设置为12次以留出余量
        this.requestDelayMs = 5000; // 两次请求之间最小间隔5秒
        this.lastRequestTime = 0; // 上次请求时间

        // 撤销/重做和保存功能
        this.historyStack = []; // 历史记录栈
        this.historyIndex = -1; // 当前历史位置
        this.maxHistorySize = 50; // 最大历史记录数
        this.isDirty = false; // 是否有未保存的修改
        this.lastSavedState = null; // 上次保存的状态
        this.isClosing = false; // 是否正在关闭

        // AI对话功能
        this.pdfDocument = null; // PDF文档对象
        this.aiChatMessages = []; // 对话历史
        this.isAiChatOpen = false; // 对话面板是否打开

        // 订阅管理
        this.subscriptionHelper = null; // 订阅助手实例
        this.currentUserId = null; // 当前用户ID

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadTranslations();
        this.updateStatus('就绪');
        this.initWordTooltip(); // 初始化悬浮框
        this.initContextMenu(); // 初始化右键菜单
        this.resetHistory();
        this.initAiChat(); // 初始化AI对话功能
        this.initSubscriptionHelper(); // 初始化订阅助手
    }

    /**
     * 初始化订阅助手
     */
    async initSubscriptionHelper() {
        console.log('Web版本：跳过订阅助手初始化');
        this.subscriptionHelper = {
            checkSubscription: async () => ({ isSubscribed: true, plan: 'pro' }),
            getSubscriptionStatus: async () => ({ isSubscribed: true, plan: 'pro' })
        };
    }

    bindEvents() {
        // 返回主界面
        const backBtn = document.getElementById('backToMainBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.goBackToMain();
            });
        }

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

        // 点词翻译按钮
        document.getElementById('wordTranslateBtn').addEventListener('click', () => {
            this.toggleWordTranslateMode();
        });

        // 撤销按钮
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.undo();
            });
        }

        // 重做按钮
        const redoBtn = document.getElementById('redoBtn');
        if (redoBtn) {
            redoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.redo();
            });
        }

        // 保存按钮
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveDocument();
            });
        }


        // 保存确认对话框按钮
        document.getElementById('saveConfirmSave').addEventListener('click', () => {
            this.handleSaveConfirm('save');
        });

        document.getElementById('saveConfirmDontSave').addEventListener('click', () => {
            this.handleSaveConfirm('dontSave');
        });

        document.getElementById('saveConfirmCancel').addEventListener('click', () => {
            this.handleSaveConfirm('cancel');
        });

        // IPC事件监听
        ipcRenderer.on('set-embed-mode', (_event, payload = {}) => {
            if (payload && payload.embedded) {
                this.enableEmbeddedMode();
            }
        });

        ipcRenderer.on('file-opened', (event, filePath) => {
            console.log('阅读器窗口接收到文件路径:', filePath);
            this.loadFile(filePath);
        });

        // 缩放事件监听
        this.bindZoomEvents();

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);

            // F12 或 Ctrl+Shift+I / Cmd+Option+I 打开开发者工具
            if (e.key === 'F12' ||
                (e.key === 'I' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
                (e.key === 'I' && (e.metaKey || e.ctrlKey) && e.altKey)) {
                e.preventDefault();
                if (window.require) {
                    const { remote } = window.require('electron');
                    const currentWindow = remote.getCurrentWindow();
                    if (currentWindow && currentWindow.webContents) {
                        currentWindow.webContents.openDevTools();
                    }
                }
            }
        });
    }

    bindZoomEvents() {
        const documentContainer = document.getElementById('documentContainer');
        if (!documentContainer) return;

        // 鼠标滚轮缩放（Ctrl + 滚轮）
        documentContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.zoomIn();
                } else {
                    this.zoomOut();
                }
            }
        });

        // 触控板双指缩放 - 直接映射，最平滑方案
        let initialDistance = null;
        let initialZoomLevel = 1;
        let isZooming = false;
        const SCALE_SENSITIVITY = 0.002; // 手势敏感度

        documentContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                isZooming = true;
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );
                initialZoomLevel = this.zoomLevel; // 记录初始缩放级别
                e.preventDefault();
            }
        });

        documentContainer.addEventListener('touchmove', (e) => {
            if (isZooming && e.touches.length === 2 && initialDistance) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );

                // 计算距离变化的比例
                const distanceRatio = currentDistance / initialDistance;

                // 关键：使用线性映射，而不是直接乘法
                const scaleChange = (distanceRatio - 1) * SCALE_SENSITIVITY * initialZoomLevel;
                const newZoomLevel = initialZoomLevel + scaleChange;

                // 限制缩放范围
                const clampedZoomLevel = Math.max(this.minZoom, Math.min(newZoomLevel, this.maxZoom));

                // 直接设置缩放级别，避免使用zoomIn/zoomOut
                this.zoomLevel = clampedZoomLevel;
                this.applyZoom();

                e.preventDefault();
            }
        });

        documentContainer.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                isZooming = false;
                initialDistance = null;
            }
        });

        // 键盘快捷键缩放
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                if (e.key === '+' || e.key === '=') {
                    e.preventDefault();
                    this.zoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    this.zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    this.resetZoom();
                }
            }
        });
    }

    async loadFile(filePath) {
        try {
            console.log('开始加载文件:', filePath);
            this.updateStatus('正在加载文件...');
            this.showLoading(true);

            this.resetHistory();

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

            // 加载已保存的标注数据
            await this.loadAnnotations();

            this.updateStatus('文件加载完成');
            console.log('文件加载完成');
        } catch (error) {
            console.error('文件加载失败:', error);
            this.showError('加载文件失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * 加载已保存的标注数据
     */
    async loadAnnotations() {
        if (!this.currentFile) return;

        try {
            const result = await ipcRenderer.invoke('load-annotations', this.currentFile);

            if (result.success && result.data) {
                console.log('📂 加载已保存的标注:', result.data);

                // 等待一小段时间确保DOM已渲染
                await new Promise(resolve => setTimeout(resolve, 500));

                // 清除所有现有的高亮和下划线，避免重复
                this.clearAllHighlights();

                // 恢复高亮和翻译数据
                if (result.data.highlights && result.data.highlights.length > 0) {
                    result.data.highlights.forEach(highlight => {
                        const spans = [];

                        // 支持新旧两种格式
                        if (highlight.spanIndices && Array.isArray(highlight.spanIndices)) {
                            // 新格式：spanIndices数组
                            highlight.spanIndices.forEach(spanIndex => {
                                const span = this.findSpanByPosition(highlight.pageIndex, spanIndex);
                                if (span) {
                                    spans.push(span);
                                }
                            });
                        } else if (highlight.spanIndex !== undefined) {
                            // 旧格式：单个spanIndex
                            const span = this.findSpanByPosition(highlight.pageIndex, highlight.spanIndex);
                            if (span) {
                                spans.push(span);
                            }
                        }

                        // 为所有span设置高亮属性（但不设置backgroundColor，由unified-highlight div处理）
                        spans.forEach(span => {
                            span.dataset.highlightId = highlight.highlightId;
                            if (highlight.highlightColor) {
                                span.dataset.highlightColor = highlight.highlightColor;
                            }
                            // 不设置span.style.backgroundColor，避免重复高亮
                            // 背景颜色由unified-highlight div显示
                            const word = this.extractWord(span.textContent);
                            if (word) {
                                this.highlightedWords.add(word.toLowerCase());
                            }
                        });

                        // 重建统一高亮背景（这是唯一的高亮层）
                        if (spans.length > 0) {
                            this.createUnifiedHighlight(
                                spans,
                                highlight.color || 'rgba(255, 255, 200, 0.6)',
                                highlight.highlightId
                            );
                        }
                    });

                    console.log(`✅ 恢复了 ${result.data.highlights.length} 个高亮组`);
                }

                // 恢复下划线
                if (result.data.underlines && result.data.underlines.length > 0) {
                    console.log('📂 开始恢复下划线，数量:', result.data.underlines.length);
                    result.data.underlines.forEach((underline, index) => {
                        const spans = [];

                        console.log(`📂 恢复下划线 ${index + 1}:`, underline);

                        if (underline.spanIndices && Array.isArray(underline.spanIndices)) {
                            underline.spanIndices.forEach(spanIndex => {
                                const span = this.findSpanByPosition(underline.pageIndex, spanIndex);
                                if (span) {
                                    spans.push(span);
                                } else {
                                    console.warn(`⚠️ 找不到span: pageIndex=${underline.pageIndex}, spanIndex=${spanIndex}`);
                                }
                            });
                        }

                        console.log(`📂 找到 ${spans.length} 个span用于下划线 ${index + 1}`);

                        // 为所有span设置下划线属性
                        spans.forEach(span => {
                            span.dataset.underlineId = underline.underlineId;
                            span.classList.add('word-underlined');
                        });

                        // 重建统一下划线
                        if (spans.length > 0) {
                            console.log(`📂 创建统一下划线: underlineId=${underline.underlineId}, spans=${spans.length}`);
                            this.createUnifiedUnderline(spans, underline.underlineId);
                        } else {
                            console.warn(`⚠️ 下划线 ${index + 1} 没有找到任何span，无法创建`);
                        }
                    });

                    console.log(`✅ 恢复了 ${result.data.underlines.length} 个下划线组`);
                } else {
                    console.log('📂 没有下划线数据需要恢复');
                }

                // 恢复翻译数据
                if (result.data.wordTranslations) {
                    Object.keys(result.data.wordTranslations).forEach(key => {
                        this.wordTranslationMap.set(key, result.data.wordTranslations[key]);
                    });
                }

                if (result.data.sentenceTranslations) {
                    Object.keys(result.data.sentenceTranslations).forEach(key => {
                        this.sentenceTranslationMap.set(key, result.data.sentenceTranslations[key]);
                    });
                }

                // 保存为初始状态
                this.lastSavedState = this.getCurrentState();
                this.isDirty = false;

                this.updateStatus('标注已加载');
            }

            // 将当前状态视为最新的已保存状态，并清空历史记录
            this.lastSavedState = this.getCurrentState();
            this.resetHistory(false);
        } catch (error) {
            console.error('❌ 加载标注失败:', error);
        }
    }

    async loadPDF(filePath) {
        try {
            console.log('开始加载PDF.js库...');
            // 动态加载PDF.js
            const pdfjsLib = await this.loadPDFJS();
            console.log('PDF.js库加载成功');

            // 读取PDF文件
            console.log('开始读取PDF文件...');
            const result = await ipcRenderer.invoke('read-file', filePath);
            console.log('PDF文件读取结果:', result.success ? '成功' : '失败');

            if (!result.success) {
                throw new Error(result.error);
            }

            console.log('PDF文件大小:', result.data.length, 'bytes');

            // 加载PDF文档
            console.log('开始解析PDF文档...');
            const loadingTask = pdfjsLib.getDocument({
                data: result.data,
                cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
                cMapPacked: true,
                disableAutoFetch: true,
                disableStream: true,
                disableRange: true
            });

            const pdf = await loadingTask.promise;
            console.log('PDF文档解析成功，页数:', pdf.numPages);

            // 存储PDF文档对象，供AI对话功能使用
            this.pdfDocument = pdf;

            this.totalPages = pdf.numPages;
            this.updatePageInfo();

            // 渲染所有页面
            console.log('开始渲染PDF所有页面...');
            await this.renderAllPDFPages(pdf);
            console.log('PDF所有页面渲染完成');

            // 显示AI对话按钮
            this.showAiChatButton();

        } catch (error) {
            console.error('PDF加载失败:', error);
            console.error('错误堆栈:', error.stack);

            // 显示错误信息
            const container = document.getElementById('documentContainer');
            if (container) {
                container.innerHTML = `
                    <div style="max-width: 800px; margin: 0 auto; padding: 40px; background: white; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 8px; text-align: center;">
                        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e0e0e0;">
                            <h2 style="color: #e74c3c; margin-bottom: 8px;">❌ PDF加载失败</h2>
                            <p style="color: #7f8c8d; font-size: 14px;">文件: ${this.getFileName(filePath)}</p>
                        </div>
                        <div style="margin-top: 20px; color: #2c3e50;">
                            <p><strong>错误信息:</strong> ${error.message}</p>
                            <p style="margin-top: 10px; font-size: 14px; color: #7f8c8d;">
                                请确保文件是有效的PDF格式，或者尝试重新打开文件。
                            </p>
                            <details style="margin-top: 20px; text-align: left;">
                                <summary style="cursor: pointer; color: #4A90E2;">查看详细错误信息</summary>
                                <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 12px; overflow: auto;">${error.stack}</pre>
                            </details>
                        </div>
                    </div>
                `;
            } else {
                console.error('找不到documentContainer元素');
            }
        }
    }

    async renderAllPDFPages(pdf) {
        try {
            const container = document.getElementById('documentContainer');
            if (!container) {
                throw new Error('找不到documentContainer元素');
            }

            // 清空容器
            container.innerHTML = '';

            // 🔧 确保清理所有旧的文本层
            const oldTextLayers = document.querySelectorAll('.pdf-text-layer');
            oldTextLayers.forEach(layer => layer.remove());
            console.log('🧹 清理了', oldTextLayers.length, '个旧的文本层');

            // 创建包装div
            const wrapper = document.createElement('div');
            wrapper.className = 'pdf-wrapper';
            wrapper.style.cssText = 'padding: 20px; background: #f8f9fa; min-height: 100vh; width: 100%; overflow: visible; position: relative; display: block; text-align: center;';

            // 创建标题
            const title = document.createElement('h2');
            title.textContent = `📄 ${this.getFileName(this.currentFile)}`;
            title.style.cssText = 'color: #2c3e50; margin-bottom: 20px; text-align: center;';

            // 创建页面信息
            const pageInfo = document.createElement('p');
            pageInfo.textContent = `PDF文档 - 共${this.totalPages}页`;
            pageInfo.style.cssText = 'text-align: center; color: #666; margin-bottom: 20px;';

            wrapper.appendChild(title);
            wrapper.appendChild(pageInfo);

            // 创建一个包含所有Canvas的整体容器
            const allPagesContainer = document.createElement('div');
            allPagesContainer.className = 'all-pages-container';
            allPagesContainer.style.cssText = 'display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-start; gap: 10px; width: 100%;';

            // 渲染所有页面到整体容器中
            for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
                console.log(`渲染第${pageNum}页...`);
                const pageCanvas = await this.renderSinglePDFPage(pdf, pageNum);

                // 创建单个页面包装容器
                const pageWrapper = document.createElement('div');
                pageWrapper.className = 'page-wrapper';
                pageWrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; margin-bottom: 20px; flex-shrink: 0;';

                // 创建页面标题
                const pageTitle = document.createElement('h3');
                pageTitle.textContent = `第 ${pageNum} 页`;
                pageTitle.style.cssText = 'color: #2c3e50; margin-bottom: 10px; font-size: 16px; text-align: center;';

                // 组装：标题 + pageCanvas (已包含Canvas和文本层)
                pageWrapper.appendChild(pageTitle);
                pageWrapper.appendChild(pageCanvas);

                // 添加到整体容器中
                allPagesContainer.appendChild(pageWrapper);

                console.log(`第${pageNum}页渲染完成`);
            }

            // 将整体容器添加到wrapper
            wrapper.appendChild(allPagesContainer);

            container.appendChild(wrapper);
            console.log('所有PDF页面已渲染到DOM');

            // 应用当前的缩放级别
            this.applyZoom();

            // 触发预翻译（可选，用于实现即点即显）
            setTimeout(() => {
                this.preTranslateDocument();
            }, 500);

        } catch (error) {
            console.error('渲染所有PDF页面失败:', error);
            throw error;
        }
    }

    async renderSinglePDFPage(pdf, pageNum) {
        try {
            console.log(`获取PDF页面: ${pageNum}`);
            const page = await pdf.getPage(pageNum);
            console.log(`页面${pageNum}获取成功，开始渲染...`);

            const scale = 2.0; // 提高缩放比例，增加清晰度
            const viewport = page.getViewport({ scale });
            console.log(`页面${pageNum}视口尺寸:`, viewport.width, 'x', viewport.height);

            // 保存页面的原始尺寸和缩放信息，用于坐标转换
            if (!this.pdfPageInfo) {
                this.pdfPageInfo = new Map();
            }
            this.pdfPageInfo.set(pageNum - 1, { // pageIndex从0开始
                viewport: viewport,
                scale: scale,
                width: page.view[2] - page.view[0], // PDF原始宽度
                height: page.view[3] - page.view[1] // PDF原始高度
            });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // 高DPI支持，提高清晰度
            const devicePixelRatio = window.devicePixelRatio || 1;
            const scaledViewport = page.getViewport({ scale: scale * devicePixelRatio });

            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            // 设置Canvas的显示尺寸（CSS像素）- 必须与文本层尺寸一致
            canvas.style.cssText = `
                width: ${viewport.width}px;
                height: ${viewport.height}px;
                display: block;
                position: absolute;
                left: 0;
                top: 0;
                z-index: 1;
            `;

            // 确保Canvas有正确的尺寸
            canvas.setAttribute('width', canvas.width);
            canvas.setAttribute('height', canvas.height);

            console.log(`页面${pageNum} Canvas尺寸:`, canvas.width, 'x', canvas.height);

            // 缩放Canvas上下文以支持高DPI
            context.scale(devicePixelRatio, devicePixelRatio);

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            console.log(`开始渲染页面${pageNum}到Canvas...`);
            const renderTask = page.render(renderContext);
            await renderTask.promise;
            console.log(`页面${pageNum} Canvas渲染完成`);

            // ========== 创建文本层（支持文本选择）==========
            console.log(`开始渲染页面${pageNum}的文本层...`);
            const textLayerDiv = await this.renderTextLayer(page, viewport);
            console.log(`页面${pageNum} 文本层渲染完成`);

            // ========== 组装双层结构 ==========
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.style.cssText = `
                position: relative;
                display: block;
                width: ${viewport.width}px;
                height: ${viewport.height}px;
                border: none;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                background: white;
            `;

            pageContainer.appendChild(canvas);      // 底层：Canvas图像
            pageContainer.appendChild(textLayerDiv); // 顶层：可选文本

            console.log(`📦 页面容器尺寸: ${viewport.width}x${viewport.height}`);
            console.log(`📦 Canvas显示尺寸: ${canvas.style.width} x ${canvas.style.height}`);
            console.log(`📦 文本层尺寸: ${textLayerDiv.style.width} x ${textLayerDiv.style.height}`);

            return pageContainer;

        } catch (error) {
            console.error(`渲染PDF页面${pageNum}失败:`, error);
            throw error;
        }
    }

    /**
     * 渲染PDF文本层（支持文本选择）- 使用Canvas精确测量
     * @param {Object} page - PDF页面对象
     * @param {Object} viewport - 视口对象
     * @returns {HTMLElement} 文本层div元素
     */
    async renderTextLayer(page, viewport) {
        // 创建文本层容器（样式由CSS控制）
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'pdf-text-layer';

        console.log(`📐 文本层基于viewport: ${viewport.width}x${viewport.height}`);

        // 创建Canvas测量上下文（用于精确测量文字宽度）
        const measureCanvas = document.createElement('canvas');
        const measureContext = measureCanvas.getContext('2d');

        try {
            // 提取PDF文本内容
            const textContent = await page.getTextContent();
            console.log(`📝 提取到 ${textContent.items.length} 个文本项`);

            let wordCount = 0;

            // 遍历每个文本项，按单词拆分并创建独立span
            textContent.items.forEach((item, index) => {
                // 跳过空文本
                if (!item.str || item.str.trim() === '') return;

                // 使用PDF.js的变换工具进行坐标转换
                const tx = window.pdfjsLib.Util.transform(
                    viewport.transform,
                    item.transform
                );

                // 计算字体大小和位置
                const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
                const fontHeight = item.height || fontSize;
                const itemWidth = item.width * viewport.scale;

                // 设置测量上下文的字体（必须与显示字体一致）
                measureContext.font = `${fontSize}px sans-serif`;

                // 测量整个item的实际渲染宽度
                const actualItemWidth = measureContext.measureText(item.str).width;

                // 计算缩放比例（PDF宽度 vs 实际渲染宽度）
                const widthScale = itemWidth / actualItemWidth;

                // 将文本按单词拆分（保留标点符号）
                const words = this.splitTextIntoWords(item.str);

                // 累积计算每个单词的位置
                let currentX = tx[4];  // 起始X位置

                words.forEach((wordInfo, wordIndex) => {
                    const { word, startIndex, endIndex } = wordInfo;

                    // 使用Canvas精确测量当前单词的实际宽度
                    const actualWordWidth = measureContext.measureText(word).width;

                    // 应用缩放比例得到PDF中的显示宽度
                    const displayWordWidth = actualWordWidth * widthScale;

                    // 创建单词span元素
                    const wordSpan = document.createElement('span');
                    wordSpan.textContent = word;
                    wordSpan.setAttribute('data-word', word);

                    // 计算精确的垂直位置（考虑圆角和视觉对齐）
                    // tx[5]是baseline位置，fontHeight是字体高度
                    // 使用更精确的对齐方式
                    const topPosition = tx[5] - fontHeight;

                    wordSpan.style.cssText = `
                        position: absolute;
                        left: ${currentX}px;
                        top: ${topPosition}px;
                        width: ${displayWordWidth}px;
                        height: ${fontHeight}px;
                        font-size: ${fontSize}px;
                        font-family: sans-serif;
                        color: transparent;
                        white-space: nowrap;
                        line-height: ${fontHeight}px;
                        transform-origin: 0% 0%;
                        user-select: text;
                        cursor: text;
                        display: inline-block;
                        vertical-align: baseline;
                    `;

                    // 🎯 绑定hover事件，用于显示翻译（不论是否在翻译模式）
                    wordSpan.addEventListener('mouseenter', this.handleWordHover.bind(this));
                    wordSpan.addEventListener('mouseleave', this.handleWordLeave.bind(this));

                    textLayerDiv.appendChild(wordSpan);
                    wordCount++;

                    // 累积X位置，为下一个单词做准备
                    currentX += displayWordWidth;
                });
            });

            // 绑定文本选择事件
            this.bindTextSelectionEvents(textLayerDiv);

            console.log(`✅ 文本层创建完成，共 ${wordCount} 个单词（Canvas精确测量）`);

        } catch (error) {
            console.error('渲染文本层失败:', error);
            // 即使失败也返回空的文本层，不影响PDF显示
        }

        return textLayerDiv;
    }

    /**
     * 将文本按单词拆分（保留标点符号）
     * @param {string} text - 原始文本
     * @returns {Array} - 单词数组，每个元素包含{word, startIndex, endIndex}
     */
    splitTextIntoWords(text) {
        const words = [];
        let currentWord = '';
        let startIndex = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // 判断是否为分隔符（空格、制表符等）
            if (/\s/.test(char)) {
                // 如果有累积的单词，保存它
                if (currentWord) {
                    words.push({
                        word: currentWord,
                        startIndex: startIndex,
                        endIndex: i
                    });
                    currentWord = '';
                }

                // 保存空格作为独立元素（用于保持布局）
                words.push({
                    word: char,
                    startIndex: i,
                    endIndex: i + 1
                });

                startIndex = i + 1;
            } else {
                // 累积字符到当前单词
                if (!currentWord) {
                    startIndex = i;
                }
                currentWord += char;
            }
        }

        // 保存最后一个单词
        if (currentWord) {
            words.push({
                word: currentWord,
                startIndex: startIndex,
                endIndex: text.length
            });
        }

        return words;
    }

    /**
     * 绑定文本选择事件
     * @param {HTMLElement} textLayerDiv - 文本层元素
     */
    bindTextSelectionEvents(textLayerDiv) {
        // 监听文本选择事件
        textLayerDiv.addEventListener('mouseup', () => {
            setTimeout(() => {
                this.handleTextSelection();
            }, 10);
        });
    }

    async loadPDFJS() {
        // 使用 PDFJSAdapter 从 CDN 加载 PDF.js
        if (window.PDFJSAdapter) {
            console.log('[Reader] Using PDFJSAdapter to load PDF.js from CDN');
            return await window.PDFJSAdapter.load();
        } else if (window.pdfjsLib) {
            console.log('[Reader] PDF.js already loaded');
            return window.pdfjsLib;
        } else {
            // Fallback: 动态加载PDF.js (仅用于Electron环境)
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
    }

    async renderPDFPage(pdf, pageNum) {
        try {
            console.log('获取PDF页面:', pageNum);
            const page = await pdf.getPage(pageNum);
            console.log('页面获取成功，开始渲染...');

            const scale = 2.0; // 提高缩放比例，增加清晰度
            const viewport = page.getViewport({ scale });
            console.log('视口尺寸:', viewport.width, 'x', viewport.height);

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // 高DPI支持，提高清晰度
            const devicePixelRatio = window.devicePixelRatio || 1;
            const scaledViewport = page.getViewport({ scale: scale * devicePixelRatio });

            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            // 设置Canvas的显示尺寸（CSS像素）
            canvas.style.width = viewport.width + 'px';
            canvas.style.height = viewport.height + 'px';

            // 强制设置Canvas的显示属性
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            canvas.style.opacity = '1';
            canvas.style.width = canvas.width + 'px';
            canvas.style.height = canvas.height + 'px';
            canvas.style.border = '1px solid #ccc';
            canvas.style.background = '#fff';
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';

            // 确保Canvas有正确的尺寸
            canvas.setAttribute('width', canvas.width);
            canvas.setAttribute('height', canvas.height);

            console.log('Canvas尺寸:', canvas.width, 'x', canvas.height);

            // 缩放Canvas上下文以支持高DPI
            context.scale(devicePixelRatio, devicePixelRatio);

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            console.log('开始渲染到Canvas...');
            const renderTask = page.render(renderContext);
            await renderTask.promise;
            console.log('Canvas渲染完成');

            // 验证Canvas是否有内容
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const hasContent = imageData.data.some(pixel => pixel !== 0);
            console.log('Canvas是否有内容:', hasContent);
            console.log('Canvas前几个像素:', Array.from(imageData.data.slice(0, 20)));

            // 强制刷新Canvas尺寸
            canvas.style.width = canvas.width + 'px';
            canvas.style.height = canvas.height + 'px';

            // 检查Canvas的显示属性
            console.log('Canvas display:', window.getComputedStyle(canvas).display);
            console.log('Canvas visibility:', window.getComputedStyle(canvas).visibility);
            console.log('Canvas opacity:', window.getComputedStyle(canvas).opacity);
            console.log('Canvas width/height:', canvas.width, 'x', canvas.height);
            console.log('Canvas offsetWidth/Height:', canvas.offsetWidth, 'x', canvas.offsetHeight);

            // 如果offsetWidth/Height还是0，强制设置
            if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
                console.log('Canvas尺寸为0，强制设置...');
                canvas.style.width = '918px';
                canvas.style.height = '1188px';
                canvas.style.minWidth = '918px';
                canvas.style.minHeight = '1188px';

                // 使用setTimeout延迟设置，确保DOM更新完成
                setTimeout(() => {
                    console.log('延迟设置Canvas尺寸...');
                    canvas.style.width = '918px';
                    canvas.style.height = '1188px';
                    canvas.style.display = 'block';
                    canvas.style.visibility = 'visible';
                    console.log('延迟设置后Canvas offsetWidth/Height:', canvas.offsetWidth, 'x', canvas.offsetHeight);
                }, 100);
            }

            const container = document.getElementById('documentContainer');
            console.log('文档容器元素:', container);

            if (container) {
                // 清空容器
                container.innerHTML = '';

                // 创建包装div
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'padding: 20px; background: #f8f9fa; min-height: 100vh;';

                // 创建标题
                const title = document.createElement('h2');
                title.textContent = `📄 ${this.getFileName(this.currentFile)}`;
                title.style.cssText = 'color: #2c3e50; margin-bottom: 20px; text-align: center;';

                // 创建内容区域
                const contentArea = document.createElement('div');
                contentArea.style.cssText = 'text-align: center; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);';

                // 创建页面信息
                const pageInfo = document.createElement('p');
                pageInfo.textContent = `PDF文档 - 第${pageNum}页，共${this.totalPages}页`;
                pageInfo.style.cssText = 'margin-bottom: 15px; color: #666;';

                // 创建Canvas容器
                const canvasContainer = document.createElement('div');
                canvasContainer.style.cssText = 'display: inline-block; border: none; border-radius: 8px; overflow: hidden;';

                // 直接插入Canvas对象（不使用outerHTML）
                canvasContainer.appendChild(canvas);

                // 组装DOM结构
                contentArea.appendChild(pageInfo);
                contentArea.appendChild(canvasContainer);
                wrapper.appendChild(title);
                wrapper.appendChild(contentArea);
                container.appendChild(wrapper);
                console.log('PDF内容已渲染到DOM');
                console.log('容器内容长度:', container.innerHTML.length);
                console.log('容器可见性:', window.getComputedStyle(container).display);
                console.log('容器高度:', container.offsetHeight);

                // 验证Canvas是否正确插入DOM
                console.log('Canvas已直接插入DOM，offsetWidth/Height:', canvas.offsetWidth, 'x', canvas.offsetHeight);
                console.log('Canvas在DOM中的位置:', canvas.parentElement);
            } else {
                console.error('找不到documentContainer元素');
            }

        } catch (error) {
            console.error('PDF页面渲染失败:', error);
            console.error('渲染错误堆栈:', error.stack);
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
            this.currentSelection = selection; // 存储选择对象

            // 获取选中的span并存储
            this.selectedSpans = this.getSelectedSpansFromSelection(selection);

            console.log('🔍 文本选择事件:');
            console.log('选中文本:', text);
            console.log('选中span数量:', this.selectedSpans.length);
            console.log('选择范围数量:', selection.rangeCount);

            // 详细调试信息
            for (let i = 0; i < selection.rangeCount; i++) {
                const range = selection.getRangeAt(i);
                console.log(`范围 ${i}:`, range.toString());
                console.log(`范围起始:`, range.startContainer, range.startOffset);
                console.log(`范围结束:`, range.endContainer, range.endOffset);
            }

            this.showHighlightTools();
            // 🎯 不再添加额外的预览高亮层，直接使用浏览器的 ::selection 样式
            // 这样用户看到的就是默认的蓝色选择高亮，右键点击后会转换为自定义高亮
        } else {
            this.hideHighlightTools();
            this.selectedSpans = null;
        }
    }

    /**
     * 处理文本选择的右键菜单（重载方法）
     * @param {Event} e - 右键事件
     * @param {Selection} selection - 选择对象
     */
    handleTextSelectionContextMenu(e, selection) {
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0) {
            // 存储当前选择，供高亮使用
            this.currentSelection = selection;
            this.selectedText = selectedText;

            // 获取选中的span并存储
            this.selectedSpans = this.getSelectedSpansFromSelection(selection);

            console.log('🔍 文本选择右键菜单:');
            console.log('选中文本:', selectedText);
            console.log('选中span数量:', this.selectedSpans.length);

            // 显示右键菜单
            this.showContextMenu(e.clientX, e.clientY);
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

    /**
     * 显示选择高亮预览
     */
    showSelectionHighlight() {
        if (!this.currentSelection || this.currentSelection.rangeCount === 0) return;

        const range = this.currentSelection.getRangeAt(0);
        const spans = this.getSpansInRange(range);
        if (spans.length === 0) return;

        // 为选中的span添加预览高亮类
        spans.forEach(span => {
            span.classList.add('selection-preview');
        });

        // 合并相邻的预览高亮
        if (spans.length > 1) {
            this.mergeAdjacentSelectionHighlights(spans[0]);
        }
    }

    /**
     * 隐藏选择高亮预览
     */
    hideSelectionHighlight() {
        // 移除所有预览高亮
        const previewSpans = document.querySelectorAll('.selection-preview');
        previewSpans.forEach(span => {
            span.classList.remove('selection-preview');
        });

        // 移除合并的预览高亮
        const mergedHighlights = document.querySelectorAll('.merged-selection-highlight');
        mergedHighlights.forEach(highlight => {
            highlight.remove();
        });
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

    highlightSelectedText(color = 'yellow') {
        // 优先使用存储的选择对象，否则使用当前选择
        const selection = this.currentSelection || window.getSelection();
        if (selection.rangeCount === 0) return;

        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        console.log('🎯 使用浏览器原生选择机制高亮');

        // 获取选中的span
        const selectedSpans = this.getSelectedSpansFromSelection(selection);
        if (selectedSpans.length === 0) return;

        const highlightId = this.generateHighlightId();

        // 🎯 新方案：直接用背景色，让浏览器处理渲染
        const colorMap = {
            'yellow': 'rgba(255, 255, 200, 0.6)',
            'green': 'rgba(180, 255, 180, 0.6)',
            'blue': 'rgba(180, 220, 255, 0.6)',
            'pink': 'rgba(255, 180, 220, 0.6)',
            'orange': 'rgba(255, 220, 180, 0.6)',
            'purple': 'rgba(220, 180, 255, 0.6)',
            'red': 'rgba(255, 180, 180, 0.6)',
            'cyan': 'rgba(180, 240, 255, 0.6)'
        };

        const bgColor = colorMap[color] || colorMap['yellow'];

        // 标记选中的 span
        selectedSpans.forEach(span => {
            span.dataset.highlightId = highlightId;
            span.dataset.highlightColor = color;

            const word = this.extractWord(span.textContent);
            if (word) {
                this.highlightedWords.add(word.toLowerCase());
            }
        });

        // 🎯 创建统一的高亮背景层（像 ::selection 那样连续）
        this.createUnifiedHighlight(selectedSpans, bgColor, highlightId);

        // 清除选择状态
        selection.removeAllRanges();
        this.currentSelection = null;

        // 添加到历史记录
        this.addToHistory('highlight', {
            highlightId: highlightId,
            color: color,
            text: selectedText,
            spanCount: selectedSpans.length
        });

        console.log('✅ 高亮完成（统一背景层）');
    }

    generateHighlightId() {
        return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * 创建统一的高亮背景层（像 ::selection 那样连续）
     * @param {HTMLElement[]} spans - 选中的span元素数组
     * @param {string} bgColor - 背景颜色
     * @param {string} highlightId - 高亮ID
     */
    createUnifiedHighlight(spans, bgColor, highlightId) {
        if (spans.length === 0) return;

        // 获取文本层容器
        const textLayer = spans[0].closest('.pdf-text-layer');
        if (!textLayer) return;

        // 🎯 使用 offsetLeft/offsetTop 而不是 getBoundingClientRect
        // 这样在缩放时定位更准确
        const lines = [];
        let currentLine = null;

        spans.forEach(span => {
            // 获取 span 的样式信息
            const computedStyle = window.getComputedStyle(span);
            const transform = computedStyle.transform;

            // 解析 transform 矩阵获取实际位置
            let left = parseFloat(computedStyle.left) || 0;
            let top = parseFloat(computedStyle.top) || 0;
            const width = span.offsetWidth;
            const height = span.offsetHeight;

            // 如果是新的一行（top 值变化超过阈值）
            if (!currentLine || Math.abs(top - currentLine.top) > 2) {
                currentLine = {
                    top: top,
                    bottom: top + height,
                    spans: []
                };
                lines.push(currentLine);
            }

            currentLine.spans.push({
                left: left,
                right: left + width,
                top: top,
                bottom: top + height
            });

            // 更新行的边界
            currentLine.top = Math.min(currentLine.top, top);
            currentLine.bottom = Math.max(currentLine.bottom, top + height);
        });

        // 为每一行创建一个连续的高亮背景
        lines.forEach((line, index) => {
            const minLeft = Math.min(...line.spans.map(s => s.left));
            const maxRight = Math.max(...line.spans.map(s => s.right));

            const highlightDiv = document.createElement('div');
            highlightDiv.className = 'unified-highlight';
            highlightDiv.dataset.highlightId = highlightId;
            highlightDiv.style.position = 'absolute';
            highlightDiv.style.left = minLeft + 'px';
            highlightDiv.style.top = (line.top - 5.1) + 'px'; // 上方增加5.1px（再往上移0.3px）
            highlightDiv.style.width = (maxRight - minLeft) + 'px';
            highlightDiv.style.height = (line.bottom - line.top + 4.3) + 'px'; // 上部5.1px，下部-0.8px（再减少0.7px）
            highlightDiv.style.backgroundColor = bgColor;
            highlightDiv.style.borderRadius = '4px'; // 圆角
            highlightDiv.style.pointerEvents = 'none';
            highlightDiv.style.zIndex = '1'; // 在文字下方

            textLayer.appendChild(highlightDiv);
        });
    }

    /**
     * 创建统一的下划线层（连贯的下划线，不是单个单词）
     * @param {HTMLElement[]} spans - span元素数组
     * @param {string} underlineId - 下划线ID
     */
    createUnifiedUnderline(spans, underlineId) {
        if (spans.length === 0) return;

        console.log('🔍 创建统一下划线，spans数量:', spans.length, 'underlineId:', underlineId);

        // 获取文本层容器
        const textLayer = spans[0].closest('.pdf-text-layer');
        if (!textLayer) {
            console.error('❌ 找不到 textLayer');
            return;
        }

        // 按行分组spans
        const lines = [];
        let currentLine = null;

        spans.forEach(span => {
            const computedStyle = window.getComputedStyle(span);
            let left = parseFloat(computedStyle.left) || 0;
            let top = parseFloat(computedStyle.top) || 0;
            const width = span.offsetWidth;
            const height = span.offsetHeight;

            // 如果是新的一行
            if (!currentLine || Math.abs(top - currentLine.top) > 2) {
                currentLine = {
                    top: top,
                    bottom: top + height,
                    spans: []
                };
                lines.push(currentLine);
            }

            currentLine.spans.push({
                left: left,
                right: left + width,
                top: top,
                bottom: top + height
            });

            currentLine.top = Math.min(currentLine.top, top);
            currentLine.bottom = Math.max(currentLine.bottom, top + height);
        });

        console.log('🔍 分组后的行数:', lines.length);

        // 为每一行创建一个连续的下划线
        lines.forEach((line, index) => {
            const minLeft = Math.min(...line.spans.map(s => s.left));
            const maxRight = Math.max(...line.spans.map(s => s.right));
            const maxBottom = Math.max(...line.spans.map(s => s.bottom));

            const underlineDiv = document.createElement('div');
            underlineDiv.className = 'unified-underline';
            underlineDiv.dataset.underlineId = underlineId;
            underlineDiv.style.position = 'absolute';
            underlineDiv.style.left = minLeft + 'px';
            underlineDiv.style.top = maxBottom + 'px'; // 往上移1px（从+1改为+0）
            underlineDiv.style.width = (maxRight - minLeft) + 'px';
            underlineDiv.style.height = '2px'; // 下划线高度2px
            underlineDiv.style.backgroundColor = '#333'; // 黑色下划线
            underlineDiv.style.pointerEvents = 'none';
            underlineDiv.style.zIndex = '10'; // 高z-index确保在高亮之上

            console.log(`✅ 创建下划线 ${index + 1}:`, {
                left: minLeft,
                top: maxBottom,
                width: maxRight - minLeft,
                height: 2,
                backgroundColor: '#333'
            });

            textLayer.appendChild(underlineDiv);
        });

        console.log('✅ 下划线创建完成');
    }

    collectHighlightGroup(span) {
        if (!span) return [];
        const highlightId = span.dataset.highlightId;
        if (highlightId) {
            return Array.from(document.querySelectorAll(`.pdf-text-layer span[data-highlight-id="${highlightId}"]`));
        }
        return [span];
    }

    /**
     * 从Selection对象获取选中的span元素（改进版）
     * @param {Selection} selection - 选择对象
     * @returns {HTMLElement[]} - span元素数组
     */
    getSelectedSpansFromSelection(selection) {
        const selectedSpans = [];

        // 遍历所有选择范围
        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            const spans = this.getSpansInRange(range);
            selectedSpans.push(...spans);
        }

        // 去重并保持顺序
        const uniqueSpans = [];
        const seen = new Set();

        selectedSpans.forEach(span => {
            if (!seen.has(span)) {
                seen.add(span);
                uniqueSpans.push(span);
            }
        });

        // 按DOM顺序排序（确保文本顺序正确）
        uniqueSpans.sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                return -1; // a在b之前
            } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                return 1;  // a在b之后
            }
            return 0; // 相同位置
        });

        console.log('🔍 最终选中的span数量:', uniqueSpans.length);
        uniqueSpans.forEach((span, index) => {
            console.log(`span ${index}: "${span.textContent}" (空格: ${/\s/.test(span.textContent)})`);
        });

        return uniqueSpans;
    }

    /**
     * 获取选中范围内的所有span元素
     * @param {Range} range - 选择范围
     * @returns {HTMLElement[]} - span元素数组
     */
    getSpansInRange(range) {
        const spans = [];

        // 直接遍历所有PDF文本层的span元素
        const allSpans = document.querySelectorAll('.pdf-text-layer span');
        console.log('🔍 页面中总span数量:', allSpans.length);
        console.log('🔍 选择范围:', range.toString());

        // 🔍 调试：检查是否有重复的文本层
        const textLayers = document.querySelectorAll('.pdf-text-layer');
        console.log('🔍 文本层数量:', textLayers.length);
        textLayers.forEach((layer, index) => {
            const layerSpans = layer.querySelectorAll('span');
            console.log(`文本层 ${index} 包含 ${layerSpans.length} 个span`);
        });

        allSpans.forEach((span, index) => {
            // 检查这个span是否与选择范围相交
            if (range.intersectsNode(span)) {
                console.log(`span ${index} 与选择范围相交:`, span);
                console.log(`span内容: "${span.textContent}" (空格: ${/\s/.test(span.textContent)})`);
                console.log(`span位置: left=${span.style.left}, top=${span.style.top}`);
                console.log(`span父容器:`, span.parentElement.className);
                spans.push(span);
            }
        });

        console.log('🔍 最终找到的span数量:', spans.length);

        // 按DOM顺序排序
        spans.sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                return -1; // a在b之前
            } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                return 1;  // a在b之后
            }
            return 0; // 相同位置
        });

        return spans;
    }

    /**
     * 获取选择范围内的所有文本节点
     * @param {Range} range - 选择范围
     * @returns {Text[]} - 文本节点数组
     */
    getTextNodesInRange(range) {
        const textNodes = [];

        // 方法1：使用TreeWalker遍历
        const walker = document.createTreeWalker(
            range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (range.intersectsNode(node)) {
                textNodes.push(node);
            }
        }

        // 方法2：如果TreeWalker没有找到足够的节点，使用更广泛的搜索
        if (textNodes.length === 0) {
            const allTextNodes = [];
            const allSpans = document.querySelectorAll('.pdf-text-layer span');

            allSpans.forEach(span => {
                if (range.intersectsNode(span)) {
                    // 获取span内的文本节点
                    const spanWalker = document.createTreeWalker(
                        span,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );

                    let spanNode;
                    while (spanNode = spanWalker.nextNode()) {
                        if (range.intersectsNode(spanNode)) {
                            allTextNodes.push(spanNode);
                        }
                    }
                }
            });

            return allTextNodes;
        }

        return textNodes;
    }

    /**
     * 检查span是否在选择范围内
     * @param {HTMLElement} span - span元素
     * @param {Range} range - 选择范围
     * @returns {boolean} - 是否在范围内
     */
    isSpanInRange(span, range) {
        try {
            const spanRange = document.createRange();
            spanRange.selectNodeContents(span);

            // 检查范围是否相交
            return range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0 &&
                range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0;
        } catch (e) {
            // 如果无法创建范围，使用文本内容检查
            const spanText = span.textContent;
            const selectedText = range.toString();
            return selectedText.includes(spanText) || spanText.includes(selectedText);
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


    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
        this.applyZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
        this.applyZoom();
    }

    resetZoom() {
        this.zoomLevel = 1.0;
        this.applyZoom();
    }

    applyZoom() {
        const container = document.getElementById('documentContainer');
        if (container) {
            // 缩放整个all-pages-container，让所有页面作为一个整体缩放
            const allPagesContainer = container.querySelector('.all-pages-container');
            if (allPagesContainer) {
                allPagesContainer.style.transform = `scale(${this.zoomLevel})`;
                allPagesContainer.style.transformOrigin = 'center top';
                allPagesContainer.style.transition = 'transform 0.2s ease';
            }
        }
        this.updateZoomDisplay();
    }

    updateZoomDisplay() {
        const zoomDisplay = document.getElementById('zoomLevel');
        if (zoomDisplay) {
            zoomDisplay.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    enableEmbeddedMode() {
        if (this.isEmbedded) {
            return;
        }

        this.isEmbedded = true;
        document.body.classList.add('embedded-reader');

        const backBtn = document.getElementById('backToMainBtn');
        if (backBtn) {
            backBtn.setAttribute('title', '关闭标签页');
        }
    }

    async goBackToMain() {
        // 隐藏AI对话按钮
        this.hideAiChatButton();
        // 检查是否有未保存的修改
        if (this.isDirty && !this.isClosing) {
            const action = await this.showSaveConfirmDialog();

            if (action === 'cancel') {
                return; // 用户取消，留在当前页面
            } else if (action === 'save') {
                await this.saveDocument();
            }
            // 如果是'dontSave'，直接继续关闭
        }

        this.isClosing = true;

        if (this.isEmbedded) {
            try {
                // Web version: use postMessage to parent
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ channel: 'close-document' }, '*');
                } else {
                    // Electron version
                    ipcRenderer.sendToHost('close-tab-request', { filePath: this.currentFile });
                }
            } catch (error) {
                console.warn('发送关闭标签请求失败:', error);
            }
            return;
        }

        // 独立窗口模式下关闭窗口
        window.close();
    }

    handleKeyboardShortcuts(e) {
        // 如果焦点在输入框或文本区域中，允许标准快捷键（Ctrl/Cmd + A, C, V, X, Z, Y）
        const activeElement = document.activeElement;
        const isInputElement = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );

        if (isInputElement) {
            // 在输入框中，只拦截应用特定的快捷键，允许标准编辑快捷键
            // Mac使用Cmd键（metaKey），Windows/Linux使用Ctrl键
            const isModifierKey = e.metaKey || e.ctrlKey;

            // 允许标准编辑快捷键：全选、复制、粘贴、剪切、撤销
            // 这些快捷键应该由浏览器默认处理，我们完全不拦截
            if (isModifierKey && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
                // 完全不处理，让浏览器默认行为生效
                return;
            }

            // Mac上Cmd+Shift+Z用于重做，Windows/Linux上Ctrl+Y用于重做
            if (isModifierKey && e.shiftKey && e.key.toLowerCase() === 'z') {
                return; // 允许重做快捷键（Mac），不阻止默认行为
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                return; // Windows/Linux的Ctrl+Y重做，不阻止默认行为
            }

            // 只拦截应用特定的快捷键（如 Ctrl+S / Cmd+S 保存）
            if (isModifierKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.saveDocument();
                return;
            }

            // 其他快捷键在输入框中不拦截
            return;
        }

        // 不在输入框中，处理全局快捷键
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
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
                case 'z':
                    // Ctrl+Z: 撤销
                    if (e.shiftKey) {
                        // Ctrl+Shift+Z: 重做（某些系统习惯）
                        e.preventDefault();
                        this.redo();
                    } else {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
                case 'y':
                    // Ctrl+Y: 重做
                    e.preventDefault();
                    this.redo();
                    break;
                case 's':
                    // Ctrl+S: 保存
                    e.preventDefault();
                    this.saveDocument();
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
        const nameElement = document.getElementById('currentFileName');
        if (nameElement) {
            nameElement.textContent = name;
        }

        if (this.isEmbedded) {
            try {
                ipcRenderer.sendToHost('update-tab-title', { title: name });
            } catch (error) {
                console.warn('更新标签标题失败:', error);
            }
        }
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

    // ========== 点词翻译功能 ==========

    /**
     * 初始化悬浮框DOM元素
     */
    initWordTooltip() {
        this.wordTooltip = document.getElementById('wordTooltip');
        if (!this.wordTooltip) {
            console.error('悬浮框元素未找到');
        }
    }

    /**
     * 切换点词翻译模式
     */
    toggleWordTranslateMode() {
        this.wordTranslateMode = !this.wordTranslateMode;
        const btn = document.getElementById('wordTranslateBtn');

        if (this.wordTranslateMode) {
            // 开启模式
            btn.classList.add('active');
            this.updateStatus('点词翻译模式已开启 - 点击单词即可翻译');
            this.enableWordTranslateMode();
        } else {
            // 关闭模式
            btn.classList.remove('active');
            this.updateStatus('点词翻译模式已关闭');
            this.disableWordTranslateMode();
        }
    }

    /**
     * 启用点词翻译模式
     */
    enableWordTranslateMode() {
        // 给所有文本层添加word-translate-mode类
        const textLayers = document.querySelectorAll('.pdf-text-layer');
        textLayers.forEach(layer => {
            layer.classList.add('word-translate-mode');

            // 给每个span绑定点击和hover事件
            const spans = layer.querySelectorAll('span');
            spans.forEach(span => {
                // 点击事件
                span.addEventListener('click', this.handleWordClick.bind(this));

                // 右键事件
                span.addEventListener('contextmenu', this.handleWordContextMenu.bind(this));

                // hover事件
                span.addEventListener('mouseenter', this.handleWordHover.bind(this));
                span.addEventListener('mouseleave', this.handleWordLeave.bind(this));
            });
        });
    }

    /**
     * 禁用点词翻译模式
     */
    disableWordTranslateMode() {
        // 移除所有文本层的word-translate-mode类
        const textLayers = document.querySelectorAll('.pdf-text-layer');
        textLayers.forEach(layer => {
            layer.classList.remove('word-translate-mode');

            // 移除click事件，但保留hover事件以便查看已有翻译
            const spans = layer.querySelectorAll('span');
            spans.forEach(span => {
                // 创建新的span保留内容和类名
                const newSpan = span.cloneNode(true);

                // 重新绑定hover事件（用于显示已有翻译）
                newSpan.addEventListener('mouseenter', this.handleWordHover.bind(this));
                newSpan.addEventListener('mouseleave', this.handleWordLeave.bind(this));

                span.parentNode.replaceChild(newSpan, span);
            });
        });

        // 隐藏悬浮框
        this.hideWordTooltip();
    }

    /**
     * 处理单词点击事件
     * @param {Event} e - 点击事件
     */
    async handleWordClick(e) {
        // 只在翻译模式开启时才处理点击
        if (!this.wordTranslateMode) return;

        e.stopPropagation();
        const span = e.target;
        const rawText = span.textContent;

        // 提取纯净单词（去除标点符号）
        const word = this.extractWord(rawText);
        if (!word) return;

        console.log(`点击单词: "${word}"`);

        // 🎯 使用统一背景层逻辑高亮单词
        const highlightId = this.generateHighlightId();
        span.dataset.highlightId = highlightId;
        span.dataset.highlightColor = 'custom';
        this.highlightedWords.add(word.toLowerCase());

        // 创建统一的高亮背景层（上下3px、圆角）- 使用默认紫色
        const rgb = this.hexToRgb(this.defaultHighlightColor);
        const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;
        this.createUnifiedHighlight([span], bgColor, highlightId);

        // 添加到历史记录
        this.addToHistory('wordTranslate', {
            highlightId: highlightId,
            word: word,
            spanCount: 1
        });

        // 如果已有翻译，不需要再次翻译；否则获取翻译
        if (!this.wordTranslationMap.has(word.toLowerCase())) {
            // 检查订阅限制
            if (this.subscriptionHelper && this.currentUserId) {
                try {
                    const limitCheck = await this.subscriptionHelper.checkAndUpdateUsage(
                        this.currentUserId,
                        'wordTranslations'
                    );

                    if (!limitCheck.allowed) {
                        // 显示限制提示
                        this.showUpgradePrompt(limitCheck.message || '点词翻译使用次数已达上限');
                        return;
                    }
                } catch (error) {
                    console.error('检查订阅限制失败:', error);
                    // 如果检查失败，允许继续使用（降级处理）
                }
            }

            // 获取翻译（不显示悬浮框，只保存翻译）
            try {
                const translation = await this.translateWord(word);
                this.wordTranslationMap.set(word.toLowerCase(), {
                    word: word,
                    translation: translation,
                    clickCount: 1
                });

                // 保存翻译到生词本
                // Web版本：跳过订阅检查，直接保存
                try {
                    // 使用 save-vocabulary 接口
                    await ipcRenderer.invoke('save-vocabulary', word, translation, this.getSentenceContext(word));
                    console.log('生词已保存:', word);
                } catch (saveError) {
                    console.error('保存生词失败:', saveError);
                }
            } catch (error) {
                console.error('翻译失败:', error);
                // 保存失败信息
                this.wordTranslationMap.set(word.toLowerCase(), {
                    word: word,
                    translation: '翻译失败',
                    clickCount: 1
                });
            }
        }

        // 🎯 不在点击时显示悬浮框，只在hover时显示
        // 翻译会在用户hover到高亮区域时自动显示
    }

    /**
     * 获取整个文档的文本内容
     */
    async getAllText() {
        console.log('🔍 开始获取全文内容...');
        if (!this.pdfDocument) {
            console.error('❌ getAllText: this.pdfDocument 为空');
            return '';
        }

        try {
            let fullText = '';
            const numPages = this.pdfDocument.numPages;
            console.log(`📄 文档总页数: ${numPages}`);

            // 限制最大页数以防止内存溢出或处理时间过长
            // 对于非常大的文档，可能需要分块处理或只读取前N页
            const maxPages = Math.min(numPages, 50);

            for (let i = 1; i <= maxPages; i++) {
                console.log(`📖 读取第 ${i} 页...`);
                const page = await this.pdfDocument.getPage(i);
                const textContent = await page.getTextContent();

                if (!textContent || !textContent.items) {
                    console.warn(`⚠️ 第 ${i} 页 textContent 为空`);
                    continue;
                }

                const pageText = textContent.items.map(item => item.str).join(' ');
                console.log(`✅ 第 ${i} 页提取字符数: ${pageText.length}`);

                // 简单的去重或清理（可选）
                if (pageText.trim().length > 0) {
                    fullText += `【第${i}页】\n${pageText}\n\n`;
                }
            }

            if (numPages > maxPages) {
                fullText += `\n(文档过长，仅截取前${maxPages}页内容...)\n`;
            }

            console.log(`📝 全文提取完成，总长度: ${fullText.length}`);
            if (fullText.length === 0) {
                console.warn('⚠️ 提取的全文内容为空！');
            }
            return fullText;
        } catch (error) {
            console.error('❌ 获取全文失败:', error);
            return '';
        }
    }
    /**
     * 获取包含单词的句子上下文
     * @param {string} word - 目标单词
     * @returns {string} - 包含单词的句子
     */
    getSentenceContext(word) {
        if (!word) return '';

        // 尝试从当前选区获取
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const text = container.textContent || container.innerText || '';

            // 简单的句子提取逻辑
            if (text.length > word.length) {
                // 如果文本不太长，直接返回
                if (text.length < 200) return text;

                // 否则尝试截取
                const index = text.toLowerCase().indexOf(word.toLowerCase());
                if (index !== -1) {
                    const start = Math.max(0, index - 50);
                    const end = Math.min(text.length, index + word.length + 50);
                    return (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
                }
            }
        }

        return `Context for ${word}`;
    }

    /**
     * 处理单词hover事件
     * @param {Event} e - hover事件
     */
    handleWordHover(e) {
        const span = e.target;
        const rawText = span.textContent;
        const word = this.extractWord(rawText);

        if (!word) return;

        this.currentHoverWord = word;

        // 检查是否有高亮ID（包括点词翻译和句子翻译）
        const highlightId = span.dataset.highlightId;

        if (highlightId) {
            // 从统一高亮层读取颜色
            const highlightDiv = document.querySelector(`.unified-highlight[data-highlight-id="${highlightId}"]`);
            let highlightColor = this.defaultHighlightColor;

            if (highlightDiv) {
                const bgColor = highlightDiv.style.backgroundColor;
                // 将rgba转换为rgb
                const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (rgbaMatch) {
                    highlightColor = `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
                }
            }

            // 检查是否有单词翻译
            if (this.wordTranslationMap.has(word.toLowerCase())) {
                const data = this.wordTranslationMap.get(word.toLowerCase());
                // 🎯 使用高亮区域中心位置显示
                this.showWordTooltipAtHighlightCenter(word, data.translation, highlightId, highlightColor);
            }
            // 检查是否有句子翻译（存储在sentenceTranslations中）
            else if (this.sentenceTranslationMap && this.sentenceTranslationMap.has(highlightId)) {
                const translation = this.sentenceTranslationMap.get(highlightId);
                // 🎯 使用高亮区域中心位置显示
                this.showWordTooltipAtHighlightCenter(word, translation, highlightId, highlightColor);
            }
        }
    }

    /**
     * 处理单词离开事件
     */
    handleWordLeave(e) {
        this.currentHoverWord = null;
        // 立即隐藏翻译悬浮框，无延迟
        this.hideWordTooltip();
    }

    /**
     * 提取纯净单词（去除标点符号）
     * @param {string} text - 原始文本
     * @returns {string} - 纯净单词
     */
    extractWord(text) {
        if (!text) return '';

        // 去除标点符号，只保留字母、数字、连字符
        const cleaned = text.replace(/[^\w\s-]/g, '').trim();

        // 如果是空或只有空格，返回空
        if (!cleaned || /^\s*$/.test(cleaned)) return '';

        return cleaned;
    }

    /**
     * 显示悬浮框
     * @param {string} word - 单词
     * @param {string} translation - 翻译
     * @param {HTMLElement} span - span元素
     * @param {string} highlightColor - 高亮颜色（直接传入，避免异步读取）
     * @param {boolean} loading - 是否加载状态
     */
    showWordTooltip(word, translation, span, highlightColor, loading = false) {
        if (!this.wordTooltip || !span) return;

        // 更新内容
        document.getElementById('tooltipWord').textContent = word;
        document.getElementById('tooltipTranslation').textContent = translation;

        // 设置加载状态
        if (loading) {
            this.wordTooltip.classList.add('loading');
            // 翻译中时，设置最小宽度为span宽度
            const spanRect = span.getBoundingClientRect();
            this.wordTooltip.style.minWidth = spanRect.width + 'px';
            this.wordTooltip.style.maxWidth = spanRect.width + 'px';
        } else {
            this.wordTooltip.classList.remove('loading');
            // 显示翻译时，恢复自适应宽度
            this.wordTooltip.style.minWidth = '';
            this.wordTooltip.style.maxWidth = '200px';
        }

        // 🎯 关键改进：直接使用传入的高亮颜色，无需读取计算样式
        let bgColor = highlightColor;

        // 如果颜色是rgba格式，转换为rgb格式（tooltip需要完全不透明）
        const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbaMatch) {
            const r = rgbaMatch[1];
            const g = rgbaMatch[2];
            const b = rgbaMatch[3];
            bgColor = `rgb(${r}, ${g}, ${b})`;
        }

        console.log('🎨 使用高亮颜色:', bgColor);

        this.wordTooltip.style.background = bgColor;

        // 更新箭头颜色
        const style = document.createElement('style');
        style.textContent = `.word-tooltip::after { border-top-color: ${bgColor}; }`;
        // 移除旧的样式
        const oldStyle = document.querySelector('style[data-tooltip-arrow]');
        if (oldStyle) oldStyle.remove();
        style.setAttribute('data-tooltip-arrow', 'true');
        document.head.appendChild(style);

        // 显示悬浮框
        this.wordTooltip.style.display = 'block';

        // 获取span的位置
        const spanRect = span.getBoundingClientRect();
        const tooltipRect = this.wordTooltip.getBoundingClientRect();

        // 计算位置：在span正上方，水平居中
        const margin = 12; // tooltip和span之间的间距（包含箭头）

        // 水平居中对齐
        let left = spanRect.left + (spanRect.width / 2) - (tooltipRect.width / 2);

        // 垂直位置：在span上方
        let top = spanRect.top - tooltipRect.height - margin;

        // 边界检查 - 左右
        if (left < 5) {
            left = 5;
        }
        if (left + tooltipRect.width > window.innerWidth - 5) {
            left = window.innerWidth - tooltipRect.width - 5;
        }

        // 边界检查 - 上下
        if (top < 5) {
            top = spanRect.bottom + margin; // 如果上方空间不够，显示在下方
        }

        this.wordTooltip.style.left = left + 'px';
        this.wordTooltip.style.top = top + 'px';
    }

    /**
     * 在高亮区域中心上方显示翻译悬浮框
     * @param {string} word - 单词
     * @param {string} translation - 翻译
     * @param {string} highlightId - 高亮ID
     * @param {string} highlightColor - 高亮颜色
     */
    showWordTooltipAtHighlightCenter(word, translation, highlightId, highlightColor) {
        if (!this.wordTooltip) return;

        // 更新内容
        document.getElementById('tooltipWord').textContent = word;
        document.getElementById('tooltipTranslation').textContent = translation;

        // 设置样式
        this.wordTooltip.classList.remove('loading');
        this.wordTooltip.style.minWidth = '';
        this.wordTooltip.style.maxWidth = '300px';

        // 设置颜色
        let bgColor = highlightColor;
        const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbaMatch) {
            const r = rgbaMatch[1];
            const g = rgbaMatch[2];
            const b = rgbaMatch[3];
            bgColor = `rgb(${r}, ${g}, ${b})`;
        }

        this.wordTooltip.style.background = bgColor;

        // 更新箭头颜色
        const style = document.createElement('style');
        style.textContent = `.word-tooltip::after { border-top-color: ${bgColor}; }`;
        const oldStyle = document.querySelector('style[data-tooltip-arrow]');
        if (oldStyle) oldStyle.remove();
        style.setAttribute('data-tooltip-arrow', 'true');
        document.head.appendChild(style);

        // 显示悬浮框
        this.wordTooltip.style.display = 'block';

        // 🎯 计算整个高亮区域的边界
        // 获取所有相同highlightId的unified-highlight div
        const highlightDivs = document.querySelectorAll(`.unified-highlight[data-highlight-id="${highlightId}"]`);

        if (highlightDivs.length === 0) return;

        // 计算所有高亮div的总边界
        let minLeft = Infinity;
        let maxRight = -Infinity;
        let minTop = Infinity;
        let maxBottom = -Infinity;

        highlightDivs.forEach(div => {
            const rect = div.getBoundingClientRect();
            minLeft = Math.min(minLeft, rect.left);
            maxRight = Math.max(maxRight, rect.right);
            minTop = Math.min(minTop, rect.top);
            maxBottom = Math.max(maxBottom, rect.bottom);
        });

        // 计算高亮区域的中心点
        const centerX = (minLeft + maxRight) / 2;
        const topY = minTop;

        // 获取悬浮框尺寸
        const tooltipRect = this.wordTooltip.getBoundingClientRect();

        // 计算悬浮框位置：水平居中，垂直在高亮区域上方
        const margin = 12;
        let left = centerX - (tooltipRect.width / 2);
        let top = topY - tooltipRect.height - margin;

        // 边界检查 - 左右
        if (left < 5) {
            left = 5;
        }
        if (left + tooltipRect.width > window.innerWidth - 5) {
            left = window.innerWidth - tooltipRect.width - 5;
        }

        // 边界检查 - 上下
        if (top < 5) {
            top = maxBottom + margin; // 如果上方空间不够，显示在下方
        }

        this.wordTooltip.style.left = left + 'px';
        this.wordTooltip.style.top = top + 'px';
    }

    /**
     * 隐藏悬浮框
     */
    hideWordTooltip() {
        if (this.wordTooltip) {
            this.wordTooltip.style.display = 'none';
        }
    }

    /**
     * 翻译单词（调用AI API）
     * @param {string} word - 要翻译的单词
     * @returns {Promise<string>} - 翻译结果
     */
    async translateWord(word) {
        console.log(`开始翻译单词: ${word}`);

        // TODO: 这里需要集成真实的AI API
        // 目前使用模拟翻译
        const translation = await this.callTranslationAPI(word);

        return translation;
    }

    /**
     * 翻译句子（调用AI API）
     * @param {string} sentence - 要翻译的句子
     * @returns {Promise<string>} - 翻译结果
     */
    async translateWithAI(sentence) {
        console.log(`开始翻译句子: ${sentence}`);

        try {
            // 等待限流器允许
            await this.waitForRateLimit();

            // 记录请求时间
            const now = Date.now();
            this.apiRequestQueue.push(now);
            this.lastRequestTime = now;

            const fullUrl = `${this.geminiApiUrl}?key=${this.geminiApiKey}`;
            console.log(`📡 调用Gemini API翻译句子: ${sentence} (队列: ${this.apiRequestQueue.length}/${this.maxRequestsPerMinute})`);

            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `请将以下英文句子翻译成中文，保持原文的语气和风格，提供准确流畅的翻译：\n\n"${sentence}"\n\n只返回翻译结果，不要额外解释。`
                        }]
                    }]
                })
            });

            console.log(`📊 响应状态: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`❌ API错误详情:`, JSON.stringify(errorData, null, 2));

                // 如果是429错误（配额超限），显示友好提示
                if (response.status === 429) {
                    throw new Error('API_RATE_LIMIT');
                }

                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();

            // 提取翻译结果
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const translation = data.candidates[0].content.parts[0].text.trim();
                console.log(`✅ 句子翻译结果: ${translation}`);
                return translation;
            }

            throw new Error('API返回格式异常');

        } catch (error) {
            console.error('句子翻译API调用失败:', error);

            if (error.message === 'API_RATE_LIMIT') {
                throw new Error('API请求过于频繁，请稍后再试');
            }

            throw error;
        }
    }

    /**
     * 检查是否可以发送API请求（基于限流规则）
     * @returns {boolean}
     */
    canMakeRequest() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // 清理1分钟前的请求记录
        this.apiRequestQueue = this.apiRequestQueue.filter(time => time > oneMinuteAgo);

        // 检查1分钟内的请求数
        if (this.apiRequestQueue.length >= this.maxRequestsPerMinute) {
            console.warn(`⚠️ 已达到每分钟请求上限 (${this.maxRequestsPerMinute}次)`);
            return false;
        }

        // 检查距离上次请求的时间间隔
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelayMs) {
            console.warn(`⚠️ 请求过快，需等待 ${Math.ceil((this.requestDelayMs - timeSinceLastRequest) / 1000)} 秒`);
            return false;
        }

        return true;
    }

    /**
     * 等待直到可以发送请求
     * @returns {Promise<void>}
     */
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.requestDelayMs) {
            const waitTime = this.requestDelayMs - timeSinceLastRequest;
            console.log(`⏳ 等待 ${Math.ceil(waitTime / 1000)} 秒后继续...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    /**
     * 调用翻译API（使用Gemini API，带限流和重试）
     * @param {string} word - 单词
     * @returns {Promise<string>} - 翻译结果
     */
    async callTranslationAPI(word) {
        try {
            // 等待限流器允许
            await this.waitForRateLimit();

            // 记录请求时间
            const now = Date.now();
            this.apiRequestQueue.push(now);
            this.lastRequestTime = now;

            const fullUrl = `${this.geminiApiUrl}?key=${this.geminiApiKey}`;
            console.log(`📡 调用Gemini API翻译: ${word} (队列: ${this.apiRequestQueue.length}/${this.maxRequestsPerMinute})`);

            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `请翻译这个英文单词或短语：${word}。只返回简洁的中文翻译，不要额外解释。如果是常用词，提供2-3个常见含义即可。`
                        }]
                    }]
                })
            });

            console.log(`📊 响应状态: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorData = await response.json();
                console.error(`❌ API错误详情:`, JSON.stringify(errorData, null, 2));

                // 如果是429错误（配额超限），显示友好提示
                if (response.status === 429) {
                    throw new Error('API_RATE_LIMIT');
                }

                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();

            // 提取翻译结果
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const translation = data.candidates[0].content.parts[0].text.trim();
                console.log(`✅ 翻译结果: ${translation}`);
                return translation;
            }

            throw new Error('API返回格式异常');

        } catch (error) {
            console.error('Gemini API调用失败:', error);

            // 如果是速率限制错误，返回特殊提示
            if (error.message === 'API_RATE_LIMIT') {
                return '⏳ API请求过快，请稍后再试';
            }

            // 降级到本地词典（扩展版）
            const mockTranslations = {
                // 基础词汇
                'the': '这个；那个',
                'a': '一个',
                'an': '一个',
                'is': '是',
                'are': '是',
                'was': '是（过去式）',
                'were': '是（过去式）',
                'be': '是；存在',
                'have': '有',
                'has': '有',
                'do': '做',
                'does': '做',
                'did': '做（过去式）',
                'will': '将要',
                'would': '将会',
                'can': '能够',
                'could': '能够（过去式）',
                'may': '可能',
                'might': '可能',
                'must': '必须',
                'should': '应该',

                // 学术常用词
                'introduction': '介绍；引言；序言',
                'book': '书；书籍',
                'chapter': '章节',
                'section': '部分；区域',
                'figure': '图表；数字',
                'table': '表格',
                'data': '数据',
                'analysis': '分析',
                'result': '结果',
                'conclusion': '结论',
                'reference': '参考文献',
                'abstract': '摘要',
                'method': '方法',
                'experiment': '实验',
                'research': '研究',
                'study': '研究；学习',
                'paper': '论文；纸',
                'article': '文章',
                'journal': '期刊；杂志',

                // 动词
                'analyze': '分析',
                'compare': '比较',
                'define': '定义',
                'describe': '描述',
                'evaluate': '评估',
                'explain': '解释',
                'identify': '识别',
                'illustrate': '说明',
                'demonstrate': '演示',
                'examine': '检查',
                'discuss': '讨论',
                'consider': '考虑',
                'provide': '提供',
                'show': '显示',
                'suggest': '建议',
                'indicate': '表明',
                'present': '呈现',
                'develop': '发展',
                'establish': '建立',
                'determine': '确定',

                // 名词
                'approach': '方法；途径',
                'concept': '概念',
                'context': '上下文；背景',
                'evidence': '证据',
                'factor': '因素',
                'framework': '框架',
                'hypothesis': '假设',
                'process': '过程',
                'theory': '理论',
                'model': '模型',
                'system': '系统',
                'structure': '结构',
                'function': '功能',
                'relationship': '关系',
                'difference': '差异',
                'similarity': '相似性',
                'example': '例子',
                'case': '案例；情况',
                'issue': '问题',
                'problem': '问题',

                // 形容词
                'significant': '重要的；显著的',
                'important': '重要的',
                'relevant': '相关的',
                'specific': '具体的',
                'general': '一般的',
                'complex': '复杂的',
                'simple': '简单的',
                'similar': '相似的',
                'different': '不同的',
                'common': '常见的',
                'particular': '特定的',
                'various': '各种各样的',
                'possible': '可能的',
                'necessary': '必要的',
                'essential': '必不可少的',
                'effective': '有效的',
                'potential': '潜在的',
                'recent': '最近的',
                'current': '当前的',
                'previous': '以前的',

                // 副词和连词
                'however': '然而',
                'therefore': '因此',
                'moreover': '此外',
                'furthermore': '而且',
                'nevertheless': '然而',
                'consequently': '因此',
                'thus': '因此',
                'hence': '因此',
                'also': '也',
                'additionally': '另外',
                'finally': '最后',
                'particularly': '特别是',
                'especially': '尤其是',
                'generally': '通常',
                'typically': '通常',
                'essentially': '本质上',
                'primarily': '主要地',
                'significantly': '显著地',
                'relatively': '相对地',
                'specifically': '具体地',

                // 其他常用词
                'between': '之间',
                'among': '在...之中',
                'during': '在...期间',
                'through': '通过',
                'within': '在...之内',
                'without': '没有',
                'according': '根据',
                'based': '基于',
                'regarding': '关于',
                'concerning': '关于',
                'including': '包括',
                'following': '以下的',
                'above': '上面的',
                'below': '下面的',
                'such': '这样的',
                'other': '其他的',
                'both': '两者都',
                'either': '两者之一',
                'neither': '两者都不',
                'whether': '是否',
                'although': '虽然',
                'though': '虽然',
                'unless': '除非',
                'since': '自从；因为',
                'because': '因为',
                'if': '如果',
                'when': '当...时',
                'while': '当...时；然而',
                'until': '直到',
                'where': '在哪里',
                'which': '哪一个',
                'what': '什么',
                'who': '谁',
                'whose': '谁的',
                'how': '如何',
                'why': '为什么'
            };

            const lowerWord = word.toLowerCase();
            if (mockTranslations[lowerWord]) {
                console.log(`📚 使用本地词典: ${word} -> ${mockTranslations[lowerWord]}`);
                return mockTranslations[lowerWord];
            }

            // 返回友好的错误提示
            return `[词典未收录]`;
        }
    }

    /**
     * 预翻译PDF全文（PDF加载完成后调用）
     * 这是实现"即点即显"的关键
     */
    async preTranslateDocument() {
        console.log('开始预翻译文档...');
        this.updateStatus('正在进行AI全文翻译...');

        try {
            // 提取所有文本
            const allText = this.extractAllText();

            if (!allText || allText.length === 0) {
                console.log('没有可翻译的文本');
                return;
            }

            // 提取所有唯一单词
            const words = this.extractUniqueWords(allText);
            console.log(`提取到 ${words.size} 个唯一单词`);

            // TODO: 批量翻译所有单词（需要AI API支持）
            // 目前先不执行预翻译，点击时再翻译
            // 实际应用中应该在这里调用AI进行批量翻译

            this.updateStatus('文档加载完成');
            console.log('预翻译准备完成');

        } catch (error) {
            console.error('预翻译失败:', error);
            this.updateStatus('预翻译失败');
        }
    }

    /**
     * 提取文档中的所有文本
     * @returns {Array<string>} - 文本数组
     */
    extractAllText() {
        const textLayers = document.querySelectorAll('.pdf-text-layer');
        const allText = [];

        textLayers.forEach(layer => {
            const spans = layer.querySelectorAll('span');
            spans.forEach(span => {
                const text = span.textContent;
                if (text && text.trim()) {
                    allText.push(text.trim());
                }
            });
        });

        return allText;
    }

    /**
     * 提取唯一单词集合
     * @param {Array<string>} textArray - 文本数组
     * @returns {Set<string>} - 唯一单词集合
     */
    extractUniqueWords(textArray) {
        const words = new Set();

        textArray.forEach(text => {
            // 分词并清理
            const cleaned = text.replace(/[^\w\s-]/g, ' ');
            const wordList = cleaned.split(/\s+/).filter(w => w.length > 0);

            wordList.forEach(word => {
                if (word.length > 0) {
                    words.add(word.toLowerCase());
                }
            });
        });

        return words;
    }

    // ========== 右键菜单功能 ==========

    /**
     * 初始化右键菜单
     */
    initContextMenu() {
        console.log('🔍 初始化右键菜单');
        this.contextMenu = document.getElementById('contextMenu');
        this.colorPickerPanel = document.getElementById('colorPickerPanel');
        this.opacitySliderPanel = document.getElementById('opacitySliderPanel');
        this.currentColorCircle = document.getElementById('currentColorCircle');
        this.currentColorFill = this.currentColorCircle?.querySelector('.current-color-fill');
        this.currentOpacity = 0.5; // 默认透明度50%

        console.log('🔍 右键菜单元素查找结果:');
        console.log('- contextMenu:', this.contextMenu);
        console.log('- colorPickerPanel:', this.colorPickerPanel);
        console.log('- opacitySliderPanel:', this.opacitySliderPanel);
        console.log('- currentColorCircle:', this.currentColorCircle);
        console.log('- currentColorFill:', this.currentColorFill);

        if (!this.contextMenu) {
            console.error('❌ 右键菜单元素未找到');
            return;
        }

        // 初始化颜色圆形为默认颜色（紫色）
        if (this.currentColorFill) {
            this.currentColorFill.style.background = this.defaultHighlightColor;
        }

        // 绑定当前颜色圆形点击事件
        if (this.currentColorCircle) {
            this.currentColorCircle.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('🔍 点击了颜色按钮');
                this.handleColorButtonClick();
            });
        }

        // 绑定透明度调节按钮
        const opacityBtn = document.getElementById('opacityBtn');
        if (opacityBtn) {
            opacityBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleOpacitySlider();
            });
        }

        // 绑定透明度滑块
        const opacitySlider = document.getElementById('opacitySlider');
        const opacityValue = document.getElementById('opacityValue');
        if (opacitySlider && opacityValue) {
            opacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                this.currentOpacity = value / 100;
                opacityValue.textContent = value + '%';
                this.applyOpacityToCurrentTarget();
            });
        }

        // 绑定下划线按钮
        const underlineBtn = document.getElementById('underlineBtn');
        if (underlineBtn) {
            underlineBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleUnderline();
            });
        }

        // 绑定句子翻译按钮
        const sentenceTranslateBtn = document.getElementById('sentenceTranslateBtn');
        if (sentenceTranslateBtn) {
            sentenceTranslateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleContextMenuAction('translate-sentence');
            });
        }


        // 绑定复制文本按钮
        const copyTextBtn = document.getElementById('copyTextBtn');
        if (copyTextBtn) {
            copyTextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyWordText();
            });
        }

        // 绑定删除所有标记按钮
        const clearMarksBtn = document.getElementById('clearMarksBtn');
        if (clearMarksBtn) {
            clearMarksBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearAllMarks();
            });
        }

        // 绑定调色板中的颜色选项
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = option.getAttribute('data-color');
                this.applyHighlightColor(color);
                this.hideColorPicker();
            });
        });

        // 绑定自定义颜色输入
        const customColorInput = document.getElementById('customColorInput');
        if (customColorInput) {
            customColorInput.addEventListener('change', (e) => {
                const color = e.target.value;
                this.applyHighlightColor(color);
                this.hideColorPicker();
            });
        }

        // 点击其他地方关闭菜单和所有面板
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target) &&
                !this.colorPickerPanel?.contains(e.target) &&
                !this.opacitySliderPanel?.contains(e.target)) {
                this.hideContextMenu();
                this.hideColorPicker();
                this.hideOpacitySlider();
            }
        });

        // 全局右键菜单处理
        document.addEventListener('contextmenu', (e) => {
            console.log('🔍 右键菜单事件触发');
            const pdfTextLayer = e.target.closest('.pdf-text-layer');

            if (pdfTextLayer) {
                console.log('🔍 在PDF文本层内右键');
                e.preventDefault(); // 始终阻止默认右键菜单

                // 检查是否点击了单词span或选择了文本
                const span = e.target.closest('span');
                const selection = window.getSelection();
                const selectedText = selection.toString().trim();

                console.log('🔍 右键菜单检查:');
                console.log('- span:', span);
                console.log('- span内容:', span?.textContent);
                console.log('- 选中文本:', selectedText);
                console.log('- 选择范围数量:', selection.rangeCount);

                if (selectedText) {
                    // 优先处理选中的文本（多单词选择）
                    console.log('🔍 选择了文本，显示右键菜单');
                    this.handleTextSelectionContextMenu(e, selection);
                } else if (span && span.textContent.trim()) {
                    // 点击了单词（单个单词）
                    console.log('🔍 点击了单词，显示右键菜单');
                    this.currentContextTarget = span;
                    this.showContextMenu(e.clientX, e.clientY);
                } else {
                    console.log('🔍 没有选中文本也没有点击单词');
                }
            } else {
                console.log('🔍 不在PDF文本层内，不处理右键菜单');
            }
        });
    }

    /**
     * 处理单词右键点击
     * @param {Event} e - 右键事件
     */
    handleWordContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();

        const span = e.target;

        // 所有单词都可以右键打开菜单（不再限制只有高亮的单词）
        this.currentContextTarget = span;
        this.showContextMenu(e.clientX, e.clientY);
    }

    /**
     * 显示右键菜单
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     */
    showContextMenu(x, y) {
        console.log('🔍 showContextMenu 被调用');
        console.log('🔍 this.contextMenu:', this.contextMenu);
        if (!this.contextMenu) {
            console.error('❌ 右键菜单元素未找到，无法显示菜单');
            return;
        }

        // 更新当前颜色显示
        if (this.currentColorFill) {
            if (this.currentContextTarget && this.currentContextTarget.dataset.highlightId) {
                // 如果是已有高亮，读取高亮的实际颜色
                const highlightId = this.currentContextTarget.dataset.highlightId;
                const highlightDiv = document.querySelector(`.unified-highlight[data-highlight-id="${highlightId}"]`);

                if (highlightDiv) {
                    const bgColor = highlightDiv.style.backgroundColor;
                    console.log('🔍 读取到的高亮颜色:', bgColor);
                    if (bgColor) {
                        this.currentColorFill.style.background = bgColor;
                    } else {
                        this.currentColorFill.style.background = this.defaultHighlightColor;
                    }
                } else {
                    this.currentColorFill.style.background = this.defaultHighlightColor;
                }
            } else {
                // 没有高亮，显示默认颜色
                this.currentColorFill.style.background = this.defaultHighlightColor;
            }
        }

        // 显示菜单
        this.contextMenu.style.display = 'flex';
        console.log('🔍 右键菜单已显示');

        // 获取菜单尺寸
        const rect = this.contextMenu.getBoundingClientRect();
        const margin = 5;

        // 计算位置（避免超出屏幕）
        let left = x;
        let top = y;

        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - margin;
        }
        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - margin;
        }

        this.contextMenu.style.left = left + 'px';
        this.contextMenu.style.top = top + 'px';
    }

    /**
     * 隐藏右键菜单
     */
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
    }

    /**
     * 处理颜色按钮点击
     */
    handleColorButtonClick() {
        console.log('🔍 处理颜色按钮点击');

        // 判断是否有选中的文本或者点击的是已有高亮
        const hasSelection = this.selectedSpans && this.selectedSpans.length > 0;
        const hasHighlight = this.currentContextTarget &&
            this.currentContextTarget.dataset.highlightId;

        console.log('🔍 hasSelection:', hasSelection);
        console.log('🔍 hasHighlight:', hasHighlight);

        if (hasHighlight) {
            // 已有高亮：显示颜色选择框
            console.log('🔍 已有高亮，显示颜色选择框');
            this.toggleColorPicker();
        } else if (hasSelection || this.selectedText) {
            // 选择了文字但没有高亮：直接用默认颜色高亮
            console.log('🔍 选择了文字，使用默认颜色高亮:', this.defaultHighlightColor);
            this.applyDefaultColorHighlight();
        } else {
            // 其他情况：显示颜色选择框
            console.log('🔍 显示颜色选择框');
            this.toggleColorPicker();
        }
    }

    /**
     * 应用默认颜色高亮
     */
    applyDefaultColorHighlight() {
        console.log('🔍 应用默认颜色高亮:', this.defaultHighlightColor);

        // 使用默认颜色进行高亮
        this.highlightSelectedTextWithColor('custom', this.defaultHighlightColor);

        // 清空当前上下文目标，避免下次判断错误
        this.currentContextTarget = null;

        // 隐藏菜单
        this.hideContextMenu();
    }

    /**
     * 应用当前颜色框的颜色（保留用于兼容）
     */
    applyCurrentColorFromBox() {
        console.log('🔍 应用当前颜色框颜色');

        if (!this.currentColorFill) {
            console.error('❌ 当前颜色填充元素未找到');
            return;
        }

        // 获取当前颜色
        const currentColor = this.currentColorFill.style.background ||
            window.getComputedStyle(this.currentColorFill).backgroundColor;

        console.log('🔍 当前颜色:', currentColor);

        if (!currentColor || currentColor === 'rgba(0, 0, 0, 0)' || currentColor === 'transparent') {
            console.log('🔍 使用默认颜色');
            this.highlightSelectedTextWithColor('yellow');
        } else {
            // 转换颜色格式
            const hexColor = this.rgbToHex(currentColor);
            console.log('🔍 转换后的十六进制颜色:', hexColor);
            this.highlightSelectedTextWithColor('custom', hexColor);
        }

        // 隐藏菜单
        this.hideContextMenu();
    }

    /**
     * 将RGB颜色转换为十六进制
     * @param {string} rgb - RGB颜色字符串
     * @returns {string} - 十六进制颜色字符串
     */
    rgbToHex(rgb) {
        if (!rgb) return '#FFFFC8';

        // 处理rgba格式
        const rgbaMatch = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (rgbaMatch) {
            const r = parseInt(rgbaMatch[1]);
            const g = parseInt(rgbaMatch[2]);
            const b = parseInt(rgbaMatch[3]);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }

        // 处理rgb格式
        const rgbMatch = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }

        // 如果已经是十六进制格式，直接返回
        if (rgb.startsWith('#')) {
            return rgb;
        }

        return '#FFFFC8'; // 默认颜色
    }

    /**
     * 处理右键菜单操作
     * @param {string} action - 操作类型
     */
    handleContextMenuAction(action, customColor = null) {
        if (action === 'translate-sentence') {
            // 翻译选中的句子
            this.translateSelectedSentence();
            this.hideContextMenu();
            return;
        }

        if (action === 'highlight-selection') {
            // 高亮选中的文本
            this.highlightSelectedText();
            this.hideContextMenu();
            return;
        }

        if (!this.currentContextTarget) return;

        const span = this.currentContextTarget;

        if (action === 'remove-highlight') {
            const spansToRemoveSet = new Set();
            this.applyToSelectedSpans((targetSpan) => {
                this.collectHighlightGroup(targetSpan).forEach(spanEl => spansToRemoveSet.add(spanEl));
            });

            const spansToRemove = Array.from(spansToRemoveSet);

            // 保存被删除的高亮信息（用于历史记录）
            const removedInfo = spansToRemove.map(span => ({
                highlightId: span.dataset.highlightId,
                color: span.dataset.highlightColor,
                text: span.textContent
            }));

            spansToRemove.forEach(spanEl => this.removeHighlightFromSpan(spanEl));

            if (spansToRemove.length > 0) {
                this.recalculateMergedHighlights(spansToRemove[0]);
            }

            // 添加到历史记录
            this.addToHistory('unhighlight', {
                removedSpans: removedInfo,
                spanCount: spansToRemove.length
            });

            this.hideContextMenu();
            this.hideColorPicker();
            this.hideOpacitySlider();
            this.currentContextTarget = null;
            return;
        } else if (action.startsWith('color-')) {
            // 更改高亮颜色
            const color = action.replace('color-', '');

            console.log('🔍 右键菜单颜色高亮:');
            console.log('- 颜色:', color);
            console.log('- currentSelection:', this.currentSelection);
            console.log('- selectedSpans:', this.selectedSpans);
            console.log('- selectedSpans长度:', this.selectedSpans?.length);

            // 优先使用存储的选中spans（多单词选择）
            if (this.selectedSpans && this.selectedSpans.length > 0) {
                console.log('🔍 使用存储的selectedSpans进行高亮');
                this.highlightSelectedTextWithColor(color, customColor);
            } else if (this.currentSelection && this.currentSelection.rangeCount > 0) {
                console.log('🔍 使用currentSelection进行高亮');
                // 重新获取选中的spans
                this.selectedSpans = this.getSelectedSpansFromSelection(this.currentSelection);
                this.highlightSelectedTextWithColor(color, customColor);
            } else {
                console.log('🔍 使用单个单词高亮');
                // 否则只处理单个单词
                this.highlightSingleWordWithColor(span, color, customColor);
            }
        }

        // 隐藏菜单
        this.hideContextMenu();
        this.currentContextTarget = null;
    }

    /**
     * 翻译选中的句子
     */
    async translateSelectedSentence() {
        if (!this.currentSelection || this.currentSelection.rangeCount === 0) {
            this.showError('请先选择要翻译的句子');
            return;
        }

        const selectedText = this.currentSelection.toString().trim();
        if (!selectedText) {
            this.showError('请先选择要翻译的句子');
            return;
        }

        try {
            // 显示加载状态
            this.updateStatus('正在翻译...');

            // 调用AI翻译API
            const translation = await this.translateWithAI(selectedText);

            if (translation) {
                // 高亮选中的句子（使用特殊的翻译高亮样式），返回highlightId
                const highlightId = this.highlightSelectedSentenceForTranslation();

                // 保存翻译到Map中（用于hover显示）
                if (highlightId) {
                    this.sentenceTranslationMap.set(highlightId, translation);
                }

                // 🎯 不在翻译完成时显示悬浮框，只在hover时显示
                // 翻译会在用户hover到高亮区域时自动显示

                // 保存翻译到本地存储
                this.saveSentenceTranslation(selectedText, translation);

                this.updateStatus('翻译完成 - 将光标移到高亮区域查看翻译');
            } else {
                this.showError('翻译失败，请重试');
            }
        } catch (error) {
            console.error('句子翻译错误:', error);
            this.showError('翻译失败: ' + error.message);
        }
    }

    /**
     * 为翻译的句子添加特殊高亮
     * @returns {string} highlightId - 高亮ID
     */
    highlightSelectedSentenceForTranslation() {
        if (!this.currentSelection || this.currentSelection.rangeCount === 0) return null;

        const range = this.currentSelection.getRangeAt(0);
        const spans = this.getSpansInRange(range);
        if (spans.length === 0) return null;

        // 先清除预览高亮
        this.hideSelectionHighlight();

        // 🎯 使用统一背景层逻辑高亮句子 - 使用默认紫色
        const highlightId = this.generateHighlightId();
        const rgb = this.hexToRgb(this.defaultHighlightColor);
        const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;

        // 标记选中的 span
        spans.forEach(span => {
            span.dataset.highlightId = highlightId;
            span.dataset.highlightColor = 'custom';

            const word = this.extractWord(span.textContent);
            if (word) {
                this.highlightedWords.add(word.toLowerCase());
            }
        });

        // 🎯 创建统一的高亮背景层（上下3px、圆角）
        this.createUnifiedHighlight(spans, bgColor, highlightId);

        // 添加到历史记录
        const selectedText = spans.map(s => s.textContent).join('');
        this.addToHistory('sentenceTranslate', {
            highlightId: highlightId,
            text: selectedText,
            spanCount: spans.length
        });

        // 清除选择
        this.currentSelection.removeAllRanges();
        this.currentSelection = null;

        // 返回highlightId供保存翻译使用
        return highlightId;
    }

    /**
     * 显示句子翻译结果
     * @param {string} originalText - 原文
     * @param {string} translation - 翻译
     */
    showSentenceTranslation(originalText, translation) {
        // 🎯 使用和点词翻译相同的样式
        // 创建翻译悬浮框（使用word-tooltip样式）
        const tooltip = document.createElement('div');
        tooltip.className = 'word-tooltip sentence-tooltip';
        tooltip.innerHTML = `
            <div class="word-tooltip-content">
                <div class="word-tooltip-translation">${translation}</div>
            </div>
        `;

        // 设置背景颜色为默认紫色（和句子高亮颜色一致）
        const rgb = this.hexToRgb(this.defaultHighlightColor);
        const bgColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        tooltip.style.background = bgColor;

        // 更新箭头颜色
        const style = document.createElement('style');
        style.textContent = `.sentence-tooltip::after { border-top-color: ${bgColor}; }`;
        const oldStyle = document.querySelector('style[data-sentence-tooltip-arrow]');
        if (oldStyle) oldStyle.remove();
        style.setAttribute('data-sentence-tooltip-arrow', 'true');
        document.head.appendChild(style);

        // 定位到选择区域的中心
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // 显示悬浮框以获取其尺寸
            tooltip.style.display = 'block';
            tooltip.style.visibility = 'hidden';
            document.body.appendChild(tooltip);

            const tooltipRect = tooltip.getBoundingClientRect();

            // 计算位置（居中显示在选中文本上方）
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 10;

            // 确保不超出屏幕
            if (left < 10) left = 10;
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }
            if (top < 10) {
                // 如果上方空间不够，显示在下方
                top = rect.bottom + 10;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.visibility = 'visible';
        } else {
            // 如果没有选择，显示在屏幕中央
            document.body.appendChild(tooltip);
            tooltip.style.left = '50%';
            tooltip.style.top = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
        }

        // 5秒后自动消失
        setTimeout(() => {
            if (tooltip.parentElement) {
                tooltip.remove();
            }
        }, 5000);
    }

    /**
     * 保存句子翻译到本地存储
     * @param {string} originalText - 原文
     * @param {string} translation - 翻译
     */
    saveSentenceTranslation(originalText, translation) {
        const translations = JSON.parse(localStorage.getItem('sentenceTranslations') || '[]');
        translations.push({
            original: originalText,
            translation: translation,
            timestamp: Date.now()
        });
        localStorage.setItem('sentenceTranslations', JSON.stringify(translations));
    }

    /**
     * 用指定颜色高亮选中的文本
     * @param {string} color - 颜色名称
     * @param {string} customColor - 自定义颜色值
     */
    highlightSelectedTextWithColor(color, customColor = null) {
        // 优先使用存储的选中span
        let spans = this.selectedSpans;

        // 如果没有存储的span，尝试从当前选择获取
        if (!spans || spans.length === 0) {
            const selection = this.currentSelection || window.getSelection();
            if (selection && selection.rangeCount > 0) {
                spans = this.getSelectedSpansFromSelection(selection);
            }
        }

        if (!spans || spans.length === 0) {
            console.warn('没有找到选中的span元素');
            return;
        }

        console.log('🎯 使用原生背景色高亮');

        const highlightId = this.generateHighlightId();

        // 颜色映射
        const colorMap = {
            'yellow': 'rgba(255, 255, 200, 0.6)',
            'green': 'rgba(180, 255, 180, 0.6)',
            'blue': 'rgba(180, 220, 255, 0.6)',
            'pink': 'rgba(255, 180, 220, 0.6)',
            'orange': 'rgba(255, 220, 180, 0.6)',
            'purple': 'rgba(220, 180, 255, 0.6)',
            'red': 'rgba(255, 180, 180, 0.6)',
            'cyan': 'rgba(180, 240, 255, 0.6)'
        };

        let bgColor;
        if (color === 'custom' && customColor) {
            const rgb = this.hexToRgb(customColor);
            const opacity = this.currentOpacity || 0.5;
            bgColor = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})` : colorMap['yellow'];
        } else {
            bgColor = colorMap[color] || colorMap['yellow'];
        }

        // 标记选中的 span
        spans.forEach(span => {
            span.dataset.highlightId = highlightId;
            span.dataset.highlightColor = color;

            const word = this.extractWord(span.textContent);
            if (word) {
                this.highlightedWords.add(word.toLowerCase());
            }
        });

        // 🎯 创建统一的高亮背景层（像 ::selection 那样连续）
        this.createUnifiedHighlight(spans, bgColor, highlightId);

        // 清除选择状态
        const selection = this.currentSelection || window.getSelection();
        if (selection && selection.rangeCount > 0) {
            selection.removeAllRanges();
        }

        this.currentSelection = null;
        this.selectedSpans = null;

        // 添加到历史记录
        const selectedText = spans.map(s => s.textContent).join('');
        this.addToHistory('highlight', {
            highlightId: highlightId,
            color: color,
            text: selectedText,
            spanCount: spans.length
        });

        console.log('✅ 高亮完成（统一背景层）');
    }

    /**
     * 获取span当前高亮颜色（用于合并高亮）
     * @param {HTMLElement} span
     * @returns {string} rgba颜色值
     */
    getSpanHighlightColor(span) {
        if (!span) return 'rgba(255, 255, 200, 0.6)';

        // 优先从CSS变量获取
        const varColor = span.style.getPropertyValue('--highlight-color');
        if (varColor) {
            return varColor;
        }

        // 从::before伪元素的计算样式获取
        const pseudoColor = window.getComputedStyle(span, '::before').backgroundColor;
        if (pseudoColor && pseudoColor !== 'rgba(0, 0, 0, 0)' && pseudoColor !== 'transparent') {
            return pseudoColor;
        }

        // 退化到span本身背景色
        const inlineColor = span.style.backgroundColor;
        if (inlineColor) {
            return inlineColor;
        }

        return 'rgba(255, 255, 200, 0.6)';
    }

    /**
     * 移除span上的高亮相关样式
     * @param {HTMLElement} span
     */
    removeHighlightFromSpan(span) {
        // 获取 highlightId
        const highlightId = span.dataset.highlightId;

        // 移除标记
        delete span.dataset.highlightId;
        delete span.dataset.highlightColor;

        const word = this.extractWord(span.textContent);
        if (word) {
            this.highlightedWords.delete(word.toLowerCase());
        }

        // 🎯 删除对应的统一高亮背景层
        if (highlightId) {
            const highlights = document.querySelectorAll(`.unified-highlight[data-highlight-id="${highlightId}"]`);
            highlights.forEach(h => h.remove());
        }
    }

    /**
     * 用指定颜色高亮单个单词
     * @param {HTMLElement} span - span元素
     * @param {string} color - 颜色名称
     * @param {string} customColor - 自定义颜色值
     */
    highlightSingleWordWithColor(span, color, customColor = null) {
        // 🎯 简化：直接设置背景色
        const colorMap = {
            'yellow': 'rgba(255, 255, 200, 0.6)',
            'green': 'rgba(180, 255, 180, 0.6)',
            'blue': 'rgba(180, 220, 255, 0.6)',
            'pink': 'rgba(255, 180, 220, 0.6)',
            'orange': 'rgba(255, 220, 180, 0.6)',
            'purple': 'rgba(220, 180, 255, 0.6)',
            'red': 'rgba(255, 180, 180, 0.6)',
            'cyan': 'rgba(180, 240, 255, 0.6)'
        };

        let bgColor;
        if (color === 'custom' && customColor) {
            const rgb = this.hexToRgb(customColor);
            const opacity = this.currentOpacity || 0.5;
            bgColor = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})` : colorMap['yellow'];
        } else {
            bgColor = colorMap[color] || colorMap['yellow'];
        }

        const highlightId = this.generateHighlightId();
        span.dataset.highlightId = highlightId;
        span.dataset.highlightColor = color;

        const word = this.extractWord(span.textContent);
        if (word) {
            this.highlightedWords.add(word.toLowerCase());
        }

        // 🎯 创建统一的高亮背景层
        this.createUnifiedHighlight([span], bgColor, highlightId);

        // 添加到历史记录
        this.addToHistory('highlight', {
            highlightId: highlightId,
            color: color,
            text: span.textContent,
            spanCount: 1
        });
    }

    /**
     * 将hex颜色转换为RGB对象
     * @param {string} hex - hex颜色值 (如 #ff0000)
     * @returns {Object} - {r, g, b} 对象
     */
    hexToRgb(hex) {
        // 移除#号
        hex = hex.replace(/^#/, '');

        // 处理3位简写形式
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }

        const bigint = parseInt(hex, 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255
        };
    }

    /**
     * 切换调色板显示/隐藏
     */
    toggleColorPicker() {
        if (!this.colorPickerPanel) return;

        const isVisible = this.colorPickerPanel.style.display === 'block';

        if (isVisible) {
            this.hideColorPicker();
        } else {
            // 显示调色板
            this.colorPickerPanel.style.display = 'block';

            // 定位到右键菜单下方
            const menuRect = this.contextMenu.getBoundingClientRect();
            const panelRect = this.colorPickerPanel.getBoundingClientRect();

            let left = menuRect.left;
            let top = menuRect.bottom + 5;

            // 避免超出屏幕
            if (left + panelRect.width > window.innerWidth) {
                left = window.innerWidth - panelRect.width - 5;
            }
            if (top + panelRect.height > window.innerHeight) {
                top = menuRect.top - panelRect.height - 5;
            }

            this.colorPickerPanel.style.left = left + 'px';
            this.colorPickerPanel.style.top = top + 'px';
        }
    }

    /**
     * 隐藏调色板
     */
    hideColorPicker() {
        if (this.colorPickerPanel) {
            this.colorPickerPanel.style.display = 'none';
        }
    }

    /**
     * 切换透明度滑块显示/隐藏
     */
    toggleOpacitySlider() {
        if (!this.opacitySliderPanel) return;

        const isVisible = this.opacitySliderPanel.style.display === 'block';

        if (isVisible) {
            this.hideOpacitySlider();
        } else {
            // 显示透明度滑块
            this.opacitySliderPanel.style.display = 'block';

            // 获取当前高亮的透明度（从CSS变量或伪元素）
            if (this.currentContextTarget) {
                // 优先从CSS变量读取
                let bgColor = this.currentContextTarget.style.getPropertyValue('--highlight-color');

                // 如果没有CSS变量，从::before伪元素读取
                if (!bgColor) {
                    bgColor = window.getComputedStyle(this.currentContextTarget, '::before').backgroundColor;
                }

                const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match && match[4]) {
                    const opacity = parseFloat(match[4]);
                    this.currentOpacity = opacity;
                    const opacitySlider = document.getElementById('opacitySlider');
                    const opacityValue = document.getElementById('opacityValue');
                    if (opacitySlider && opacityValue) {
                        opacitySlider.value = Math.round(opacity * 100);
                        opacityValue.textContent = Math.round(opacity * 100) + '%';
                    }
                } else {
                    // 如果没有透明度值（rgb格式），默认为60%
                    this.currentOpacity = 0.6;
                    const opacitySlider = document.getElementById('opacitySlider');
                    const opacityValue = document.getElementById('opacityValue');
                    if (opacitySlider && opacityValue) {
                        opacitySlider.value = 60;
                        opacityValue.textContent = '60%';
                    }
                }
            }

            // 定位到右键菜单下方
            const menuRect = this.contextMenu.getBoundingClientRect();
            const panelRect = this.opacitySliderPanel.getBoundingClientRect();

            let left = menuRect.left;
            let top = menuRect.bottom + 5;

            // 避免超出屏幕
            if (left + panelRect.width > window.innerWidth) {
                left = window.innerWidth - panelRect.width - 5;
            }
            if (top + panelRect.height > window.innerHeight) {
                top = menuRect.top - panelRect.height - 5;
            }

            this.opacitySliderPanel.style.left = left + 'px';
            this.opacitySliderPanel.style.top = top + 'px';
        }
    }

    /**
     * 隐藏透明度滑块
     */
    hideOpacitySlider() {
        if (this.opacitySliderPanel) {
            this.opacitySliderPanel.style.display = 'none';
        }
    }

    /**
     * 应用透明度到当前目标
     */
    applyOpacityToCurrentTarget() {
        if (!this.currentContextTarget) return;

        const spansToUpdate = new Set();
        this.applyToSelectedSpans((span) => {
            this.collectHighlightGroup(span).forEach(spanEl => spansToUpdate.add(spanEl));
        });

        spansToUpdate.forEach((span) => {
            let bgColor = span.style.getPropertyValue('--highlight-color') ||
                window.getComputedStyle(span, '::before').backgroundColor;

            const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                const r = match[1];
                const g = match[2];
                const b = match[3];

                if (!span.dataset.highlightId) {
                    span.dataset.highlightId = this.generateHighlightId();
                }

                if (span.classList.contains('color-custom')) {
                    span.style.setProperty('--highlight-color', `rgba(${r}, ${g}, ${b}, ${this.currentOpacity})`);
                } else {
                    span.classList.remove('color-yellow', 'color-green', 'color-blue', 'color-pink',
                        'color-orange', 'color-purple', 'color-red', 'color-cyan');
                    span.classList.add('color-custom');
                    span.style.setProperty('--highlight-color', `rgba(${r}, ${g}, ${b}, ${this.currentOpacity})`);
                }
            }
        });

        if (spansToUpdate.size > 0) {
            const [firstSpan] = spansToUpdate;
            this.recalculateMergedHighlights(firstSpan);
        }
    }

    /**
     * 应用高亮颜色
     * @param {string} color - 颜色hex值
     */
    applyHighlightColor(color) {
        if (!this.currentContextTarget) return;

        console.log('🔍 应用高亮颜色:', color);

        const rgb = this.hexToRgb(color);
        const opacity = this.currentOpacity || 0.5;
        const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;

        // 检查当前目标是否已有高亮
        const highlightId = this.currentContextTarget.dataset.highlightId;

        if (highlightId) {
            // 已有高亮：直接改变颜色
            console.log('🔍 改变已有高亮的颜色:', highlightId);

            // 找到所有相同highlightId的unified-highlight div
            const highlightDivs = document.querySelectorAll(`.unified-highlight[data-highlight-id="${highlightId}"]`);
            highlightDivs.forEach(div => {
                div.style.backgroundColor = bgColor;
            });

            // 找到所有相同highlightId的span（用于后续操作）
            const spans = document.querySelectorAll(`span[data-highlight-id="${highlightId}"]`);
            spans.forEach(span => {
                span.dataset.highlightColor = 'custom';
            });
        } else {
            // 没有高亮：应用到选中的span
            console.log('🔍 应用新高亮');
            const spansToApply = [];
            this.applyToSelectedSpans((span) => {
                spansToApply.push(span);
            });

            if (spansToApply.length === 0) return;

            const newHighlightId = this.generateHighlightId();

            spansToApply.forEach((span) => {
                span.dataset.highlightId = newHighlightId;
                span.dataset.highlightColor = 'custom';

                const word = this.extractWord(span.textContent);
                if (word) {
                    this.highlightedWords.add(word.toLowerCase());
                }
            });

            // 创建统一高亮背景层
            this.createUnifiedHighlight(spansToApply, bgColor, newHighlightId);
        }

        // 更新默认颜色和颜色圆形显示
        this.defaultHighlightColor = color;
        if (this.currentColorFill) {
            this.currentColorFill.style.background = color;
        }

        // 清空当前上下文目标，避免下次判断错误
        this.currentContextTarget = null;

        console.log('🔍 更新默认高亮颜色为:', color);
    }

    /**
     * 切换下划线
     */
    toggleUnderline() {
        console.log('🔍 切换下划线');

        // 获取要操作的spans
        const spansToToggle = new Set();

        // 优先使用选中的spans（文本选择）
        if (this.selectedSpans && this.selectedSpans.length > 0) {
            console.log('🔍 使用selectedSpans:', this.selectedSpans.length);
            this.selectedSpans.forEach(span => {
                this.collectHighlightGroup(span).forEach(spanEl => spansToToggle.add(spanEl));
            });
        }
        // 否则使用右键目标（单个单词）
        else if (this.currentContextTarget) {
            console.log('🔍 使用currentContextTarget');
            this.applyToSelectedSpans((span) => {
                this.collectHighlightGroup(span).forEach(spanEl => spansToToggle.add(spanEl));
            });
        } else {
            console.log('❌ 没有可操作的spans');
            return;
        }

        if (spansToToggle.size === 0) {
            console.log('❌ spansToToggle为空');
            return;
        }

        // 检查是否已有下划线（检查第一个span）
        const firstSpan = Array.from(spansToToggle)[0];
        const hasUnderline = firstSpan.classList.contains('word-underlined');

        console.log('🔍 hasUnderline:', hasUnderline, 'spans数量:', spansToToggle.size);

        if (hasUnderline) {
            // 删除下划线
            spansToToggle.forEach((span) => {
                span.classList.remove('word-underlined');
                // 删除对应的统一下划线层
                const underlineId = span.dataset.underlineId;
                if (underlineId) {
                    const underlineDivs = document.querySelectorAll(`.unified-underline[data-underline-id="${underlineId}"]`);
                    underlineDivs.forEach(div => div.remove());
                    delete span.dataset.underlineId;
                }
            });
        } else {
            // 添加下划线 - 使用统一下划线层
            const underlineId = this.generateHighlightId(); // 复用ID生成方法
            const spansArray = Array.from(spansToToggle);

            spansArray.forEach((span) => {
                span.classList.add('word-underlined');
                span.dataset.underlineId = underlineId;
            });

            // 创建统一的下划线层
            this.createUnifiedUnderline(spansArray, underlineId);

            // 添加到历史记录
            const text = spansArray.map(s => s.textContent).join('');
            this.addToHistory('underline', {
                underlineId: underlineId,
                text: text,
                spanCount: spansArray.length
            });
        }

        this.hideContextMenu();
        this.hideColorPicker();
    }

    /**
     * 复制文本
     */
    copyWordText() {
        let text = '';

        // 优先使用当前选择
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            text = selection.toString().trim();
            console.log('🔍 从当前选择复制文本:', text);
        }

        // 如果没有选择，尝试使用存储的选中span
        if (!text && this.selectedSpans && this.selectedSpans.length > 0) {
            // 正确拼接span内容，保持原始格式
            text = this.reconstructTextFromSpans(this.selectedSpans);
            console.log('🔍 从存储的span复制文本:', text);
        }

        // 如果还是没有，尝试使用右键目标
        if (!text && this.currentContextTarget) {
            text = this.extractWord(this.currentContextTarget.textContent);
            console.log('🔍 从右键目标复制文本:', text);
        }

        if (text) {
            // 使用Clipboard API复制文本
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    console.log('文本已复制:', text);
                    this.showToast('已复制: ' + text);
                }).catch(err => {
                    console.error('复制失败:', err);
                    this.fallbackCopyText(text);
                });
            } else {
                // 降级方案
                this.fallbackCopyText(text);
            }
        } else {
            console.warn('没有可复制的文本');
            this.showToast('没有选中文本');
        }

        this.selectedSpans = null; // 清空选择
        this.hideContextMenu();
    }

    /**
     * 从span数组重构文本（保持原始格式和空格）
     * @param {HTMLElement[]} spans - span元素数组
     * @returns {string} - 重构的文本
     */
    reconstructTextFromSpans(spans) {
        if (!spans || spans.length === 0) return '';

        // 按DOM顺序排序
        const sortedSpans = [...spans].sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                return -1; // a在b之前
            } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                return 1;  // a在b之后
            }
            return 0; // 相同位置
        });

        // 拼接所有span的内容
        const text = sortedSpans.map(span => span.textContent).join('');

        console.log('🔍 重构文本:');
        console.log('span数量:', sortedSpans.length);
        console.log('重构结果:', text);
        sortedSpans.forEach((span, index) => {
            console.log(`  ${index}: "${span.textContent}"`);
        });

        return text;
    }

    /**
     * 降级复制方案（兼容性）
     * @param {string} text - 要复制的文本
     */
    fallbackCopyText(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
            console.log('文本已复制（降级方案）:', text);
            this.showToast('已复制: ' + text);
        } catch (err) {
            console.error('复制失败（降级方案）:', err);
        }

        document.body.removeChild(textarea);
    }

    /**
     * 显示临时提示
     * @param {string} message - 提示消息
     */
    showToast(message) {
        // 创建临时提示元素
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 14px;
            z-index: 10003;
            animation: fadeInOut 2s ease;
        `;

        document.body.appendChild(toast);

        // 2秒后移除
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 2000);
    }

    /**
     * 删除所有标记（高亮和下划线）
     */
    clearAllMarks() {
        const spansToRemoveSet = new Set();

        this.applyToSelectedSpans((span) => {
            this.collectHighlightGroup(span).forEach(spanEl => spansToRemoveSet.add(spanEl));
        });

        const spansToRemove = Array.from(spansToRemoveSet);

        spansToRemove.forEach(spanEl => {
            this.removeHighlightFromSpan(spanEl);
            spanEl.classList.remove('word-underlined');

            // 删除统一下划线层
            const underlineId = spanEl.dataset.underlineId;
            if (underlineId) {
                const underlineDivs = document.querySelectorAll(`.unified-underline[data-underline-id="${underlineId}"]`);
                underlineDivs.forEach(div => div.remove());
                delete spanEl.dataset.underlineId;
            }
        });

        if (spansToRemove.length > 0) {
            this.recalculateMergedHighlights(spansToRemove[0]);
        }

        this.hideContextMenu();
        this.hideColorPicker();
        this.currentContextTarget = null;
    }

    /**
     * 处理文本选择的右键菜单
     * @param {Event} e - 右键事件
     * @param {Selection} selection - 选择对象
     */
    handleTextSelection(e, selection) {
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // 获取选择范围内的所有span元素
        const container = range.commonAncestorContainer;
        let spans = [];

        if (container.nodeType === Node.TEXT_NODE) {
            // 如果是文本节点，获取其父span
            const parentSpan = container.parentElement;
            if (parentSpan && parentSpan.tagName === 'SPAN') {
                spans.push(parentSpan);
            }
        } else if (container.nodeType === Node.ELEMENT_NODE) {
            // 获取范围内的所有span
            const allSpans = container.querySelectorAll('span');
            allSpans.forEach(span => {
                if (selection.containsNode(span, true)) {
                    spans.push(span);
                }
            });
        }

        // 如果没有找到span，尝试获取起始节点的父span
        if (spans.length === 0) {
            const startSpan = range.startContainer.parentElement?.closest('span');
            if (startSpan) {
                spans.push(startSpan);
            }
        }

        // 保存选中的spans，用于批量操作
        this.selectedSpans = spans;
        this.currentContextTarget = spans[0]; // 用第一个span作为当前目标

        this.showContextMenu(e.clientX, e.clientY);
    }

    /**
     * 应用操作到所有选中的spans（重写以支持批量操作）
     */
    applyToSelectedSpans(callback) {
        if (this.selectedSpans && this.selectedSpans.length > 0) {
            this.selectedSpans.forEach(span => {
                callback(span);
            });
            this.selectedSpans = null; // 清空选择
        } else if (this.currentContextTarget) {
            callback(this.currentContextTarget);
        }
    }

    /**
     * 合并相邻的选择预览高亮
     * @param {HTMLElement} span - 起始span元素
     */
    mergeAdjacentSelectionHighlights(span) {
        if (!span || !span.classList.contains('selection-preview')) return;

        const parent = span.parentElement;
        if (!parent) return;

        const previewSpans = Array.from(parent.querySelectorAll('span.selection-preview'));
        if (previewSpans.length < 2) return;

        previewSpans.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            if (Math.abs(rectA.top - rectB.top) > 5) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });

        const groups = [];
        let currentGroup = [previewSpans[0]];

        for (let i = 1; i < previewSpans.length; i++) {
            const prev = previewSpans[i - 1];
            const curr = previewSpans[i];

            if (this.areAdjacent(prev, curr)) {
                currentGroup.push(curr);
            } else {
                groups.push(currentGroup);
                currentGroup = [curr];
            }
        }
        groups.push(currentGroup);

        groups.forEach(group => {
            if (group.length > 1) {
                this.createMergedSelectionHighlight(group);
            }
        });
    }

    /**
     * 创建合并的选择预览高亮
     * @param {HTMLElement[]} spans - 要合并的span元素数组
     */
    createMergedSelectionHighlight(spans) {
        if (spans.length < 2) return;

        const firstSpan = spans[0];
        const lastSpan = spans[spans.length - 1];

        const firstRect = firstSpan.getBoundingClientRect();
        const lastRect = lastSpan.getBoundingClientRect();

        const containerRect = firstSpan.parentElement.getBoundingClientRect();

        const left = firstRect.left - containerRect.left;
        const top = firstRect.top - containerRect.top;
        const width = lastRect.right - firstRect.left;
        const height = Math.max(firstRect.height, lastRect.height);

        const mergedHighlight = document.createElement('div');
        mergedHighlight.className = 'merged-selection-highlight';
        mergedHighlight.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${width}px;
            height: ${height}px;
            background-color: rgba(255, 255, 0, 0.3);
            pointer-events: none;
            z-index: 1;
        `;

        firstSpan.parentElement.appendChild(mergedHighlight);

        // 为合并的span添加标记类
        spans.forEach(span => {
            span.classList.add('merged-selection-preview');
        });
    }

    /**
     * 合并相邻的高亮单词，形成连续矩形高亮
     * @param {HTMLElement} span - 当前高亮的span元素
     */
    mergeAdjacentHighlights(span) {
        if (!span || !span.classList.contains('word-highlighted')) return;

        // 获取当前span的父容器
        const parent = span.parentElement;
        if (!parent) return;

        // 获取所有高亮的span元素
        const highlightedSpans = Array.from(parent.querySelectorAll('span.word-highlighted'));
        if (highlightedSpans.length < 2) return;

        // 清除现有的合并高亮，避免残留
        const existingMerged = parent.querySelectorAll('.merged-highlight');
        existingMerged.forEach(el => el.remove());

        const previouslyMerged = parent.querySelectorAll('span.merged-highlighted');
        previouslyMerged.forEach(el => el.classList.remove('merged-highlighted'));

        // 按位置排序
        highlightedSpans.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();

            // 先按行排序，再按列排序
            if (Math.abs(rectA.top - rectB.top) > 5) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });

        // 查找连续的相邻高亮
        const groups = [];
        let currentGroup = [highlightedSpans[0]];

        for (let i = 1; i < highlightedSpans.length; i++) {
            const prev = highlightedSpans[i - 1];
            const curr = highlightedSpans[i];

            if (this.areAdjacent(prev, curr)) {
                currentGroup.push(curr);
            } else {
                groups.push(currentGroup);
                currentGroup = [curr];
            }
        }
        groups.push(currentGroup);

        // 为每个连续组创建合并的高亮
        groups.forEach(group => {
            if (group.length > 1) {
                this.createMergedHighlight(group);
            }
        });
    }

    /**
     * 检查两个span是否相邻
     * @param {HTMLElement} span1 - 第一个span
     * @param {HTMLElement} span2 - 第二个span
     * @returns {boolean} 是否相邻
     */
    areAdjacent(span1, span2) {
        const rect1 = span1.getBoundingClientRect();
        const rect2 = span2.getBoundingClientRect();

        // 检查是否在同一行（垂直位置相近）
        const verticalDiff = Math.abs(rect1.top - rect2.top);
        if (verticalDiff > 5) return false;

        // 检查是否水平相邻（右边界接近左边界）
        const horizontalDiff = Math.abs(rect1.right - rect2.left);
        return horizontalDiff <= 10; // 允许10px的间距
    }

    /**
     * 为连续的span组创建合并的高亮
     * @param {HTMLElement[]} spans - 连续的span数组
     */
    createMergedHighlight(spans) {
        if (spans.length < 2) return;

        // 计算合并后的边界
        const rects = spans.map(span => span.getBoundingClientRect());
        const minLeft = Math.min(...rects.map(r => r.left));
        const maxRight = Math.max(...rects.map(r => r.right));
        const minTop = Math.min(...rects.map(r => r.top));
        const maxBottom = Math.max(...rects.map(r => r.bottom));

        const parent = spans[0].parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const left = minLeft - parentRect.left;
        const top = minTop - parentRect.top;
        const width = Math.max(1, maxRight - minLeft);
        const height = Math.max(1, maxBottom - minTop);
        const background = this.getSpanHighlightColor(spans[0]);

        // 创建合并高亮的容器
        const mergedHighlight = document.createElement('div');
        mergedHighlight.className = 'merged-highlight';
        mergedHighlight.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${width}px;
            height: ${height}px;
            background: ${background};
            z-index: 1;
            pointer-events: none;
        `;

        parent.appendChild(mergedHighlight);

        // 为每个span添加合并标记
        spans.forEach(span => {
            span.classList.add('merged-highlighted');
        });
    }

    /**
     * 重新计算合并高亮（当移除某个高亮单词后）
     * @param {HTMLElement} removedSpan - 被移除的span元素
     */
    recalculateMergedHighlights(removedSpan) {
        // 清除所有现有的合并高亮
        const parent = removedSpan.parentElement;
        if (parent) {
            const existingMerged = parent.querySelectorAll('.merged-highlight');
            existingMerged.forEach(el => el.remove());
        }

        // 清除所有合并标记
        const allSpans = document.querySelectorAll('span.merged-highlighted');
        allSpans.forEach(span => {
            span.classList.remove('merged-highlighted');
        });

        // 重新计算所有高亮单词的合并
        const highlightedSpans = Array.from(document.querySelectorAll('span.word-highlighted'));
        if (highlightedSpans.length > 1) {
            // 按位置排序
            highlightedSpans.sort((a, b) => {
                const rectA = a.getBoundingClientRect();
                const rectB = b.getBoundingClientRect();

                if (Math.abs(rectA.top - rectB.top) > 5) {
                    return rectA.top - rectB.top;
                }
                return rectA.left - rectB.left;
            });

            // 重新分组
            const groups = [];
            let currentGroup = [highlightedSpans[0]];

            for (let i = 1; i < highlightedSpans.length; i++) {
                const prev = highlightedSpans[i - 1];
                const curr = highlightedSpans[i];

                if (this.areAdjacent(prev, curr)) {
                    currentGroup.push(curr);
                } else {
                    groups.push(currentGroup);
                    currentGroup = [curr];
                }
            }
            groups.push(currentGroup);

            // 为每个连续组创建合并的高亮
            groups.forEach(group => {
                if (group.length > 1) {
                    this.createMergedHighlight(group);
                }
            });
        }
    }

    // ==================== 撤销/重做和保存功能 ====================

    /**
     * 添加操作到历史记录
     * @param {string} type - 操作类型（'highlight', 'unhighlight', 'translate'等）
     * @param {object} data - 操作数据
     */
    addToHistory(type, data) {
        // 如果当前不在历史栈的末尾，删除后面的记录
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }

        // 添加新记录
        const historyItem = {
            type: type,
            data: data,
            timestamp: Date.now(),
            state: this.getCurrentState()
        };

        this.historyStack.push(historyItem);
        this.historyIndex++;

        // 限制历史记录大小
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
            this.historyIndex--;
        }

        console.log(`📝 ${type} - 历史位置: ${this.historyIndex}/${this.historyStack.length - 1}`);

        // 标记为未保存
        this.markAsDirty();

        // 更新按钮状态
        this.updateUndoRedoButtons();
    }

    /**
     * 撤销操作
     */
    undo() {
        if (this.historyIndex < 0) {
            console.log('⚠️ 没有可撤销的操作');
            return;
        }

        console.log(`⬅️ 撤销操作，从位置 ${this.historyIndex} 到 ${this.historyIndex - 1}`);

        // 移动到上一个状态
        this.historyIndex--;

        // 恢复状态
        if (this.historyIndex >= 0) {
            this.loadState(this.historyStack[this.historyIndex].state);
        } else {
            // 恢复到初始状态（无高亮）
            this.clearAllHighlights();
        }

        // 更新按钮状态
        this.updateUndoRedoButtons();
        this.refreshDirtyState();
        this.updateStatus('已撤销');
    }

    /**
     * 重做操作
     */
    redo() {
        if (this.historyIndex >= this.historyStack.length - 1) {
            console.log('⚠️ 没有可重做的操作');
            return;
        }

        console.log(`➡️ 重做操作，从位置 ${this.historyIndex} 到 ${this.historyIndex + 1}`);

        // 移动到下一个状态
        this.historyIndex++;

        // 恢复状态
        this.loadState(this.historyStack[this.historyIndex].state);

        // 更新按钮状态
        this.updateUndoRedoButtons();
        this.refreshDirtyState();
        this.updateStatus('已重做');
    }

    /**
     * 更新撤销/重做按钮的状态
     */
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) {
            const shouldDisable = this.historyIndex < 0;
            undoBtn.disabled = shouldDisable;
            undoBtn.classList.toggle('btn-disabled', shouldDisable);
        }

        if (redoBtn) {
            const shouldDisable = this.historyIndex >= this.historyStack.length - 1;
            redoBtn.disabled = shouldDisable;
            redoBtn.classList.toggle('btn-disabled', shouldDisable);
        }

        console.log('按钮状态更新:', {
            historyIndex: this.historyIndex,
            stackLength: this.historyStack.length,
            canUndo: this.historyIndex >= 0,
            canRedo: this.historyIndex < this.historyStack.length - 1
        });
    }

    /**
     * 获取当前状态
     * @returns {object} 当前状态对象
     */
    getCurrentState() {
        const state = {
            highlights: [],
            underlines: [],
            wordTranslations: {},
            sentenceTranslations: {}
        };

        // 收集所有高亮的span（按highlightId分组）
        const highlightGroups = new Map(); // highlightId -> { spans, color, rects }

        const highlightedSpans = document.querySelectorAll('.pdf-text-layer span[data-highlight-id]');
        highlightedSpans.forEach(span => {
            const highlightId = span.dataset.highlightId;
            if (!highlightId) return;

            if (!highlightGroups.has(highlightId)) {
                highlightGroups.set(highlightId, {
                    spans: [],
                    color: span.style.backgroundColor || span.dataset.highlightColor,
                    rects: []
                });
            }
            highlightGroups.get(highlightId).spans.push(span);
        });

        // 为每个highlightId收集位置信息
        highlightGroups.forEach((group, highlightId) => {
            if (group.spans.length === 0) return;

            const firstSpan = group.spans[0];
            const pageIndex = this.getPageIndexOfSpan(firstSpan);
            const pageInfo = this.pdfPageInfo ? this.pdfPageInfo.get(pageIndex) : null;

            // 获取该highlightId的所有背景div
            const highlightDivs = document.querySelectorAll(`.unified-highlight[data-highlight-id="${highlightId}"]`);
            const rects = [];
            let actualColor = group.color; // 默认使用group中的颜色

            highlightDivs.forEach(div => {
                // 从div获取实际颜色（这是真正的颜色值）
                if (div.style.backgroundColor) {
                    actualColor = div.style.backgroundColor;
                }

                // 前端坐标（基于scale=2.0的viewport）
                const frontendX = parseFloat(div.style.left) || 0;
                const frontendY = parseFloat(div.style.top) || 0;
                const frontendWidth = parseFloat(div.style.width) || 0;
                const frontendHeight = parseFloat(div.style.height) || 0;

                // 转换为PDF原始坐标
                let pdfRect;
                if (pageInfo) {
                    const scale = pageInfo.scale; // 2.0
                    const pdfHeight = pageInfo.height; // PDF原始高度

                    pdfRect = {
                        x: frontendX / scale,
                        y: pdfHeight - (frontendY / scale) - (frontendHeight / scale),
                        width: frontendWidth / scale,
                        height: frontendHeight / scale
                    };
                } else {
                    pdfRect = {
                        x: frontendX / 2.0,
                        y: frontendY / 2.0,
                        width: frontendWidth / 2.0,
                        height: frontendHeight / 2.0
                    };
                }
                rects.push(pdfRect);
            });

            // 如果还是没有颜色，使用默认颜色
            if (!actualColor || actualColor === 'custom' || actualColor === 'transparent') {
                actualColor = 'rgba(255, 255, 200, 0.6)'; // 默认黄色
            }

            // 保存这个高亮组（一个highlightId对应一个条目）
            state.highlights.push({
                highlightId: highlightId,
                text: group.spans.map(s => s.textContent).join(''),
                color: actualColor, // 使用从div获取的实际颜色
                highlightColor: firstSpan.dataset.highlightColor,
                pageIndex: pageIndex,
                spanIndices: group.spans.map(s => this.getSpanIndexInPage(s)), // 保存所有span的索引
                rects: rects // 所有矩形（可能跨多行）
            });
        });

        // 收集所有下划线（按underlineId分组）
        const underlineGroups = new Map(); // underlineId -> { spans }

        const underlinedSpans = document.querySelectorAll('.pdf-text-layer span[data-underline-id]');
        console.log('📝 收集下划线，找到span数量:', underlinedSpans.length);

        underlinedSpans.forEach(span => {
            const underlineId = span.dataset.underlineId;
            if (!underlineId) {
                console.warn('⚠️ span没有underlineId:', span);
                return;
            }

            if (!underlineGroups.has(underlineId)) {
                underlineGroups.set(underlineId, {
                    spans: []
                });
            }
            underlineGroups.get(underlineId).spans.push(span);
        });

        console.log('📝 下划线分组数量:', underlineGroups.size);

        // 为每个underlineId保存数据
        underlineGroups.forEach((group, underlineId) => {
            if (group.spans.length === 0) return;

            const firstSpan = group.spans[0];
            const pageIndex = this.getPageIndexOfSpan(firstSpan);

            state.underlines.push({
                underlineId: underlineId,
                text: group.spans.map(s => s.textContent).join(''),
                pageIndex: pageIndex,
                spanIndices: group.spans.map(s => this.getSpanIndexInPage(s))
            });
        });

        console.log('📝 保存的下划线数量:', state.underlines.length);

        // 收集翻译数据
        this.wordTranslationMap.forEach((value, key) => {
            state.wordTranslations[key] = value;
        });

        this.sentenceTranslationMap.forEach((value, key) => {
            state.sentenceTranslations[key] = value;
        });

        return state;
    }

    /**
     * 加载状态
     * @param {object} state - 要加载的状态对象
     */
    loadState(state) {
        if (!state) return;

        console.log('🔄 加载状态:', state);

        // 清除所有当前高亮
        this.clearAllHighlights();

        // 恢复高亮
        state.highlights.forEach(highlight => {
            const spans = [];

            // 支持新旧两种格式
            if (highlight.spanIndices && Array.isArray(highlight.spanIndices)) {
                // 新格式：spanIndices数组
                highlight.spanIndices.forEach(spanIndex => {
                    const span = this.findSpanByPosition(highlight.pageIndex, spanIndex);
                    if (span) {
                        spans.push(span);
                    }
                });
            } else if (highlight.spanIndex !== undefined) {
                // 旧格式：单个spanIndex
                const span = this.findSpanByPosition(highlight.pageIndex, highlight.spanIndex);
                if (span) {
                    spans.push(span);
                }
            }

            // 为所有span设置高亮属性（但不设置backgroundColor，由unified-highlight div处理）
            spans.forEach(span => {
                // 不设置span.style.backgroundColor，避免与unified-highlight重复
                if (highlight.highlightId) {
                    span.dataset.highlightId = highlight.highlightId;
                }
                if (highlight.highlightColor) {
                    span.dataset.highlightColor = highlight.highlightColor;
                }
            });

            // 重建统一高亮背景（这是唯一的高亮层）
            if (spans.length > 0) {
                this.createUnifiedHighlight(
                    spans,
                    highlight.color || 'rgba(255, 255, 200, 0.6)',
                    highlight.highlightId
                );
            }
        });

        // 恢复下划线
        if (state.underlines && state.underlines.length > 0) {
            state.underlines.forEach(underline => {
                const spans = [];

                if (underline.spanIndices && Array.isArray(underline.spanIndices)) {
                    underline.spanIndices.forEach(spanIndex => {
                        const span = this.findSpanByPosition(underline.pageIndex, spanIndex);
                        if (span) {
                            spans.push(span);
                        }
                    });
                }

                // 为所有span设置下划线属性
                spans.forEach(span => {
                    span.dataset.underlineId = underline.underlineId;
                    span.classList.add('word-underlined');
                });

                // 重建统一下划线
                if (spans.length > 0) {
                    this.createUnifiedUnderline(spans, underline.underlineId);
                }
            });
        }

        // 恢复翻译数据
        this.wordTranslationMap.clear();
        Object.keys(state.wordTranslations || {}).forEach(key => {
            this.wordTranslationMap.set(key, state.wordTranslations[key]);
        });

        this.sentenceTranslationMap.clear();
        Object.keys(state.sentenceTranslations || {}).forEach(key => {
            this.sentenceTranslationMap.set(key, state.sentenceTranslations[key]);
        });
    }

    /**
     * 清除所有高亮和下划线
     */
    clearAllHighlights() {
        // 清除span上的高亮样式和属性
        const highlightedSpans = document.querySelectorAll('.pdf-text-layer span[data-highlight-id]');
        highlightedSpans.forEach(span => {
            span.style.backgroundColor = '';
            delete span.dataset.highlightId;
            delete span.dataset.highlightColor;
        });

        // 清除所有统一高亮背景层
        const highlightDivs = document.querySelectorAll('.unified-highlight');
        highlightDivs.forEach(div => div.remove());

        // 清除span上的下划线属性
        const underlinedSpans = document.querySelectorAll('.pdf-text-layer span[data-underline-id]');
        underlinedSpans.forEach(span => {
            delete span.dataset.underlineId;
            span.classList.remove('word-underlined');
        });

        // 清除所有统一下划线层
        const underlineDivs = document.querySelectorAll('.unified-underline');
        underlineDivs.forEach(div => div.remove());
    }

    /**
     * 根据位置查找span元素
     */
    getPageIndexOfSpan(span) {
        const textLayer = span.closest('.pdf-text-layer');
        if (!textLayer) return 0;
        const allTextLayers = document.querySelectorAll('.pdf-text-layer');
        return Array.from(allTextLayers).indexOf(textLayer);
    }

    getSpanIndexInPage(span) {
        const textLayer = span.closest('.pdf-text-layer');
        if (!textLayer) return 0;
        const allSpans = textLayer.querySelectorAll('span');
        return Array.from(allSpans).indexOf(span);
    }

    findSpanByPosition(pageIndex, spanIndex) {
        const allTextLayers = document.querySelectorAll('.pdf-text-layer');
        if (pageIndex >= allTextLayers.length) return null;
        const textLayer = allTextLayers[pageIndex];
        const allSpans = textLayer.querySelectorAll('span');
        return allSpans[spanIndex];
    }

    /**
     * 标记为有未保存的修改
     */
    markAsDirty() {
        this.isDirty = true;
        this.updateSaveButtonState();
        this.updateStatus('有未保存的更改');
    }

    /**
     * 重置历史记录和保存状态
     * @param {boolean} clearSavedState 是否清除已保存状态
     */
    resetHistory(clearSavedState = true) {
        this.historyStack = [];
        this.historyIndex = -1;
        if (clearSavedState) {
            this.lastSavedState = null;
        }
        this.isDirty = false;
        this.updateUndoRedoButtons();
        this.updateSaveButtonState();
    }

    /**
     * 保存文档
     */
    async saveDocument() {
        if (!this.currentFile) {
            console.warn('⚠️ 没有当前文件');
            return;
        }

        try {
            this.updateStatus('正在保存到PDF...');

            // 获取当前状态
            const state = this.getCurrentState();

            console.log('📝 保存标注到PDF:', {
                文件: this.currentFile,
                高亮数量: state.highlights.length,
                下划线数量: state.underlines?.length || 0
            });

            // 构建标注数据
            const annotations = {
                highlights: state.highlights,
                underlines: state.underlines || [],
                wordTranslations: state.wordTranslations,
                sentenceTranslations: state.sentenceTranslations
            };

            // 验证保存数据
            console.log('💾 保存数据验证:', {
                高亮数量: annotations.highlights.length,
                下划线数量: annotations.underlines.length,
                单词翻译数量: Object.keys(annotations.wordTranslations).length,
                句子翻译数量: Object.keys(annotations.sentenceTranslations).length
            });

            // 如果应该有下划线但没收集到，给出警告
            const actualUnderlinedSpans = document.querySelectorAll('.pdf-text-layer span[data-underline-id]');
            if (actualUnderlinedSpans.length > 0 && annotations.underlines.length === 0) {
                console.error('⚠️ 警告：页面中有下划线span，但getCurrentState()没有收集到！', {
                    实际下划线span数量: actualUnderlinedSpans.length,
                    收集到的下划线数量: annotations.underlines.length
                });
            }

            // 保存JSON（用于本软件识别和修改）
            // ⚠️ 不保存到PDF，因为pdf-lib无法删除已有高亮，会导致删除时无法清除PDF中的高亮
            // 如果需要在其他阅读器查看，可以添加"导出PDF"功能
            const fileName = this.getFileName(this.currentFile);
            const baseName = fileName.replace(/\.[^/.]+$/, '');
            const savePath = `user-data/annotations/${baseName}_annotations.json`;

            const saveData = {
                fileName: fileName,
                filePath: this.currentFile,
                savedAt: new Date().toISOString(),
                ...annotations
            };

            const jsonResult = await ipcRenderer.invoke('save-annotations', {
                path: savePath,
                data: JSON.stringify(saveData, null, 2)
            });

            if (jsonResult.success) {
                this.isDirty = false;
                this.lastSavedState = state;
                this.updateSaveButtonState();
                this.updateStatus('✅ 标注已保存');
                this.refreshDirtyState();
                console.log('✅ 标注已保存到:', savePath);
            } else {
                throw new Error(jsonResult.error);
            }
        } catch (error) {
            console.error('❌ 保存失败:', error);
            this.updateStatus('保存失败: ' + error.message);
        }
    }


    /**
     * 显示保存确认对话框
     * @returns {Promise<string>} 返回用户选择: 'save', 'dontSave', 'cancel'
     */
    showSaveConfirmDialog() {
        return new Promise((resolve) => {
            const dialog = document.getElementById('saveConfirmDialog');
            dialog.style.display = 'flex';

            // 存储resolve函数供按钮使用
            this.saveConfirmResolve = resolve;
        });
    }

    /**
     * 处理保存确认对话框的选择
     * @param {string} action - 'save', 'dontSave', 'cancel'
     */
    handleSaveConfirm(action) {
        const dialog = document.getElementById('saveConfirmDialog');
        dialog.style.display = 'none';

        if (this.saveConfirmResolve) {
            this.saveConfirmResolve(action);
            this.saveConfirmResolve = null;
        }

        console.log(`💬 用户选择: ${action}`);
    }

    /**
     * 更新保存按钮状态
     */
    updateSaveButtonState() {
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            if (this.isDirty) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('btn-disabled');
            } else {
                saveBtn.disabled = true;
                saveBtn.classList.add('btn-disabled');
            }
        }
    }

    /**
     * 判断当前状态是否与最近一次保存一致
     * @returns {boolean}
     */
    isCurrentStateSaved() {
        if (!this.lastSavedState) {
            return this.historyIndex < 0;
        }
        const currentState = this.getCurrentState();
        return JSON.stringify(currentState) === JSON.stringify(this.lastSavedState);
    }

    /**
     * 根据当前状态刷新未保存标记
     */
    refreshDirtyState() {
        this.isDirty = !this.isCurrentStateSaved();
        this.updateSaveButtonState();
    }

    /**
     * 初始化AI对话功能
     */
    initAiChat() {
        const chatButton = document.getElementById('aiChatButton');
        const chatPanel = document.getElementById('aiChatPanel');
        const chatClose = document.getElementById('aiChatClose');
        const chatSend = document.getElementById('aiChatSend');
        const chatInput = document.getElementById('aiChatInput');

        if (!chatButton || !chatPanel || !chatClose || !chatSend || !chatInput) {
            console.warn('AI对话UI元素未找到');
            return;
        }

        // 初始隐藏按钮，等PDF加载后再显示
        chatButton.style.display = 'none';

        // 打开/关闭对话面板
        chatButton.addEventListener('click', () => {
            this.toggleAiChat();
        });

        chatClose.addEventListener('click', () => {
            this.closeAiChat();
        });

        // 发送消息
        chatSend.addEventListener('click', () => {
            this.sendAiMessage();
        });

        // 回车发送（Shift+Enter换行）
        const handleChatKeydown = (e) => {
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
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                this.sendAiMessage();
            }
        };

        // 在捕获阶段添加监听器，确保优先处理
        chatInput.addEventListener('keydown', handleChatKeydown, { capture: true });

        // 自动调整输入框高度
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(Math.max(chatInput.scrollHeight, 40), 100) + 'px';
        });
    }

    /**
     * 切换AI对话面板
     */
    toggleAiChat() {
        const chatPanel = document.getElementById('aiChatPanel');
        if (!chatPanel) return;

        this.isAiChatOpen = !this.isAiChatOpen;
        if (this.isAiChatOpen) {
            chatPanel.classList.add('open');
            // 聚焦输入框
            const chatInput = document.getElementById('aiChatInput');
            if (chatInput) {
                setTimeout(() => chatInput.focus(), 300);
            }
        } else {
            chatPanel.classList.remove('open');
        }
    }

    /**
     * 关闭AI对话面板
     */
    closeAiChat() {
        const chatPanel = document.getElementById('aiChatPanel');
        if (!chatPanel) return;

        this.isAiChatOpen = false;
        chatPanel.classList.remove('open');
    }

    /**
     * 获取当前可见页面的文本内容
     * @returns {Promise<string>} 页面文本内容
     */
    async getCurrentPageText() {
        if (!this.pdfDocument) {
            return 'PDF文档未加载';
        }

        try {
            // 获取当前可见的页面（根据滚动位置判断）
            const visiblePageNum = this.getVisiblePageNumber();
            const page = await this.pdfDocument.getPage(visiblePageNum);
            const textContent = await page.getTextContent();

            // 提取所有文本项并合并
            const textItems = textContent.items.map(item => item.str).filter(str => str && str.trim());
            const pageText = textItems.join(' ');

            return pageText || `第${visiblePageNum}页没有文本内容`;
        } catch (error) {
            console.error('获取页面文本失败:', error);
            return '获取页面文本失败';
        }
    }

    /**
     * 获取当前可见的页面编号
     * @returns {number} 页面编号（从1开始）
     */
    getVisiblePageNumber() {
        // 获取所有页面容器
        const pageContainers = document.querySelectorAll('.pdf-page-container');
        if (pageContainers.length === 0) {
            return 1;
        }

        // 获取视口中心位置（相对于文档顶部）
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const viewportCenter = scrollTop + window.innerHeight / 2;

        // 找到最接近视口中心的页面
        let closestPage = 1;
        let minDistance = Infinity;

        pageContainers.forEach((container, index) => {
            const rect = container.getBoundingClientRect();
            // 计算页面中心相对于文档顶部的位置
            const pageTop = rect.top + scrollTop;
            const pageCenter = pageTop + rect.height / 2;
            const distance = Math.abs(pageCenter - viewportCenter);

            if (distance < minDistance) {
                minDistance = distance;
                closestPage = index + 1;
            }
        });

        return closestPage;
    }

    /**
     * 发送AI消息
     */
    async sendAiMessage() {
        const chatInput = document.getElementById('aiChatInput');
        const chatSend = document.getElementById('aiChatSend');
        const chatMessages = document.getElementById('aiChatMessages');

        if (!chatInput || !chatSend || !chatMessages) return;

        const message = chatInput.value.trim();
        if (!message) return;

        // 检查订阅限制
        if (this.subscriptionHelper && this.currentUserId) {
            try {
                const limitCheck = await this.subscriptionHelper.checkAndUpdateUsage(
                    this.currentUserId,
                    'aiChat'
                );

                if (!limitCheck.allowed) {
                    // 显示限制提示
                    this.showUpgradePrompt(limitCheck.message || 'AI助手使用次数已达上限');
                    return;
                }
            } catch (error) {
                console.error('检查订阅限制失败:', error);
                // 如果检查失败，允许继续使用（降级处理）
            }
        }

        // 清空输入框
        chatInput.value = '';
        chatInput.style.height = '40px';

        // 禁用发送按钮
        chatSend.disabled = true;

        // 添加用户消息
        this.addChatMessage('user', message);

        // 显示加载状态
        const loadingId = this.addChatMessage('assistant', '', true);

        try {
            // 获取当前可见页面编号和全文内容
            const visiblePageNum = this.getVisiblePageNumber();
            // 使用全文内容而不是当前页内容
            const fullText = await this.getAllText();

            // 调用AI API
            const response = await this.callAiChatAPI(message, fullText, visiblePageNum);

            // 移除加载状态，添加AI回复
            this.updateChatMessage(loadingId, 'assistant', response);
        } catch (error) {
            console.error('AI对话失败:', error);
            this.updateChatMessage(loadingId, 'assistant', '抱歉，AI助手暂时无法响应。请稍后再试。');
        } finally {
            // 重新启用发送按钮
            chatSend.disabled = false;
        }
    }

    /**
     * 调用AI对话API
     * @param {string} userMessage - 用户消息
     * @param {string} pageText - 当前页面文本
     * @param {number} pageNum - 当前页面编号
     * @returns {Promise<string>} AI回复
     */
    async callAiChatAPI(userMessage, pageText, pageNum = 1) {
        // 等待限流器允许
        await this.waitForRateLimit();

        // 记录请求时间
        const now = Date.now();
        this.apiRequestQueue.push(now);
        this.lastRequestTime = now;

        const fullUrl = `${this.geminiApiUrl}?key=${this.geminiApiKey}`;
        console.log(`📡 调用Gemini API进行AI对话（全文上下文）`);

        // 构建提示词，包含全文内容
        const prompt = `你是一个专业的PDF阅读助手。用户正在阅读一个PDF文档，文档的全部内容如下：

【文档内容】
${pageText}

【用户问题】
${userMessage}

请基于文档内容回答用户的问题。如果问题与文档内容无关，请礼貌地说明。回答要简洁明了，使用中文。`;

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error(`❌ API错误详情:`, JSON.stringify(errorData, null, 2));

            if (response.status === 429) {
                throw new Error('API_RATE_LIMIT');
            }

            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            return text.trim();
        } else {
            throw new Error('API返回格式异常');
        }
    }

    /**
     * 添加聊天消息
     * @param {string} role - 'user' 或 'assistant'
     * @param {string} content - 消息内容
     * @param {boolean} isLoading - 是否为加载状态
     * @returns {string} 消息ID
     */
    addChatMessage(role, content, isLoading = false) {
        const chatMessages = document.getElementById('aiChatMessages');
        if (!chatMessages) return null;

        // 如果是第一条消息，移除欢迎消息
        if (this.aiChatMessages.length === 0) {
            const welcome = chatMessages.querySelector('.ai-chat-welcome');
            if (welcome) {
                welcome.remove();
            }
        }

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message ${role}${isLoading ? ' loading' : ''}`;
        messageDiv.id = messageId;

        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        if (isLoading) {
            messageDiv.innerHTML = `
                <div class="ai-chat-message-bubble">
                    <div class="ai-chat-loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="ai-chat-message-bubble">${this.escapeHtml(content)}</div>
                <div class="ai-chat-message-time">${time}</div>
            `;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // 保存到历史记录
        if (!isLoading) {
            this.aiChatMessages.push({ role, content, time });
        }

        return messageId;
    }

    /**
     * 显示升级提示
     * @param {string} message - 提示消息
     */
    showUpgradePrompt(message) {
        // 创建提示弹窗
        const promptDiv = document.createElement('div');
        promptDiv.className = 'upgrade-prompt';
        promptDiv.innerHTML = `
            <div class="upgrade-prompt-content">
                <div class="upgrade-prompt-icon">⚠️</div>
                <div class="upgrade-prompt-message">${this.escapeHtml(message)}</div>
                <div class="upgrade-prompt-actions">
                    <button class="upgrade-prompt-button upgrade-prompt-button-primary" id="upgradePromptUpgrade">升级订阅</button>
                    <button class="upgrade-prompt-button" id="upgradePromptCancel">稍后再说</button>
                </div>
            </div>
        `;

        // 添加到页面
        document.body.appendChild(promptDiv);

        // 绑定事件
        const upgradeBtn = promptDiv.querySelector('#upgradePromptUpgrade');
        const cancelBtn = promptDiv.querySelector('#upgradePromptCancel');

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
            promptDiv.remove();
        });

        cancelBtn.addEventListener('click', () => {
            promptDiv.remove();
        });

        // 3秒后自动关闭
        setTimeout(() => {
            if (promptDiv.parentNode) {
                promptDiv.remove();
            }
        }, 5000);
    }

    /**
     * 更新聊天消息
     * @param {string} messageId - 消息ID
     * @param {string} role - 'user' 或 'assistant'
     * @param {string} content - 消息内容
     */
    updateChatMessage(messageId, role, content) {
        const messageDiv = document.getElementById(messageId);
        if (!messageDiv) return;

        messageDiv.className = `ai-chat-message ${role}`;
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
            <div class="ai-chat-message-bubble">${this.escapeHtml(content)}</div>
            <div class="ai-chat-message-time">${time}</div>
        `;

        // 更新历史记录
        const messageIndex = this.aiChatMessages.findIndex(msg => msg.role === role && !msg.content);
        if (messageIndex >= 0) {
            this.aiChatMessages[messageIndex].content = content;
            this.aiChatMessages[messageIndex].time = time;
        } else {
            this.aiChatMessages.push({ role, content, time });
        }

        // 滚动到底部
        const chatMessages = document.getElementById('aiChatMessages');
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 显示AI对话按钮
     */
    showAiChatButton() {
        const chatButton = document.getElementById('aiChatButton');
        if (chatButton) {
            chatButton.style.display = 'flex';
        }
    }

    /**
     * 隐藏AI对话按钮
     */
    hideAiChatButton() {
        const chatButton = document.getElementById('aiChatButton');
        if (chatButton) {
            chatButton.style.display = 'none';
        }
        // 如果对话面板打开，也关闭它
        this.closeAiChat();
    }
}

// 初始化阅读器应用
document.addEventListener('DOMContentLoaded', async () => {
    const readerApp = new ReaderApp();

    // 检查是否有待打开的文件
    const pendingFile = sessionStorage.getItem('pendingFile');
    if (pendingFile) {
        console.log('[Reader] Found pending file:', pendingFile);
        sessionStorage.removeItem('pendingFile');

        // 等待一小段时间确保DOM完全加载
        setTimeout(() => {
            readerApp.loadFile(pendingFile);
        }, 500);
    }
});
