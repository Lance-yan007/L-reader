# L-reader - App Store 上架指南

## 📚 文档导航

本目录包含所有 App Store 上架相关的文档：

### 🎯 快速开始
- **[App-Store-快速开始指南.md](./App-Store-快速开始指南.md)** - 5 步上架流程，从这里开始！

### 📋 详细文档
- **[App-Store-上线完善清单.md](./App-Store-上线完善清单.md)** - 完整的功能清单和优先级
- **[App-Store-配置指南.md](./App-Store-配置指南.md)** - 详细的配置步骤
- **[App-Store-准备工作完成报告.md](./App-Store-准备工作完成报告.md)** - 已完成工作总结

### 🛠️ 实用工具
- **[应用图标制作指南.md](./应用图标制作指南.md)** - 图标制作详细步骤
- **[build-icon.sh](./build-icon.sh)** - 图标生成自动化脚本

### ✅ 测试和验证
- **[App-Store-测试清单.md](./App-Store-测试清单.md)** - 完整测试清单

---

## 🚀 快速开始

### 第一步：阅读快速开始指南
```bash
# 打开快速开始指南
open App-Store-快速开始指南.md
```

### 第二步：准备 Apple Developer 账号
1. 注册 [Apple Developer Program](https://developer.apple.com)（$99/年）
2. 创建 App ID：`com.lreader.app`
3. 创建 Mac App Distribution 证书

### 第三步：创建应用图标
1. 设计 1024x1024 PNG 图标
2. 保存为 `build/icon.png`
3. 运行图标生成脚本：
   ```bash
   ./build-icon.sh
   ```

### 第四步：配置和构建
1. 更新 `package.json` 中的 `identity` 字段
2. 运行构建：
   ```bash
   npm run build
   ```

### 第五步：提交审核
1. 在 App Store Connect 创建应用记录
2. 填写应用信息
3. 上传构建
4. 提交审核

---

## ✅ 当前状态

### 已完成 ✅
- [x] 安全性修复（contextIsolation、preload）
- [x] 密码重置功能
- [x] 输入验证增强
- [x] 错误处理改进
- [x] 隐私政策和使用条款
- [x] App Store 构建配置

### 待完成 ⏳
- [ ] Apple Developer 账号准备
- [ ] 应用图标制作
- [ ] 代码签名配置
- [ ] 构建和测试
- [ ] App Store Connect 配置
- [ ] 提交审核

---

## 📞 需要帮助？

### 常见问题
参考 [App-Store-快速开始指南.md](./App-Store-快速开始指南.md) 中的"常见问题"部分。

### 技术支持
- Apple Developer 支持：https://developer.apple.com/support/
- App Store Connect 帮助：https://help.apple.com/app-store-connect/

---

## 🎯 预计时间线

| 阶段 | 预计时间 |
|------|---------|
| Apple Developer 账号准备 | 1-2 天 |
| 应用图标制作 | 0.5-1 天 |
| 配置和构建 | 1 天 |
| 提交审核 | 0.5 天 |
| **总计** | **3-5 天** |

**注意**：Apple Developer 审核可能需要额外时间。

---

## 📝 重要提示

1. **代码签名**：必须使用有效的 Apple Developer 证书
2. **隐私政策**：必须提供可访问的隐私政策 URL
3. **应用图标**：必须提供 `.icns` 格式的图标
4. **测试**：建议充分测试后再提交审核

---

## 🎉 祝您上架顺利！

按照文档步骤操作，您很快就能将应用上架到 App Store 了！

如有问题，请参考相关文档或联系支持。

