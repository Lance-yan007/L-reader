# App Store 内购配置指南

## 🎯 目标

配置真实的 App Store 内购功能，让用户可以通过 Apple 支付系统完成订阅购买。

---

## 📋 前置条件

1. **Apple Developer 账号**（$99/年）
   - 注册地址：https://developer.apple.com
   - 需要签署《付费应用程序协议》

2. **App Store Connect 访问权限**
   - 登录：https://appstoreconnect.apple.com
   - 确保应用已创建

---

## 🔧 第一步：在 App Store Connect 中配置订阅产品

### 1.1 创建应用内购买项目

1. 登录 [App Store Connect](https://appstoreconnect.apple.com/)
2. 选择您的应用
3. 进入 **"功能"** → **"App 内购买项目"**
4. 点击 **"+"** 创建新的内购项目

### 1.2 创建订阅组

1. 点击 **"创建订阅组"**
2. 订阅组名称：`NPDF Reader 订阅`
3. 参考名称：`NPDF Reader Subscription`
4. 点击 **"创建"**

### 1.3 添加月订阅产品

1. 在订阅组中点击 **"+"** 添加订阅
2. 填写信息：
   - **产品 ID**：`com.npdf.reader.monthly`（必须与代码中一致）
   - **订阅时长**：1个月
   - **价格**：¥39.9
   - **本地化信息**：
     - 显示名称：`月订阅`
     - 描述：`享受每日200次点词翻译、50次AI助手、500个生词本容量`
3. 点击 **"创建"**

### 1.4 添加年订阅产品

1. 在同一个订阅组中点击 **"+"** 添加订阅
2. 填写信息：
   - **产品 ID**：`com.npdf.reader.yearly`（必须与代码中一致）
   - **订阅时长**：1年
   - **价格**：¥299
   - **本地化信息**：
     - 显示名称：`年订阅`
     - 描述：`享受无限点词翻译、无限AI助手、无限生词本容量`
3. 点击 **"创建"**

### 1.5 配置订阅层级（可选）

1. 在订阅组中设置订阅层级
2. 将年订阅设置为更高层级（推荐）
3. 配置升级/降级规则

---

## 💻 第二步：集成原生 StoreKit 模块

### 方案A：使用现有的 npm 包（推荐）

搜索是否有现成的 Electron StoreKit 集成包：

```bash
npm search electron storekit
npm search storekit electron
```

### 方案B：创建原生 Node.js 模块

#### 2.1 安装依赖

```bash
npm install --save-dev node-gyp nan
```

#### 2.2 创建模块结构

```
native/
  └── storekit-binding/
      ├── binding.gyp
      ├── storekit.cc
      └── package.json
```

#### 2.3 实现 StoreKit 调用

需要实现以下功能：
- 初始化 StoreKit
- 加载产品信息
- 发起购买
- 处理购买结果
- 验证收据

**注意**：这需要 C++ 和 Objective-C 知识，建议找专业开发者协助。

---

## 🚀 第三步：测试内购功能

### 3.1 配置沙盒测试账号

1. 在 App Store Connect 中进入 **"用户和访问"** → **"沙盒技术测试员"**
2. 添加测试账号（使用真实的 Apple ID 邮箱）
3. 测试账号不能是已注册的开发者账号

### 3.2 在应用中测试

1. 使用测试账号登录 macOS
2. 在应用中测试购买流程
3. 验证订阅状态更新

---

## 📝 当前代码状态

### ✅ 已实现

1. **StoreKit 管理器** (`src/utils/storekit.js`)
   - 封装了 StoreKit 调用接口
   - 支持初始化、购买、恢复购买

2. **IPC 处理** (`main.js`)
   - 添加了 StoreKit IPC 处理
   - 预留了原生模块调用接口

3. **订阅流程** (`src/scripts/profile.js`)
   - 集成了购买流程
   - 支持测试模式降级

### ⏳ 需要完成

1. **原生模块实现**
   - 创建原生 Node.js 模块
   - 调用 macOS StoreKit 框架

2. **收据验证**
   - 实现服务器端验证
   - 或使用 App Store Connect API

---

## 🔍 产品 ID 配置

确保代码中的产品 ID 与 App Store Connect 中配置的一致：

```javascript
// src/utils/storekit.js
this.products = {
    monthly: 'com.npdf.reader.monthly',  // 必须与 App Store Connect 一致
    yearly: 'com.npdf.reader.yearly'     // 必须与 App Store Connect 一致
};
```

---

## ⚠️ 重要提示

1. **Apple 审核要求**：
   - 所有虚拟商品必须使用 App Store 内购
   - 不能使用第三方支付方式
   - 必须正确验证收据

2. **测试环境**：
   - 使用沙盒测试账号
   - 测试购买不会产生真实费用

3. **生产环境**：
   - 确保收据验证服务正常运行
   - 处理网络错误和重试
   - 实现订阅状态同步

---

## 🎯 快速测试方案

在完成原生模块之前，可以使用测试模式：

1. 用户点击订阅
2. 系统检测到 StoreKit 未完全配置
3. 提示用户选择测试模式
4. 测试模式下直接创建订阅记录

**注意**：测试模式仅用于开发，不能用于生产环境。

---

## 📚 参考资源

1. **Apple 官方文档**：
   - [StoreKit 2 文档](https://developer.apple.com/documentation/storekit)
   - [App 内购买项目指南](https://developer.apple.com/cn/in-app-purchase/)
   - [收据验证](https://developer.apple.com/documentation/appstorereceipts)

2. **App Store Connect**：
   - [App Store Connect 帮助](https://help.apple.com/app-store-connect/)

3. **Electron 相关**：
   - [Electron 原生模块开发](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

---

## 💡 建议

1. **优先完成 App Store Connect 配置**
   - 这是最基础的一步
   - 不需要编程知识

2. **原生模块开发**
   - 如果团队没有 C++/Objective-C 经验
   - 可以考虑外包或使用第三方服务

3. **收据验证**
   - 可以使用 Apple 的验证 API
   - 或使用第三方验证服务

---

## 🎉 完成后的效果

用户点击订阅后：
1. 系统调用 StoreKit API
2. 显示 Apple 支付界面
3. 用户完成支付
4. 验证收据
5. 更新订阅状态
6. 解锁功能

所有支付通过 Apple 处理，您无需直接处理收款！

