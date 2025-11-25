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
            const response = await fetch(`reader.html?v=${timestamp}`, { cache: "no-store" });
            if (!response.ok) throw new Error(`Failed to load reader.html: ${response.status}`);

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
                // Do NOT replace .js with version here if we want to control loading manually
                // But for CSS it's fine.
                .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');

            console.log('[WebLoader] Processed content length:', bodyHTML.length);
            appRoot.innerHTML = bodyHTML;

            await new Promise(resolve => setTimeout(resolve, 100));

            // Ensure PDF.js is loaded if not present
            if (!window.pdfjsLib) {
                console.log('[WebLoader] Loading PDF.js...');
                await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
                await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
            }

            await this.loadReaderScript();
            await new Promise(resolve => setTimeout(resolve, 200));

            if (window.ReaderApp) {
                const filePath = sessionStorage.getItem('currentFile');
                console.log('[WebLoader] Initializing ReaderApp with file:', filePath);
                window.readerAppInstance = new window.ReaderApp();
                if (filePath) {
                    window.readerAppInstance.loadFile(filePath);
                }
            } else {
                console.error('❌ ReaderApp class not found after loading script');
            }
        } catch (error) {
            console.error('加载阅读器失败:', error);
            appRoot.innerHTML = `<div style="padding: 20px; color: red;">加载失败: ${error.message}</div>`;
        }
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
            // Ensure src starts with src/ if it's a local script and not already starting with src/ or http
            let finalSrc = src;

            const srcWithVersion = `${finalSrc}${finalSrc.includes('?') ? '&' : '?'}v=${timestamp}`;

            const existingScript = document.querySelector(`script[data-src="${finalSrc}"]`);
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
            script.setAttribute('data-src', finalSrc);

            if (adapt) {
                fetch(srcWithVersion, { cache: "no-store" })
                    .then(response => {
                        if (!response.ok) throw new Error(`Failed to fetch script ${finalSrc}: ${response.status}`);
                        return response.text();
                    })
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

                        // 包装在 try-catch 中以捕获执行错误
                        const wrappedCode = `
try {
    ${adaptedCode}
    
    // 暴露类到全局
    if (typeof MainApp !== "undefined") {
        window.MainApp = MainApp;
        console.log('[WebLoader] ✅ MainApp exposed to window');
    }
    if (typeof ReaderApp !== "undefined") {
        window.ReaderApp = ReaderApp;
        console.log('[WebLoader] ✅ ReaderApp exposed to window');
    } else {
        console.error('[WebLoader] ❌ ReaderApp is undefined after script execution');
    }
} catch (error) {
    console.error('[WebLoader] ❌ Error executing adapted script ${finalSrc}:', error);
    console.error('[WebLoader] Stack:', error.stack);
}
`;

                        const adaptedScript = document.createElement('script');
                        adaptedScript.textContent = wrappedCode;
                        adaptedScript.setAttribute('data-script-name', finalSrc);
                        document.head.appendChild(adaptedScript);

                        // 等待一小段时间确保脚本执行完成
                        setTimeout(() => {
                            if (finalSrc.includes('reader.js') && !window.ReaderApp) {
                                console.error('[WebLoader] ❌ ReaderApp still not found after timeout');
                            }
                            resolve();
                        }, 100);
                    })
                    .catch(err => {
                        console.error(`Failed to load/adapt script ${finalSrc}:`, err);
                        reject(err);
                    });
            } else {
                script.src = srcWithVersion;
                script.onload = resolve;
                script.onerror = (e) => {
                    console.error(`Failed to load script ${finalSrc}`, e);
                    reject(new Error(`Failed to load script ${finalSrc}`));
                };
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
