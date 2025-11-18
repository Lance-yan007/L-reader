# L-reader Web版使用说明

## 概述

这是L-reader的Web版本，完全保留了桌面版的所有功能，可以在浏览器中直接使用。

## 功能特性

✅ **完全保留桌面版功能**：
- PDF文档渲染（双层渲染架构）
- 点词翻译
- AI智能翻译
- 高亮和注释
- 生词本管理
- 用户认证和订阅管理
- 撤销/重做
- 保存功能

## 文件结构

```
web-app.html          # Web版主入口
web-main.js           # Web版应用主逻辑（路由系统）
web-utils/            # Web适配层
  ├── ipc-adapter.js          # IPC通信适配器
  ├── file-system-adapter.js  # 文件系统适配器
  └── storage-adapter.js      # 存储适配器
```

## 使用方法

### 1. 直接打开

在浏览器中打开 `web-app.html` 即可使用。

### 2. 使用本地服务器（推荐）

由于浏览器安全限制，建议使用本地服务器：

```bash
# 使用Python
python -m http.server 8000

# 或使用Node.js
npx serve

# 或使用PHP
php -S localhost:8000
```

然后访问 `http://localhost:8000/web-app.html`

## 技术实现

### 适配层说明

Web版通过适配层将Electron API转换为Web API：

1. **IPC适配器** (`ipc-adapter.js`)
   - 将Electron的IPC通信转换为Web事件系统
   - 模拟 `ipcRenderer.invoke()`, `ipcRenderer.on()` 等方法

2. **文件系统适配器** (`file-system-adapter.js`)
   - 使用File API和IndexedDB存储文件
   - 将文件转换为Web可用的格式

3. **存储适配器** (`storage-adapter.js`)
   - 使用IndexedDB存储翻译、标注、生词本等数据
   - 完全兼容桌面版的数据结构

### 路由系统

Web版使用单页应用(SPA)架构，通过hash路由管理不同页面：

- `#/main` - 主界面
- `#/reader` - 阅读器
- `#/profile` - 个人中心
- `#/vocabulary` - 生词本
- `#/auth` - 登录/注册

## 数据存储

Web版使用以下方式存储数据：

1. **IndexedDB** - 存储文件、翻译、标注、生词本
2. **localStorage** - 存储用户偏好设置
3. **sessionStorage** - 存储临时会话数据

所有数据都存储在浏览器本地，不会上传到服务器（除了用户认证和订阅数据）。

## 限制说明

### Web环境限制

1. **文件访问**：只能访问用户主动选择的文件，无法访问系统文件系统
2. **PDF保存**：无法直接将标注保存到PDF文件（但可以保存标注数据）
3. **开发者工具**：无法通过代码打开浏览器开发者工具

### 功能差异

- ✅ 所有核心功能完全保留
- ⚠️ 文件系统访问方式不同（使用File API）
- ⚠️ 数据存储位置不同（浏览器本地存储）

## 开发说明

### 修改代码

如果需要修改功能，主要文件：

1. `web-main.js` - 应用主逻辑和路由
2. `web-utils/*.js` - 适配层实现
3. `src/scripts/*.js` - 业务逻辑（与桌面版共享）

### 调试

1. 打开浏览器开发者工具（F12）
2. 查看Console查看日志
3. 查看Application > IndexedDB查看存储的数据

## 常见问题

### Q: 文件无法打开？

A: 确保使用本地服务器运行，而不是直接打开HTML文件。

### Q: 数据会丢失吗？

A: 数据存储在浏览器本地，除非清除浏览器数据，否则不会丢失。

### Q: 可以离线使用吗？

A: 可以，但首次使用需要联网加载Supabase客户端和PDF.js库。

### Q: 如何清除所有数据？

A: 在浏览器开发者工具中，Application > Clear storage > Clear site data

## 更新日志

### v1.0.0 (2024-01-XX)
- ✅ 初始Web版本发布
- ✅ 完整功能迁移
- ✅ 适配层实现
- ✅ 路由系统实现

## 技术支持

如有问题，请查看：
- 桌面版文档
- GitHub Issues
- 项目README

