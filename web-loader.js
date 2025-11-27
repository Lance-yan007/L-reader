/**
 * Web版主应用入口
 * 这是一个单页应用(SPA)，使用路由系统管理不同页面
 */

class WebApp {
    constructor() {
        this.currentRoute = 'main';
        this.routes = {
            'main': () => this.showMainView(),
            'reader': () => this.showReaderView(),
            'profile': () => this.showProfileView(),
            'vocabulary': () => this.showVocabularyView(),
            'auth': () => this.showAuthView()
        };

        this.init();
    }

    async init() {
        // 等待适配器加载完成
        await this.waitForAdapters();

        // 初始化路由
        this.initRouter();

        // 加载初始视图
        this.handleRoute();

        // 监听文件打开事件
        window.addEventListener('file-opened', (e) => {
            this.navigateToReader(e.detail);
        });
    }

    async waitForAdapters() {
        // 等待适配器加载
        let attempts = 0;
        while (attempts < 50) {
            if (window.WebFSAdapter && window.StorageAdapter && window.ipcRenderer) {
                console.log('✅ 所有适配器已加载');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.warn('⚠️ 适配器加载超时，继续运行');
    }

    initRouter() {
        // 监听hash变化
        window.addEventListener('hashchange', () => {
            this.handleRoute();
        });

        // 监听popstate（浏览器前进后退）
        window.addEventListener('popstate', () => {
            this.handleRoute();
        });
    }

    handleRoute() {
        const hash = window.location.hash.slice(1) || 'main';
        const [route, ...params] = hash.split('/');

        this.currentRoute = route;

        if (this.routes[route]) {
            this.routes[route](...params);
        } else {
            this.showMainView();
        }
    }

    navigate(route, ...params) {
        const hash = params.length > 0 ? `${route}/${params.join('/')}` : route;
        window.location.hash = hash;
        this.handleRoute();
    }

    navigateToReader(filePath) {
        // 存储文件路径到sessionStorage
        sessionStorage.setItem('currentFile', filePath);
        this.navigate('reader');
    }

    async showMainView() {
        const appRoot = document.getElementById('app-root');
        const timestamp = Date.now();

        try {
            const response = await fetch(`src/main.html?v=${timestamp}`, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`HTTP错误: ${response.status}`);
            }

            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const bodyContent = tempDiv.querySelector('body') || tempDiv;

            // 修复CSS和JS路径，并添加缓存清除参数
            const bodyHTML = bodyContent.innerHTML
                .replace(/href=["']styles\//g, `href="src/styles/`)
                .replace(/href=["']\.\.\/styles\//g, `href="src/styles/`)
                .replace(/src=["']scripts\//g, `src="src/scripts/`)
                .replace(/src=["']\.\.\/scripts\//g, `src="src/scripts/`)
                .replace(/src=["']\.\.\/utils\//g, `src/utils/`)
                .replace(/\.css"/g, `.css?v=${timestamp}"`)
                .replace(/\.js"/g, `.js?v=${timestamp}"`)
                .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

            appRoot.innerHTML = bodyHTML;

            // 等待DOM更新
            await new Promise(resolve => setTimeout(resolve, 100));

            // 加载主界面脚本
            await this.loadMainScript();

            // 等待脚本执行
            await new Promise(resolve => setTimeout(resolve, 200));

            // 初始化主界面
            if (window.MainApp) {
                window.mainAppInstance = new window.MainApp();
            } else {
                console.error('❌ MainApp类未找到');
            }
        } catch (error) {
            console.error('加载主界面失败:', error);
            appRoot.innerHTML = '<div style="padding: 20px;">加载失败，请刷新页面重试</div>';
        }
    }

    async showReaderView() {
        const appRoot = document.getElementById('app-root');
        const timestamp = Date.now();

        try {
            // Load PDF.js first if not already loaded
            if (!window.pdfjsLib) {
                console.log('[WebLoader] Loading PDF.js from CDN...');
                await this.loadPDFJS();
            }

            const response = await fetch(`reader.html?v=${timestamp}`, { cache: "no-store" });
            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const bodyContent = tempDiv.querySelector('body') || tempDiv;

            // 修复CSS和JS路径
            console.log('[WebLoader] Processing reader.html content...');
            let bodyHTML = bodyContent.innerHTML;

            // Log original paths for debugging
            const links = bodyHTML.match(/href=["'][^"']*["']/g) || [];
            const scripts = bodyHTML.match(/src=["'][^"']*["']/g) || [];
            console.log('[WebLoader] Original paths:', { links, scripts });

            bodyHTML = bodyHTML
                .replace(/href=["']styles\//g, `href="src/styles/`)
                .replace(/href=["']\.\.\/styles\//g, `href="src/styles/`)
                .replace(/src=["']scripts\//g, `src="src/scripts/`)
                .replace(/src=["']\.\.\/scripts\//g, `src="src/scripts/`)
                .replace(/src=["']\.\.\/utils\//g, `src/utils/`)
                .replace(/\.css"/g, `.css?v=${timestamp}"`)
                .replace(/\.js"/g, `.js?v=${timestamp}"`)
                .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

            console.log('[WebLoader] Processed content length:', bodyHTML.length);
            appRoot.innerHTML = bodyHTML;

            await new Promise(resolve => setTimeout(resolve, 100));
            await this.loadReaderScript();
            await new Promise(resolve => setTimeout(resolve, 200));

            if (window.ReaderApp) {
                const filePath = sessionStorage.getItem('currentFile');
                window.readerAppInstance = new window.ReaderApp();
                if (filePath) {
                    window.readerAppInstance.loadFile(filePath);
                }
            }
        } catch (error) {
            console.error('加载阅读器失败:', error);
            appRoot.innerHTML = '<div style="padding: 20px;">加载失败</div>';
        }
    }

    async loadPDFJS() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    console.log('✅ PDF.js loaded from CDN (3.11.174)');
                    resolve();
                } else {
                    reject(new Error('PDF.js failed to load'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js script'));
            document.head.appendChild(script);
        });
    }

    async showProfileView() {
        const appRoot = document.getElementById('app-root');
        const timestamp = Date.now();

        try {
            const response = await fetch(`src/profile.html?v=${timestamp}`, { cache: "no-store" });
            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const bodyContent = tempDiv.querySelector('body') || tempDiv;

            const bodyHTML = bodyContent.innerHTML
                .replace(/href=["']styles\//g, `href="src/styles/`)
                .replace(/src=["']scripts\//g, `src="src/scripts/`)
                .replace(/\.css"/g, `.css?v=${timestamp}"`)
                .replace(/\.js"/g, `.js?v=${timestamp}"`)
                .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

            appRoot.innerHTML = bodyHTML;
            await this.loadScript('src/scripts/profile.js');
        } catch (error) {
            console.error('加载个人中心失败:', error);
            appRoot.innerHTML = '<div style="padding: 20px;">加载失败</div>';
        }
    }

    async showVocabularyView() {
        const appRoot = document.getElementById('app-root');
        const timestamp = Date.now();

        try {
            const response = await fetch(`src/vocabulary.html?v=${timestamp}`, { cache: "no-store" });
            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const bodyContent = tempDiv.querySelector('body') || tempDiv;

            const bodyHTML = bodyContent.innerHTML
                .replace(/href=["']styles\//g, `href="src/styles/`)
                .replace(/src=["']scripts\//g, `src="src/scripts/`)
                .replace(/\.css"/g, `.css?v=${timestamp}"`)
                .replace(/\.js"/g, `.js?v=${timestamp}"`)
                .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

            appRoot.innerHTML = bodyHTML;
            await this.loadScript('src/scripts/vocabulary.js');
        } catch (error) {
            console.error('加载生词本失败:', error);
            appRoot.innerHTML = '<div style="padding: 20px;">加载失败</div>';
        }
    }

    async showAuthView() {
        const appRoot = document.getElementById('app-root');
        const timestamp = Date.now();

        try {
            const response = await fetch(`src/auth.html?v=${timestamp}`, { cache: "no-store" });
            const html = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const bodyContent = tempDiv.querySelector('body') || tempDiv;

            const bodyHTML = bodyContent.innerHTML
                .replace(/href=["']styles\//g, `href="src/styles/`)
                .replace(/src=["']scripts\//g, `src="src/scripts/`)
                .replace(/\.css"/g, `.css?v=${timestamp}"`)
                .replace(/\.js"/g, `.js?v=${timestamp}"`)
                .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

            appRoot.innerHTML = bodyHTML;
            await this.loadScript('src/scripts/auth.js');
        } catch (error) {
            console.error('加载认证页面失败:', error);
            appRoot.innerHTML = '<div style="padding: 20px;">加载失败</div>';
        }
    }

    async loadMainScript() {
        return this.loadScript('src/scripts/app-core.js', true);
    }

    async loadReaderScript() {
        return this.loadScript('src/scripts/reader.js', true);
    }

    async loadScript(src, adapt = false) {
        return new Promise((resolve, reject) => {
            const timestamp = Date.now();
            const srcWithVersion = `${src}?v=${timestamp}`;

            const existingScript = document.querySelector(`script[data-src="${src}"]`);
            if (existingScript) {
                // 如果是适配脚本，可能需要重新加载以确保更新
                if (adapt) {
                    existingScript.remove();
                } else {
                    resolve();
                    return;
                }
            }

            const script = document.createElement('script');
            script.setAttribute('data-src', src);

            if (adapt) {
                fetch(srcWithVersion, { cache: "no-store" })
                    .then(response => response.text())
                    .then(code => {
                        // 简单的代码适配
                        let adaptedCode = code;

                        // 替换 require('electron')
                        adaptedCode = adaptedCode.replace(/const\s+\{\s*ipcRenderer\s*\}\s*=\s*require\(['"]electron['"]\)/g,
                            'const ipcRenderer = window.ipcRenderer');
                        adaptedCode = adaptedCode.replace(/require\(['"]electron['"]\)/g, 'window.require("electron")');
                        adaptedCode = adaptedCode.replace(/require\(['"]path['"]\)/g,
                            '{ join: (a, b) => a + "/" + b, resolve: (a, b) => a + "/" + b }');
                        adaptedCode = adaptedCode.replace(/__dirname/g, '""');
                        adaptedCode = adaptedCode.replace(/ipcRenderer\.invoke\(/g, 'window.ipcRenderer.invoke(');
                        adaptedCode = adaptedCode.replace(/ipcRenderer\.on\(/g, 'window.ipcRenderer.on(');
                        adaptedCode = adaptedCode.replace(/ipcRenderer\.send\(/g, 'window.ipcRenderer.send(');
                        adaptedCode = adaptedCode.replace(/window\.location\.href\s*=\s*['"]auth\.html['"]/g,
                            'window.location.hash = "#/auth"');
                        adaptedCode = adaptedCode.replace(/document\.addEventListener\(['"]DOMContentLoaded['"],\s*\(\)\s*=>\s*\{[^}]*new\s+MainApp\(\);[^}]*\}\);/g,
                            '// MainApp将在Web版本中手动初始化');
                        adaptedCode = adaptedCode.replace(/document\.addEventListener\(['"]DOMContentLoaded['"],\s*\(\)\s*=>\s*\{[^}]*new\s+ReaderApp\(\);[^}]*\}\);/g,
                            '// ReaderApp将在Web版本中手动初始化');

                        // 暴露类到全局
                        adaptedCode += '\n\nif (typeof MainApp !== "undefined") window.MainApp = MainApp;\nif (typeof ReaderApp !== "undefined") window.ReaderApp = ReaderApp;\n';

                        const adaptedScript = document.createElement('script');
                        adaptedScript.textContent = adaptedCode;
                        document.head.appendChild(adaptedScript);
                        resolve();
                    })
                    .catch(reject);
            } else {
                script.src = srcWithVersion;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }
        });
    }
}

// 初始化应用
// 初始化应用
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.webApp = new WebApp();
    });
} else {
    window.webApp = new WebApp();
}
