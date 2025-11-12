# App Store 快速开始指南

## 🚀 5 步上架 App Store

### 第 1 步：准备 Apple Developer 账号（1-2 天）

1. **注册账号**
   - 访问 [Apple Developer](https://developer.apple.com)
   - 注册 Apple Developer Program（$99/年）
   - 等待审核通过（通常 24-48 小时）

2. **创建 App ID**
   - 登录 Apple Developer
   - 进入 "Certificates, Identifiers & Profiles"
   - 创建新 App ID：`com.lreader.app`
   - 选择功能：App Groups（如果需要）

3. **创建证书**
   - 创建 "Mac App Distribution" 证书
   - 下载并安装到 Keychain

---

### 第 2 步：创建应用图标（0.5-1 天）

1. **设计图标**
   - 创建 1024x1024 PNG 图标
   - 参考 `应用图标制作指南.md`

2. **转换为 .icns**
   ```bash
   # 使用提供的脚本
   chmod +x build-icon.sh
   ./build-icon.sh
   ```
   或参考 `应用图标制作指南.md` 中的详细步骤

3. **验证图标**
   - 确保 `build/icon.icns` 文件存在
   - 检查文件大小合理（通常 < 5MB）

---

### 第 3 步：配置代码签名（0.5 天）

1. **获取证书名称**
   ```bash
   security find-identity -v -p codesigning
   ```
   找到类似：`Developer ID Application: Your Name (TEAM_ID)`

2. **更新 package.json**
   ```json
   {
     "build": {
       "mac": {
         "identity": "Developer ID Application: Your Name (TEAM_ID)"
       }
     }
   }
   ```

3. **验证配置**
   - 检查 `build/entitlements.mac.plist` 存在
   - 检查 `package.json` 配置正确

---

### 第 4 步：构建应用（0.5 天）

1. **安装依赖**
   ```bash
   npm install
   ```

2. **构建应用**
   ```bash
   npm run build
   ```

3. **验证构建**
   ```bash
   # 检查构建产物
   ls -lh dist/
   
   # 验证代码签名
   codesign --verify --verbose --deep --strict dist/L-reader.app
   ```

4. **测试应用**
   - 打开构建的应用
   - 测试主要功能
   - 参考 `App-Store-测试清单.md`

---

### 第 5 步：提交到 App Store（1 天）

1. **创建 App Store Connect 记录**
   - 登录 [App Store Connect](https://appstoreconnect.apple.com)
   - 创建新 App
   - 填写基本信息：
     - 名称：L-reader
     - 主要语言：简体中文
     - Bundle ID：com.lreader.app
     - SKU：l-reader-001

2. **填写应用信息**
   - 应用描述（至少 100 字）
   - 关键词（最多 100 字符）
   - 支持 URL
   - **隐私政策 URL**（必须提供）

3. **准备截图**
   - 至少 3 张截图
   - 尺寸：1280x800 或更高
   - 展示主要功能

4. **上传构建**
   - 使用 [Transporter](https://apps.apple.com/app/transporter/id1450874784)
   - 选择构建的 `.pkg` 文件
   - 点击"交付"

5. **提交审核**
   - 在 App Store Connect 选择构建版本
   - 填写审核信息
   - 提交审核

---

## ⚡ 快速命令参考

### 开发环境
```bash
# 启动开发环境
npm start

# 开发模式（带调试工具）
npm run dev
```

### 构建
```bash
# 构建应用
npm run build

# 仅构建不发布
npm run dist
```

### 图标处理
```bash
# 创建图标（需要先有 build/icon.png）
./build-icon.sh
```

---

## 📋 提交前检查清单

### 代码层面
- [x] 安全性修复完成
- [x] 密码重置功能完成
- [x] 输入验证完成
- [x] 隐私政策和使用条款完成

### 配置层面
- [ ] Apple Developer 账号已注册
- [ ] App ID 已创建
- [ ] 证书已创建并安装
- [ ] 应用图标已创建（.icns）
- [ ] package.json 中 identity 已配置

### 构建层面
- [ ] 应用成功构建
- [ ] 代码签名验证通过
- [ ] 应用功能测试通过

### 提交层面
- [ ] App Store Connect 记录已创建
- [ ] 应用信息已填写
- [ ] 隐私政策 URL 已提供
- [ ] 应用截图已准备
- [ ] 构建已上传

---

## 🆘 常见问题

### Q1: 构建失败，提示找不到证书
**A**: 检查：
1. 证书是否正确安装到 Keychain
2. `package.json` 中的 `identity` 是否正确
3. 使用 `security find-identity -v -p codesigning` 查看可用证书

### Q2: 应用在沙盒环境下无法访问文件
**A**: 检查 `build/entitlements.mac.plist` 中的权限配置：
- `com.apple.security.files.user-selected.read-write` 应为 `true`

### Q3: 图标不显示
**A**: 检查：
1. `build/icon.icns` 文件是否存在
2. `package.json` 中图标路径是否正确
3. 图标格式是否正确

### Q4: 审核被拒
**A**: 常见原因：
1. 缺少隐私政策 URL
2. 功能不完整
3. 违反审核指南

参考：[Apple 审核指南](https://developer.apple.com/app-store/review/guidelines/)

---

## 📚 相关文档

- `App-Store-上线完善清单.md` - 完整功能清单
- `App-Store-配置指南.md` - 详细配置步骤
- `App-Store-准备工作完成报告.md` - 已完成工作总结
- `应用图标制作指南.md` - 图标制作详细步骤
- `App-Store-测试清单.md` - 完整测试清单

---

## 🎯 预计时间线

| 步骤 | 预计时间 | 状态 |
|------|---------|------|
| 注册 Apple Developer | 1-2 天 | ⏳ 待完成 |
| 创建应用图标 | 0.5-1 天 | ⏳ 待完成 |
| 配置代码签名 | 0.5 天 | ⏳ 待完成 |
| 构建和测试 | 1 天 | ⏳ 待完成 |
| 提交审核 | 0.5 天 | ⏳ 待完成 |
| **总计** | **3-5 天** | |

**注意**：Apple Developer 审核可能需要额外时间。

---

## ✅ 完成标准

当您完成以下所有项目时，就可以提交审核了：

1. ✅ 代码已完成并测试通过
2. ✅ Apple Developer 账号已准备
3. ✅ 应用图标已创建
4. ✅ 代码签名已配置
5. ✅ 应用已成功构建
6. ✅ App Store Connect 信息已填写
7. ✅ 隐私政策 URL 已提供

---

## 🎉 下一步

完成上述步骤后：

1. **提交审核**
2. **等待审核**（通常 1-3 个工作日）
3. **处理反馈**（如有需要）
4. **应用上架** 🚀

---

**祝您上架顺利！** 如有问题，请参考相关文档或联系支持。

