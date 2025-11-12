# App Store 配置指南

## 📋 快速配置步骤

### 1. 更新 package.json

在 `package.json` 的 `build.mac` 部分添加以下配置：

```json
{
  "build": {
    "appId": "com.lreader.app",
    "productName": "L-reader",
    "directories": {
      "output": "dist"
    },
    "files": [
      "**/*",
      "!node_modules/**/*"
    ],
    "mac": {
      "category": "public.app-category.education",
      "target": [
        {
          "target": "mas",
          "arch": ["x64", "arm64"]
        }
      ],
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "gatekeeperAssess": false,
      "hardenedRuntime": true,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "icon": "build/icon.icns"
    }
  }
}
```

**重要说明**：
- `identity`: 替换为你的开发者证书名称和 Team ID
- `icon`: 确保创建了 `build/icon.icns` 文件
- `target`: `mas` 表示 Mac App Store

---

### 2. 创建应用图标

#### 步骤 1: 准备图标源文件
- 创建 1024x1024 的 PNG 图标
- 确保背景透明（如果需要）
- 保存为 `build/icon.png`

#### 步骤 2: 转换为 .icns 格式

**方法 1: 使用 iconutil（macOS 自带）**
```bash
# 创建 iconset 目录
mkdir -p build/icon.iconset

# 创建不同尺寸的图标
sips -z 16 16     build/icon.png --out build/icon.iconset/icon_16x16.png
sips -z 32 32     build/icon.png --out build/icon.iconset/icon_16x16@2x.png
sips -z 32 32     build/icon.png --out build/icon.iconset/icon_32x32.png
sips -z 64 64     build/icon.png --out build/icon.iconset/icon_32x32@2x.png
sips -z 128 128   build/icon.png --out build/icon.iconset/icon_128x128.png
sips -z 256 256   build/icon.png --out build/icon.iconset/icon_128x128@2x.png
sips -z 256 256   build/icon.png --out build/icon.iconset/icon_256x256.png
sips -z 512 512   build/icon.png --out build/icon.iconset/icon_256x256@2x.png
sips -z 512 512   build/icon.png --out build/icon.iconset/icon_512x512.png
sips -z 1024 1024 build/icon.png --out build/icon.iconset/icon_512x512@2x.png

# 转换为 .icns
iconutil -c icns build/icon.iconset -o build/icon.icns
```

**方法 2: 使用在线工具**
- 访问 https://cloudconvert.com/png-to-icns
- 上传 1024x1024 PNG 文件
- 下载转换后的 .icns 文件
- 保存为 `build/icon.icns`

---

### 3. 配置代码签名

#### 步骤 1: 获取开发者证书

1. 登录 [Apple Developer](https://developer.apple.com)
2. 进入 "Certificates, Identifiers & Profiles"
3. 创建新的证书：
   - 类型：Mac App Distribution
   - 用于：Mac App Store 和直接分发

#### 步骤 2: 下载并安装证书

1. 下载证书文件（.cer）
2. 双击安装到 Keychain
3. 在 Keychain Access 中查看证书名称

#### 步骤 3: 更新 package.json

找到你的证书名称，格式通常是：
```
Developer ID Application: Your Name (TEAM_ID)
```

更新 `package.json` 中的 `identity` 字段。

---

### 4. 创建 App ID

1. 登录 [Apple Developer](https://developer.apple.com)
2. 进入 "Certificates, Identifiers & Profiles" → "Identifiers"
3. 点击 "+" 创建新标识符
4. 选择 "App IDs" → "App"
5. 填写：
   - Description: L-reader
   - Bundle ID: `com.lreader.app`（必须与 package.json 中的 appId 一致）
6. 保存

---

### 5. 配置 App Store Connect

#### 步骤 1: 创建应用记录

1. 登录 [App Store Connect](https://appstoreconnect.apple.com)
2. 进入 "我的 App"
3. 点击 "+" 创建新 App
4. 填写信息：
   - 平台：macOS
   - 名称：L-reader
   - 主要语言：简体中文
   - Bundle ID：选择刚才创建的 `com.lreader.app`
   - SKU：l-reader-001（唯一标识符）

#### 步骤 2: 填写应用信息

- **应用描述**：至少 100 字，说明应用功能
- **关键词**：最多 100 个字符，用逗号分隔
- **支持 URL**：你的网站或支持页面
- **隐私政策 URL**：必须提供（可以是 GitHub Pages 或其他托管服务）

#### 步骤 3: 准备截图

- 至少 3 张截图
- 尺寸：1280x800 或更高
- 格式：PNG 或 JPEG
- 内容：展示应用的主要功能

---

### 6. 构建和提交

#### 步骤 1: 构建应用

```bash
npm run build
```

这会生成 `dist/L-reader-mas-x64.dmg` 或类似文件。

#### 步骤 2: 验证构建

```bash
# 验证代码签名
codesign --verify --verbose --deep --strict dist/L-reader.app

# 验证公证（如果需要）
spctl --assess --verbose --type execute dist/L-reader.app
```

#### 步骤 3: 上传到 App Store Connect

1. 打开 [Transporter](https://apps.apple.com/app/transporter/id1450874784)（App Store 应用）
2. 选择构建的 .pkg 文件
3. 点击 "交付"
4. 等待上传完成

#### 步骤 4: 提交审核

1. 在 App Store Connect 中选择你的应用
2. 进入 "版本" 标签
3. 选择构建版本
4. 填写审核信息
5. 提交审核

---

## ⚠️ 常见问题

### 1. 代码签名失败

**错误**：`No identity found`

**解决方案**：
- 检查证书是否正确安装
- 确认证书名称与 package.json 中的 identity 一致
- 使用 `security find-identity -v -p codesigning` 查看可用证书

### 2. 沙盒权限问题

**错误**：应用无法访问文件

**解决方案**：
- 检查 `entitlements.mac.plist` 中的权限声明
- 确保使用了正确的文件访问 API
- 测试应用在沙盒环境下的功能

### 3. 构建失败

**错误**：`electron-builder` 报错

**解决方案**：
- 确保所有依赖都已安装：`npm install`
- 检查 `package.json` 中的配置是否正确
- 查看详细错误日志：`npm run build -- --debug`

---

## 📚 参考资源

- [Electron 官方文档 - 代码签名](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Apple 开发者文档 - 应用分发](https://developer.apple.com/distribute/)
- [App Store 审核指南](https://developer.apple.com/app-store/review/guidelines/)

---

## ✅ 检查清单

在提交前，确保：

- [ ] 代码签名配置正确
- [ ] 应用图标已创建（.icns 格式）
- [ ] entitlements.mac.plist 已配置
- [ ] package.json 中的 build.mac 配置完整
- [ ] App Store Connect 中的应用信息已填写
- [ ] 隐私政策 URL 已提供
- [ ] 应用截图已准备
- [ ] 应用已成功构建
- [ ] 应用已通过代码签名验证
- [ ] 应用已在真实设备上测试

