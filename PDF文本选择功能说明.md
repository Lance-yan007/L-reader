# 📝 PDF文本选择功能使用指南

## 🎯 功能概述

NPDF Reader 现在支持像浏览网页一样选择PDF文档中的文字！这个功能让您可以：
- ✅ 用鼠标光标自由选择PDF中的任何文字
- ✅ 复制选中的文本到剪贴板
- ✅ 为后续的翻译、注释功能提供基础

## 🏗️ 技术实现

### 双层渲染架构
```
PDF页面显示 = Canvas层（显示图像） + 文本层（支持选择）
```

1. **Canvas层**：高清渲染PDF页面的可视内容
2. **文本层**：覆盖在Canvas上的透明文本层，支持选择和复制

### 核心技术
- **PDF.js getTextContent API**：精确提取文本位置和内容
- **绝对定位**：每个文字都精确定位到Canvas对应位置
- **CSS透明**：文本颜色透明，只用于选择，不遮挡下方的Canvas显示

## 🚀 如何使用

### 基本操作
1. **打开PDF文件**
   - 点击"打开文件"按钮
   - 选择一个PDF文件

2. **选择文本**
   - 将鼠标移动到文档上（光标会变成文本光标）
   - 点击并拖动鼠标即可选择文字
   - 选中的文字会显示蓝色半透明高亮

3. **复制文本**
   - 选中文字后，按 `Ctrl+C`（Windows）或 `Cmd+C`（Mac）
   - 或右键点击选择"复制"

### 查看选中的文本
打开浏览器开发者工具（F12），在Console中可以看到：
```
选中的文本: [您选中的内容]
选中的文本长度: X 个字符
```

## 🎨 视觉效果

### 正常状态
- 文本层透明度：20%
- 光标：文本光标（I-beam）

### 选中状态
- 高亮颜色：蓝色半透明 `rgba(74, 144, 226, 0.3)`
- 文字本身：保持透明

## 🔧 高级功能

### 调试模式
如果需要查看文本层的边界（用于开发调试），可以在浏览器控制台中执行：

```javascript
// 开启调试模式 - 显示文本边界
document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    layer.classList.add('debug');
});

// 关闭调试模式
document.querySelectorAll('.pdf-text-layer').forEach(layer => {
    layer.classList.remove('debug');
});
```

### 自定义事件
文本选择会触发自定义事件 `text-selected`，可以监听此事件：

```javascript
document.addEventListener('text-selected', (e) => {
    console.log('选中的文本:', e.detail.text);
    console.log('Selection对象:', e.detail.selection);
    
    // 在这里添加您的自定义处理逻辑
    // 例如：显示翻译弹窗、保存到笔记等
});
```

## 📊 技术细节

### 文本层结构
```html
<div class="pdf-page-container">
    <!-- Canvas层：显示PDF图像 -->
    <canvas></canvas>
    
    <!-- 文本层：支持选择 -->
    <div class="pdf-text-layer">
        <span style="position: absolute; left: 100px; top: 200px; ...">Hello</span>
        <span style="position: absolute; left: 150px; top: 200px; ...">World</span>
        <!-- 更多文本元素... -->
    </div>
</div>
```

### 坐标转换
PDF.js 使用数学坐标系统，我们通过变换矩阵将其转换为屏幕坐标：

```javascript
const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
const left = tx[4];  // X坐标
const top = tx[5];   // Y坐标
const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
```

### 字体处理
- 自动检测粗体和斜体
- 使用PDF中的字体信息设置fontFamily
- 动态计算fontSize以匹配原始PDF显示

## 🎯 下一步计划

基于文本选择功能，可以继续开发：
1. **快捷翻译**：选中文字后显示翻译按钮
2. **智能高亮**：保存高亮并在重新打开时恢复
3. **笔记注释**：选中文字后添加注释
4. **词汇表**：自动收集选中的单词
5. **搜索功能**：在文本层中搜索关键词

## ⚙️ 配置选项

### 调整文本层透明度
在 `src/styles/reader.css` 中修改：

```css
.pdf-text-layer {
    opacity: 0.2;  /* 改为 0 完全透明，改为 1 完全不透明 */
}
```

### 调整选择高亮颜色
```css
.pdf-text-layer ::selection {
    background: rgba(74, 144, 226, 0.3);  /* 修改颜色和透明度 */
}
```

## 🐛 故障排除

### 文本无法选择
1. 检查控制台是否有错误
2. 确认PDF文件包含文本（而非纯图片扫描版）
3. 检查文本层是否正确加载：
   ```javascript
   document.querySelectorAll('.pdf-text-layer').length
   ```

### 文本位置不准确
1. 可能是PDF使用了特殊字体或编码
2. 尝试开启调试模式查看文本边界
3. 检查缩放级别是否正确

### 性能问题
对于文本量很大的PDF：
1. 文本层渲染可能需要几秒钟
2. 观察控制台的渲染进度日志
3. 考虑实现懒加载（仅渲染可见页面的文本层）

## 📝 版本信息

- **实现日期**：2025年10月16日
- **版本**：NPDF Reader v1.0.0
- **依赖**：PDF.js v3.11.174

---

**开发者**: 作为资深程序员设计和实现  
**特别感谢**: PDF.js 开源项目提供强大的PDF渲染能力

