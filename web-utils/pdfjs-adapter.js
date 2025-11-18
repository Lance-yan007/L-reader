/**
 * PDF.js加载适配器
 * 在Web环境中使用CDN加载PDF.js，而不是从node_modules加载
 */

class PDFJSAdapter {
    constructor() {
        this.pdfjsLib = null;
        this.isLoading = false;
        this.loadPromise = null;
    }
    
    /**
     * 加载PDF.js库
     */
    async load() {
        // 如果已经加载，直接返回
        if (this.pdfjsLib) {
            return this.pdfjsLib;
        }
        
        // 如果正在加载，返回现有的Promise
        if (this.isLoading && this.loadPromise) {
            return this.loadPromise;
        }
        
        this.isLoading = true;
        this.loadPromise = this._loadFromCDN();
        
        try {
            this.pdfjsLib = await this.loadPromise;
            return this.pdfjsLib;
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * 从CDN加载PDF.js
     */
    async _loadFromCDN() {
        return new Promise((resolve, reject) => {
            // 检查是否已经加载
            if (window.pdfjsLib || window.pdfjs) {
                const lib = window.pdfjsLib || window.pdfjs;
                this._configureWorker(lib);
                resolve(lib);
                return;
            }
            
            // 使用CDN加载PDF.js
            const version = '3.11.174'; // 与package.json中的版本一致
            const script = document.createElement('script');
            script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.min.js`;
            
            script.onload = () => {
                // PDF.js可能暴露为pdfjsLib或pdfjs
                const lib = window.pdfjsLib || window.pdfjs;
                
                if (!lib) {
                    reject(new Error('PDF.js加载失败：未找到pdfjsLib或pdfjs对象'));
                    return;
                }
                
                // 配置Worker
                this._configureWorker(lib);
                
                // 将pdfjsLib暴露到全局
                window.pdfjsLib = lib;
                
                resolve(lib);
            };
            
            script.onerror = () => {
                reject(new Error('PDF.js脚本加载失败'));
            };
            
            document.head.appendChild(script);
        });
    }
    
    /**
     * 配置PDF.js Worker
     */
    _configureWorker(lib) {
        const version = '3.11.174';
        // 使用CDN的Worker
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
        
        // 配置其他选项
        lib.GlobalWorkerOptions.verbosity = 0; // 减少日志输出
    }
    
    /**
     * 获取PDF.js库实例
     */
    getLib() {
        return this.pdfjsLib;
    }
}

// 创建全局实例
window.PDFJSAdapter = new PDFJSAdapter();

// 在ReaderApp中使用的辅助函数
window.loadPDFJS = async function() {
    return await window.PDFJSAdapter.load();
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFJSAdapter;
}

