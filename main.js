const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, degrees } = require('pdf-lib');

// 保持对窗口对象的全局引用
let mainWindow;
const pendingOpenFiles = [];

// 应用配置
const APP_CONFIG = {
  name: 'NPDF Reader',
  version: '1.0.0',
  userDataPath: path.join(__dirname, 'user-data'),
  documentsPath: path.join(__dirname, 'user-data', 'documents'),
  translationsPath: path.join(__dirname, 'user-data', 'translations'),
  annotationsPath: path.join(__dirname, 'user-data', 'annotations')
};

// 确保用户数据目录存在
function ensureUserDataDirectories() {
  const dirs = [
    APP_CONFIG.userDataPath,
    APP_CONFIG.documentsPath,
    APP_CONFIG.translationsPath,
    APP_CONFIG.annotationsPath
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webviewTag: true
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // 加载主界面
  mainWindow.loadFile('src/main.html');

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    flushPendingOpenFiles();
  });

  const emitWindowState = () => {
    if (!mainWindow) return;
    const isMaximized = mainWindow.isMaximized() || mainWindow.isFullScreen();
    mainWindow.webContents.send('window-state-changed', { maximized: isMaximized });
  };

  const flushPendingOpenFiles = () => {
    if (!mainWindow || mainWindow.webContents.isDestroyed() || pendingOpenFiles.length === 0) {
      return;
    }

    const files = pendingOpenFiles.splice(0);
    files.forEach(filePath => {
      mainWindow.webContents.send('open-document-tab', filePath);
    });
  };

  mainWindow.on('maximize', emitWindowState);
  mainWindow.on('unmaximize', emitWindowState);
  mainWindow.on('enter-full-screen', emitWindowState);
  mainWindow.on('leave-full-screen', emitWindowState);
  mainWindow.on('resize', emitWindowState);

  mainWindow.webContents.on('did-finish-load', () => {
    emitWindowState();
    flushPendingOpenFiles();
  });

  // 窗口关闭时
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 开发模式下打开开发者工具（已禁用）
  // if (process.argv.includes('--dev')) {
  //   mainWindow.webContents.openDevTools();
  // }
}

// 应用准备就绪
app.whenReady().then(() => {
  // 确保用户数据目录存在
  ensureUserDataDirectories();
  
  // 创建主窗口
  createMainWindow();
  
  // 设置应用菜单
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 创建应用菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openFileDialog();
          }
        },
        {
          label: '打开文件夹',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            openFolderDialog();
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 NPDF Reader',
              message: 'NPDF Reader v1.0.0',
              detail: '专为中国留学生设计的智能英文阅读器'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 打开文件对话框
function openFileDialog() {
  dialog.showOpenDialog(mainWindow, {
    title: '选择要打开的文件',
    filters: [
      { name: 'PDF文件', extensions: ['pdf'] },
      { name: 'Word文档', extensions: ['doc', 'docx'] },
      { name: '文本文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      openFile(filePath);
    }
  });
}

// 打开文件夹对话框
function openFolderDialog() {
  dialog.showOpenDialog(mainWindow, {
    title: '选择文件夹',
    properties: ['openDirectory']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      // 发送文件夹路径到主窗口
      mainWindow.webContents.send('folder-opened', folderPath);
    }
  });
}

// 打开文件
function openFile(filePath) {
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    dialog.showErrorBox('错误', '文件不存在');
    return;
  }

  const resolvedPath = path.resolve(filePath);

  if (!mainWindow || mainWindow.webContents.isDestroyed() || mainWindow.webContents.isLoading()) {
    if (!pendingOpenFiles.includes(resolvedPath)) {
      pendingOpenFiles.push(resolvedPath);
    }
    return;
  }

  mainWindow.webContents.send('open-document-tab', resolvedPath);

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

// IPC 事件处理
ipcMain.handle('get-app-config', () => {
  return APP_CONFIG;
});

ipcMain.handle('open-file-dialog', () => {
  return dialog.showOpenDialog(mainWindow, {
    title: '选择要打开的文件',
    filters: [
      { name: 'PDF文件', extensions: ['pdf'] },
      { name: 'Word文档', extensions: ['doc', 'docx'] },
      { name: '文本文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
});

ipcMain.handle('open-folder-dialog', () => {
  return dialog.showOpenDialog(mainWindow, {
    title: '选择文件夹',
    properties: ['openDirectory']
  });
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return {
      success: true,
      data: data,
      path: filePath
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('save-translation', async (event, translationData) => {
  try {
    const fileName = path.basename(translationData.filePath, path.extname(translationData.filePath));
    const translationFile = path.join(APP_CONFIG.translationsPath, `${fileName}_translations.json`);
    
    let translations = [];
    if (fs.existsSync(translationFile)) {
      const existingData = fs.readFileSync(translationFile, 'utf8');
      translations = JSON.parse(existingData);
    }
    
    translations.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...translationData
    });
    
    fs.writeFileSync(translationFile, JSON.stringify(translations, null, 2));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-translations', async (event, filePath) => {
  try {
    const fileName = path.basename(filePath, path.extname(filePath));
    const translationFile = path.join(APP_CONFIG.translationsPath, `${fileName}_translations.json`);
    
    if (fs.existsSync(translationFile)) {
      const data = fs.readFileSync(translationFile, 'utf8');
      return { success: true, data: JSON.parse(data) };
    } else {
      return { success: true, data: [] };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 获取所有翻译记录（用于生词本）
ipcMain.handle('get-all-translations', async () => {
  try {
    const allTranslations = [];
    
    // 检查translations目录是否存在
    if (!fs.existsSync(APP_CONFIG.translationsPath)) {
      return { success: true, data: [] };
    }
    
    // 读取所有翻译文件
    const files = fs.readdirSync(APP_CONFIG.translationsPath);
    const translationFiles = files.filter(file => file.endsWith('_translations.json'));
    
    for (const file of translationFiles) {
      try {
        const filePath = path.join(APP_CONFIG.translationsPath, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const translations = JSON.parse(data);
        
        // 将每个翻译添加到总列表中，并记录来源文件
        if (Array.isArray(translations)) {
          translations.forEach(translation => {
            translation.sourceFile = file; // 记录来源文件，用于删除时更新
            allTranslations.push(translation);
          });
        }
      } catch (error) {
        console.error(`读取翻译文件失败 ${file}:`, error);
      }
    }
    
    // 按时间戳排序（最新的在前）
    allTranslations.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.id || 0).getTime();
      const timeB = new Date(b.timestamp || b.id || 0).getTime();
      return timeB - timeA;
    });
    
    return { success: true, data: allTranslations };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 删除翻译记录
ipcMain.handle('delete-translations', async (event, translationIds) => {
  try {
    if (!Array.isArray(translationIds) || translationIds.length === 0) {
      return { success: false, error: '无效的翻译ID列表' };
    }

    // 检查translations目录是否存在
    if (!fs.existsSync(APP_CONFIG.translationsPath)) {
      return { success: true, deleted: 0 };
    }

    // 读取所有翻译文件
    const files = fs.readdirSync(APP_CONFIG.translationsPath);
    const translationFiles = files.filter(file => file.endsWith('_translations.json'));
    
    let totalDeleted = 0;
    const idSet = new Set(translationIds.map(id => String(id)));

    // 遍历每个翻译文件
    for (const file of translationFiles) {
      try {
        const filePath = path.join(APP_CONFIG.translationsPath, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const translations = JSON.parse(data);
        
        if (!Array.isArray(translations)) {
          continue;
        }

        // 过滤掉要删除的翻译
        const originalLength = translations.length;
        const filteredTranslations = translations.filter(translation => {
          const translationId = String(translation.id || translation.timestamp);
          return !idSet.has(translationId);
        });

        const deletedCount = originalLength - filteredTranslations.length;
        if (deletedCount > 0) {
          // 如果文件为空，删除文件；否则更新文件
          if (filteredTranslations.length === 0) {
            fs.unlinkSync(filePath);
          } else {
            fs.writeFileSync(filePath, JSON.stringify(filteredTranslations, null, 2));
          }
          totalDeleted += deletedCount;
        }
      } catch (error) {
        console.error(`处理翻译文件失败 ${file}:`, error);
      }
    }
    
    return { success: true, deleted: totalDeleted };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 颜色字符串转RGB
function parseColor(colorStr) {
  // 支持 rgba(r, g, b, a) 和 rgb(r, g, b) 格式
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]) / 255,
      g: parseInt(rgbaMatch[2]) / 255,
      b: parseInt(rgbaMatch[3]) / 255
    };
  }
  
  // 默认黄色高亮
  return { r: 1, g: 1, b: 0.78 };
}

// 保存标注到PDF文件（直接覆盖原文件）
ipcMain.handle('save-annotations-to-pdf', async (event, { filePath, annotations }) => {
  try {
    console.log('📝 开始保存标注到PDF:', filePath);
    
    // ⚠️ 重要：为了清除旧的高亮叠加，我们需要：
    // 1. 读取原始PDF（不包含之前保存的高亮）
    // 2. 只添加当前的高亮
    // 但pdf-lib无法区分"原始PDF"和"已修改的PDF"
    // 所以每次保存都会叠加，这是pdf-lib的限制
    
    // 读取PDF（可能包含之前的高亮）
    const existingPdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    
    console.log('📄 PDF页数:', pages.length);
    console.log('🎨 标注数量:', annotations.highlights?.length || 0);
    
    // 按页分组高亮
    const highlightsByPage = new Map();
    if (annotations.highlights) {
      annotations.highlights.forEach(highlight => {
        const pageIndex = highlight.pageIndex || 0;
        if (!highlightsByPage.has(pageIndex)) {
          highlightsByPage.set(pageIndex, []);
        }
        highlightsByPage.get(pageIndex).push(highlight);
      });
    }
    
    // 在每一页上添加高亮注释
    highlightsByPage.forEach((highlights, pageIndex) => {
      if (pageIndex >= pages.length) return;
      
      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      
      console.log(`📏 第${pageIndex}页尺寸: ${width} x ${height}`);
      
      highlights.forEach(highlight => {
        // 解析颜色
        const color = parseColor(highlight.color || 'rgba(255, 255, 200, 0.6)');
        
        // 支持新旧两种格式
        const rects = highlight.rects || (highlight.rect ? [highlight.rect] : []);
        
        // 绘制所有矩形（一个高亮可能跨多行）
        rects.forEach(rect => {
          const x = rect.x || 0;
          const y = rect.y || 0;
          const rectWidth = rect.width || 100;
          const rectHeight = rect.height || 20;
          
          // 绘制高亮矩形
          page.drawRectangle({
            x: x,
            y: y,
            width: rectWidth,
            height: rectHeight,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.4,
            borderWidth: 0
          });
          
          console.log(`✏️ 在第${pageIndex}页添加高亮: (${x.toFixed(2)}, ${y.toFixed(2)}, ${rectWidth.toFixed(2)}, ${rectHeight.toFixed(2)})`);
        });
      });
    });
    
    // 直接保存到原PDF文件（覆盖）
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(filePath, pdfBytes);
    
    console.log('✅ 标注已保存到PDF文件:', filePath);
    
    return { success: true, message: '已保存到PDF文件' };
    
  } catch (error) {
    console.error('❌ 导出PDF失败:', error);
    return { success: false, error: error.message };
  }
});

// 从PDF读取现有标注
ipcMain.handle('load-annotations-from-pdf', async (event, filePath) => {
  try {
    console.log('📖 从PDF读取标注:', filePath);
    
    const existingPdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // PDF标注提取比较复杂，pdf-lib主要用于创建，而非读取复杂注释
    // 这里返回空数据，让用户重新添加高亮
    // 如果需要完整的注释读取功能，需要使用pdf.js的annotations API
    
    return { 
      success: true, 
      data: {
        highlights: [],
        wordTranslations: {},
        sentenceTranslations: {}
      }
    };
    
  } catch (error) {
    console.error('❌ 读取PDF标注失败:', error);
    return { success: false, error: error.message };
  }
});

// 保留原有的JSON保存功能作为备份
ipcMain.handle('save-annotations', async (event, { path: savePath, data }) => {
  try {
    const fullPath = path.join(__dirname, savePath);
    fs.writeFileSync(fullPath, data, 'utf8');
    return { success: true, path: fullPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 加载标注数据（从JSON备份）
ipcMain.handle('load-annotations', async (event, filePath) => {
  try {
    const fileName = path.basename(filePath, path.extname(filePath));
    const annotationFile = path.join(APP_CONFIG.annotationsPath, `${fileName}_annotations.json`);
    
    if (fs.existsSync(annotationFile)) {
      const data = fs.readFileSync(annotationFile, 'utf8');
      return { success: true, data: JSON.parse(data) };
    } else {
      return { success: true, data: null };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 从主界面打开文件
ipcMain.handle('open-file-from-main', async (event, filePath) => {
  try {
    openFile(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理外部文件打开
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  // 只有在应用完全启动后才处理文件打开
  if (mainWindow && mainWindow.isVisible()) {
    openFile(filePath);
  }
});

// 处理外部URL打开
app.on('open-url', (event, url) => {
  event.preventDefault();
  shell.openExternal(url);
});

// 导出配置供其他模块使用
module.exports = { APP_CONFIG };
