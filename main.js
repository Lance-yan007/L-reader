const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 保持对窗口对象的全局引用
let mainWindow;
let readerWindow;

// 应用配置
const APP_CONFIG = {
  name: 'NPDF Reader',
  version: '1.0.0',
  userDataPath: path.join(__dirname, 'user-data'),
  documentsPath: path.join(__dirname, 'user-data', 'documents'),
  translationsPath: path.join(__dirname, 'user-data', 'translations')
};

// 确保用户数据目录存在
function ensureUserDataDirectories() {
  const dirs = [
    APP_CONFIG.userDataPath,
    APP_CONFIG.documentsPath,
    APP_CONFIG.translationsPath
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
      enableRemoteModule: true
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // 加载主界面
  mainWindow.loadFile('src/main.html');

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 窗口关闭时
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// 创建阅读器窗口
function createReaderWindow(filePath) {
  if (readerWindow) {
    readerWindow.focus();
    return;
  }

  readerWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // 加载阅读器界面
  readerWindow.loadFile('src/reader.html');

  // 传递文件路径到渲染进程
  readerWindow.webContents.once('did-finish-load', () => {
    console.log('发送文件路径到阅读器窗口:', filePath);
    readerWindow.webContents.send('file-opened', filePath);
  });

  readerWindow.once('ready-to-show', () => {
    readerWindow.show();
  });

  readerWindow.on('closed', () => {
    readerWindow = null;
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    readerWindow.webContents.openDevTools();
  }
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

  // 获取文件信息
  const stats = fs.statSync(filePath);
  const fileInfo = {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    modified: stats.mtime,
    type: path.extname(filePath).toLowerCase()
  };

  // 创建阅读器窗口
  createReaderWindow(filePath);
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
  if (mainWindow) {
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
