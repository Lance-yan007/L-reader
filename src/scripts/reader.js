const { ipcRenderer } = require('electron');

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
        
        // 点词翻译相关状态
        this.wordTranslateMode = false; // 是否开启点词翻译模式
        this.wordTranslationMap = new Map(); // 单词翻译映射表 word -> {translation, positions}
        this.highlightedWords = new Set(); // 已高亮的单词集合
        this.wordTooltip = null; // 悬浮框DOM元素
        this.currentHoverWord = null; // 当前hover的单词
        this.contextMenu = null; // 右键菜单DOM元素
        this.currentContextTarget = null; // 当前右键点击的元素
        
        // Gemini API配置
        this.geminiApiKey = 'AIzaSyCqcvZmcr1-BbAthoDVIvotcjM2gANMklY';
        // 使用Gemini 2.0 Flash模型 - 快速且稳定
        this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadTranslations();
        this.updateStatus('就绪');
        this.initWordTooltip(); // 初始化悬浮框
        this.initContextMenu(); // 初始化右键菜单
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

        // 点词翻译按钮
        document.getElementById('wordTranslateBtn').addEventListener('click', () => {
            this.toggleWordTranslateMode();
        });

        // IPC事件监听
        ipcRenderer.on('file-opened', (event, filePath) => {
            console.log('阅读器窗口接收到文件路径:', filePath);
            this.loadFile(filePath);
        });
        
        // 缩放事件监听
        this.bindZoomEvents();

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
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
            
            this.totalPages = pdf.numPages;
            this.updatePageInfo();
            
            // 渲染所有页面
            console.log('开始渲染PDF所有页面...');
            await this.renderAllPDFPages(pdf);
            console.log('PDF所有页面渲染完成');
            
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
                border: 2px solid #4A90E2;
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
                canvasContainer.style.cssText = 'display: inline-block; border: 3px solid #4A90E2; border-radius: 8px; overflow: hidden;';
                
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
        
        // 添加高亮
        span.classList.add('word-highlighted');
        this.highlightedWords.add(word.toLowerCase());
        
        // ⚠️ 关键：强制浏览器立即重排，确保CSS样式被计算
        // 通过读取offsetHeight强制浏览器同步计算样式
        void span.offsetHeight;
        
        // 再次强制获取计算后的样式
        window.getComputedStyle(span).backgroundColor;
        
        // 如果已有翻译，直接显示；否则获取翻译
        if (this.wordTranslationMap.has(word.toLowerCase())) {
            const data = this.wordTranslationMap.get(word.toLowerCase());
            this.showWordTooltip(word, data.translation, span, false);
        } else {
            // 先显示"翻译中"状态（使用高亮颜色）
            this.showWordTooltip(word, '翻译中...', span, true);
            
            // 获取翻译
            try {
                const translation = await this.translateWord(word);
                this.wordTranslationMap.set(word.toLowerCase(), {
                    word: word,
                    translation: translation,
                    clickCount: 1
                });
                
                // 更新为真实翻译
                this.showWordTooltip(word, translation, span, false);
            } catch (error) {
                console.error('翻译失败:', error);
                this.showWordTooltip(word, '翻译失败', span, false);
            }
        }
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
        
        // 如果已点击过（有高亮），显示翻译（不论翻译模式是否开启）
        if (span.classList.contains('word-highlighted') && 
            this.wordTranslationMap.has(word.toLowerCase())) {
            const data = this.wordTranslationMap.get(word.toLowerCase());
            this.showWordTooltip(word, data.translation, span, false);
        }
    }

    /**
     * 处理单词离开事件
     */
    handleWordLeave(e) {
        this.currentHoverWord = null;
        // 延迟隐藏，避免闪烁
        setTimeout(() => {
            if (!this.currentHoverWord) {
                this.hideWordTooltip();
            }
        }, 100);
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
     * @param {boolean} loading - 是否加载状态
     */
    showWordTooltip(word, translation, span, loading = false) {
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
        
        // ⚠️ 关键改进：从CSS规则直接读取高亮颜色，而不是从计算样式
        // 因为计算样式可能还未更新
        let bgColor = 'rgb(255, 252, 158)'; // 默认黄色 #FFFC9E
        
        if (span.classList.contains('word-highlighted')) {
            // 强制同步样式计算
            const computedBg = window.getComputedStyle(span).backgroundColor;
            console.log('🎨 读取到的背景色:', computedBg);
            
            const match = computedBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                const r = match[1];
                const g = match[2];
                const b = match[3];
                // 检查是否是透明或默认颜色
                if (r !== '0' || g !== '0' || b !== '0') {
                    // tooltip使用相同颜色但完全不透明
                    bgColor = `rgb(${r}, ${g}, ${b})`;
                    console.log('✅ 使用高亮颜色:', bgColor);
                }
            }
        }
        
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
     * 调用翻译API（使用Gemini API）
     * @param {string} word - 单词
     * @returns {Promise<string>} - 翻译结果
     */
    async callTranslationAPI(word) {
        try {
            const fullUrl = `${this.geminiApiUrl}?key=${this.geminiApiKey}`;
            console.log(`📡 调用Gemini API翻译: ${word}`);
            console.log(`🔗 请求URL: ${this.geminiApiUrl}?key=${this.geminiApiKey.substring(0, 10)}...`);
            
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
                // 尝试读取错误详情
                const errorText = await response.text();
                console.error(`❌ API错误详情: ${errorText}`);
                throw new Error(`API请求失败: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            
            // 提取翻译结果
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const translation = data.candidates[0].content.parts[0].text.trim();
                console.log(`翻译结果: ${translation}`);
                return translation;
            }
            
            throw new Error('API返回格式异常');
            
        } catch (error) {
            console.error('Gemini API调用失败:', error);
            
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
                return mockTranslations[lowerWord];
            }
            
            // 返回错误提示
            return `翻译失败（${error.message}）`;
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
        this.contextMenu = document.getElementById('contextMenu');
        this.colorPickerPanel = document.getElementById('colorPickerPanel');
        this.opacitySliderPanel = document.getElementById('opacitySliderPanel');
        this.currentColorCircle = document.getElementById('currentColorCircle');
        this.currentColorFill = this.currentColorCircle?.querySelector('.current-color-fill');
        this.currentOpacity = 0.5; // 默认透明度50%
        
        if (!this.contextMenu) {
            console.error('右键菜单元素未找到');
            return;
        }

        // 绑定当前颜色圆形点击事件 - 切换调色板
        if (this.currentColorCircle) {
            this.currentColorCircle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleColorPicker();
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
            const pdfTextLayer = e.target.closest('.pdf-text-layer');
            
            if (pdfTextLayer) {
                e.preventDefault(); // 始终阻止默认右键菜单
                
                // 检查是否点击了单词span或选择了文本
                const span = e.target.closest('span');
                const selection = window.getSelection();
                const selectedText = selection.toString().trim();
                
                if (span && span.textContent.trim()) {
                    // 点击了单词
                    this.currentContextTarget = span;
                    this.showContextMenu(e.clientX, e.clientY);
                } else if (selectedText) {
                    // 选择了文本
                    this.handleTextSelection(e, selection);
                }
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
        if (!this.contextMenu) return;

        // 更新当前颜色显示
        if (this.currentContextTarget && this.currentColorFill) {
            const currentBgColor = window.getComputedStyle(this.currentContextTarget).backgroundColor;
            if (currentBgColor && currentBgColor !== 'rgba(0, 0, 0, 0)' && currentBgColor !== 'transparent') {
                this.currentColorFill.style.background = currentBgColor;
            } else {
                this.currentColorFill.style.background = '#FFFC9E'; // 默认黄色
            }
        }

        // 显示菜单
        this.contextMenu.style.display = 'flex';

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
     * 处理右键菜单操作
     * @param {string} action - 操作类型
     */
    handleContextMenuAction(action, customColor = null) {
        if (!this.currentContextTarget) return;

        const span = this.currentContextTarget;

        if (action === 'remove-highlight') {
            // 取消高亮
            span.classList.remove('word-highlighted');
            span.classList.remove('color-yellow', 'color-green', 'color-blue', 'color-pink', 'color-orange', 'color-purple', 'color-red', 'color-cyan', 'color-custom');
            span.style.backgroundColor = ''; // 清除自定义背景色
            
            // 从集合中移除
            const word = this.extractWord(span.textContent);
            if (word) {
                this.highlightedWords.delete(word.toLowerCase());
            }
        } else if (action.startsWith('color-')) {
            // 更改高亮颜色
            const color = action.replace('color-', '');
            
            // 移除旧颜色
            span.classList.remove('color-yellow', 'color-green', 'color-blue', 'color-pink', 'color-orange', 'color-purple', 'color-red', 'color-cyan', 'color-custom');
            span.style.backgroundColor = ''; // 清除之前的自定义背景色
            
            if (color === 'custom' && customColor) {
                // 自定义颜色：使用内联样式
                span.classList.add('color-custom');
                // 将hex颜色转换为rgba格式，透明度0.5
                const rgb = this.hexToRgb(customColor);
                if (rgb) {
                    span.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
                }
            } else {
                // 添加新颜色
                span.classList.add(`color-${color}`);
            }
        }

        // 隐藏菜单
        this.hideContextMenu();
        this.currentContextTarget = null;
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
            
            // 获取当前高亮的透明度
            if (this.currentContextTarget) {
                const bgColor = window.getComputedStyle(this.currentContextTarget).backgroundColor;
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

        // 应用到所有选中的span
        this.applyToSelectedSpans((span) => {
            const bgColor = window.getComputedStyle(span).backgroundColor;
            const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                const r = match[1];
                const g = match[2];
                const b = match[3];
                span.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${this.currentOpacity})`;
            }
        });
    }

    /**
     * 应用高亮颜色
     * @param {string} color - 颜色hex值
     */
    applyHighlightColor(color) {
        if (!this.currentContextTarget) return;

        const rgb = this.hexToRgb(color);
        const opacity = this.currentOpacity || 0.5;
        
        // 应用到所有选中的span
        this.applyToSelectedSpans((span) => {
            // 移除所有预设颜色类
            span.classList.remove('color-yellow', 'color-green', 'color-blue', 'color-pink', 
                                'color-orange', 'color-purple', 'color-red', 'color-cyan', 'color-custom');
            
            // 应用自定义颜色和透明度
            span.classList.add('word-highlighted', 'color-custom');
            span.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
            
            // 记录到集合中
            const word = this.extractWord(span.textContent);
            if (word) {
                this.highlightedWords.add(word.toLowerCase());
            }
        });
        
        // 更新当前颜色圆形显示
        if (this.currentColorFill) {
            this.currentColorFill.style.background = color;
        }
    }

    /**
     * 切换下划线
     */
    toggleUnderline() {
        if (!this.currentContextTarget) return;

        const hasUnderline = this.currentContextTarget.classList.contains('word-underlined');
        
        // 应用到所有选中的span
        this.applyToSelectedSpans((span) => {
            if (hasUnderline) {
                // 移除下划线
                span.classList.remove('word-underlined');
            } else {
                // 添加下划线
                span.classList.add('word-underlined');
            }
        });
        
        this.hideContextMenu();
        this.hideColorPicker();
    }

    /**
     * 复制文本
     */
    copyWordText() {
        if (!this.currentContextTarget) return;

        // 如果有选中的多个span，复制所有文本
        let text = '';
        if (this.selectedSpans && this.selectedSpans.length > 0) {
            text = this.selectedSpans.map(span => span.textContent).join('');
        } else {
            text = this.extractWord(this.currentContextTarget.textContent);
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
        }
        
        this.selectedSpans = null; // 清空选择
        this.hideContextMenu();
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
        if (!this.currentContextTarget) return;

        // 应用到所有选中的span
        this.applyToSelectedSpans((span) => {
            // 移除高亮
            span.classList.remove('word-highlighted');
            span.classList.remove('color-yellow', 'color-green', 'color-blue', 'color-pink', 
                                'color-orange', 'color-purple', 'color-red', 'color-cyan', 'color-custom');
            span.style.backgroundColor = '';
            
            // 移除下划线
            span.classList.remove('word-underlined');
            
            // 从集合中移除
            const word = this.extractWord(span.textContent);
            if (word) {
                this.highlightedWords.delete(word.toLowerCase());
            }
        });
        
        this.hideContextMenu();
        this.hideColorPicker();
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
}

// 初始化阅读器应用
document.addEventListener('DOMContentLoaded', () => {
    new ReaderApp();
});
