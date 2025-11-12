# StoreKit 集成指南

## 📋 概述

要在 macOS 应用中实现真实的 App Store 内购功能，需要集成 Apple 的 StoreKit 框架。由于 Electron 不直接支持 StoreKit，我们需要通过原生模块来实现。

---

## 🎯 实现方案

### 方案1：使用原生 Node.js 模块（推荐）

创建一个原生 Node.js 模块来调用 StoreKit API。

#### 步骤1：安装依赖

```bash
npm install --save-dev node-gyp
npm install --save nan
```

#### 步骤2：创建原生模块

创建 `native/storekit-binding/` 目录，包含：
- `binding.gyp` - 构建配置
- `storekit.cc` - C++ 代码调用 StoreKit
- `storekit.js` - JavaScript 接口

#### 步骤3：编译模块

```bash
cd native/storekit-binding
node-gyp configure
node-gyp build
```

### 方案2：使用第三方库

可以使用现有的 Electron StoreKit 集成库（如果有的话）。

### 方案3：使用 App Store Connect API（服务器端验证）

在服务器端使用 App Store Connect API 验证收据，应用端只负责发起购买。

---

## 📝 当前实现状态

### ✅ 已完成

1. **StoreKit 管理器类** (`src/utils/storekit.js`)
   - 封装了 StoreKit 调用接口
   - 支持初始化、加载产品、购买、恢复购买

2. **IPC 处理** (`main.js`)
   - 添加了 StoreKit 相关的 IPC 处理
   - 预留了原生模块调用接口

3. **订阅流程集成** (`src/scripts/profile.js`)
   - 集成了 StoreKit 购买流程
   - 支持测试模式降级

### ⏳ 待完成

1. **原生 StoreKit 模块**
   - 需要创建原生 Node.js 模块
   - 调用 macOS StoreKit 框架

2. **App Store Connect 配置**
   - 在 App Store Connect 中创建订阅产品
   - 配置产品 ID：`com.npdf.reader.monthly` 和 `com.npdf.reader.yearly`

3. **收据验证服务**
   - 实现服务器端收据验证
   - 或使用 App Store Connect API

---

## 🔧 App Store Connect 配置

### 1. 创建订阅产品

1. 登录 [App Store Connect](https://appstoreconnect.apple.com/)
2. 选择您的应用
3. 进入"应用内购买项目"
4. 创建订阅组：
   - 订阅组名称：NPDF Reader 订阅
5. 添加订阅产品：
   - **月订阅**：
     - 产品 ID：`com.npdf.reader.monthly`
     - 价格：¥39.9/月
     - 订阅周期：1个月
   - **年订阅**：
     - 产品 ID：`com.npdf.reader.yearly`
     - 价格：¥299/年
     - 订阅周期：1年

### 2. 配置订阅信息

- 本地化名称和描述
- 订阅价格
- 免费试用期（可选）
- 促销价格（可选）

---

## 💻 原生模块实现示例

### binding.gyp

```json
{
  "targets": [
    {
      "target_name": "storekit",
      "sources": [ "storekit.cc" ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++14"],
            "FRAMEWORK_SEARCH_PATHS": [
              "/System/Library/Frameworks"
            ],
            "OTHER_LDFLAGS": [
              "-framework", "StoreKit",
              "-framework", "Foundation"
            ]
          }
        }]
      ]
    }
  ]
}
```

### storekit.cc (简化示例)

```cpp
#include <nan.h>
#include <StoreKit/StoreKit.h>

using namespace v8;

// 实现 StoreKit 调用逻辑
// 这里需要实现：
// - 初始化 StoreKit
// - 加载产品信息
// - 发起购买
// - 处理购买结果
// - 验证收据
```

---

## 🚀 快速开始（测试模式）

在完成原生模块之前，可以使用测试模式：

1. 用户点击订阅
2. 系统检测到 StoreKit 未完全配置
3. 提示用户选择测试模式
4. 测试模式下直接创建订阅记录（不验证收据）

---

## 📚 参考资源

1. **Apple 官方文档**：
   - [StoreKit 2 文档](https://developer.apple.com/documentation/storekit)
   - [App 内购买项目指南](https://developer.apple.com/cn/in-app-purchase/)

2. **Electron 相关**：
   - [Electron 原生模块开发](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

3. **收据验证**：
   - [App Store 收据验证](https://developer.apple.com/documentation/appstorereceipts)

---

## ⚠️ 注意事项

1. **Apple 审核要求**：
   - 所有虚拟商品必须使用 App Store 内购
   - 不能使用第三方支付方式
   - 必须正确验证收据

2. **测试环境**：
   - 使用沙盒测试账号测试
   - 在 App Store Connect 中配置测试账号

3. **生产环境**：
   - 确保收据验证服务正常运行
   - 处理网络错误和重试
   - 实现订阅状态同步

---

## 🎯 下一步

1. **创建原生模块**（优先级：高）
   - 实现 StoreKit 调用
   - 编译和测试

2. **配置 App Store Connect**（优先级：高）
   - 创建订阅产品
   - 配置价格和描述

3. **实现收据验证**（优先级：中）
   - 服务器端验证服务
   - 或使用 App Store Connect API

4. **测试和优化**（优先级：中）
   - 沙盒环境测试
   - 错误处理完善

---

## 💡 提示

- 原生模块开发需要 C++ 和 Objective-C 知识
- 可以考虑外包给专业开发者
- 或者使用现有的第三方解决方案（如果有）

