# 阿里云部署实操指南

> 本文档提供详细的阿里云账号注册、函数部署和ICP备案的操作步骤

---

## 第一步：注册阿里云账号（10分钟）

### 1.1 访问阿里云官网
打开浏览器访问：[https://www.aliyun.com](https://www.aliyun.com)

### 1.2 注册账号
1. 点击右上角 **"免费注册"**
2. 使用手机号注册（建议用法人手机号）
3. 设置登录密码
4. 完成手机验证

### 1.3 企业实名认证（必需）
1. 登录后，点击右上角头像 → **"实名认证"**
2. 选择 **"企业认证"**
3. 上传材料：
   - 营业执照照片
   - 法人身份证正反面
   - 对公账户信息（可选，但推荐）
4. 填写企业信息
5. 提交审核（通常1-2小时通过）

---

## 第二步：开通函数计算服务（5分钟）

### 2.1 进入函数计算控制台
1. 登录阿里云后，搜索 **"函数计算"**
2. 或访问：[https://fc.console.aliyun.com](https://fc.console.aliyun.com)

### 2.2 开通服务
1. 首次进入需要点击 **"立即开通"**
2. 选择 **"按量付费"** 模式
3. 阅读协议，勾选同意
4. 点击 **"立即开通"**

### 2.3 选择地域
建议选择：**华东2（上海）**
原因：离您的目标用户近，访问速度快

---

## 第三步：创建AccessKey（5分钟）

### 3.1 进入访问控制
1. 阿里云控制台右上角，点击头像
2. 选择 **"AccessKey管理"**

### 3.2 创建AccessKey
1. 点击 **"创建AccessKey"**
2. 完成安全验证（手机验证码）
3. **重要**：立即保存 AccessKeyID 和 AccessKeySecret
   - AccessKeyID：类似 `LTAI5t***`
   - AccessKeySecret：类似 `9xK***`（只显示一次！）

---

## 第四步：安装部署工具（5分钟）

### 4.1 安装 Node.js（如果还没安装）
```bash
# macOS
brew install node

# 验证安装
node -v
npm -v
```

### 4.2 安装 Serverless Devs
```bash
npm install -g @serverless-devs/s
```

### 4.3 配置阿里云密钥
```bash
s config add

# 按提示输入：
# AccountID: 在阿里云控制台右上角头像处查看
# AccessKeyID: 上一步保存的
# AccessKeySecret: 上一步保存的
# 别名(自定义): default
```

---

## 第五步：部署函数到阿里云（30分钟）

### 5.1 回到项目目录
```bash
cd /Users/yugongtian/NPDF
```

### 5.2 创建 .env 文件（配置环境变量）
```bash
cat > .env << EOF
ALIPAY_APP_ID=您的支付宝AppID
ALIPAY_PRIVATE_KEY=您的支付宝私钥
ALIPAY_PUBLIC_KEY=您的支付宝公钥
SUPABASE_URL=您的Supabase地址
SUPABASE_SERVICE_ROLE_KEY=您的Supabase服务密钥
EOF
```

> **重要**：这些值从哪里获取？
> - ALIPAY_* : 支付宝开放平台应用详情页
> - SUPABASE_* : Supabase控制台 Settings → API

### 5.3 安装依赖
```bash
npm install
```

### 5.4 执行部署
```bash
s deploy

# 首次部署会询问是否创建服务，选择 Y
```

### 5.5 查看部署结果
部署成功后，会输出类似信息：
```
✔ Deploy completed
create-alipay-order: 
  url: https://1234567890.cn-shanghai.fc.aliyuncs.com/create-alipay-order
alipay-webhook:
  url: https://1234567890.cn-shanghai.fc.aliyuncs.com/alipay-webhook
```

**请复制这两个URL，稍后要用！**

---

## 第六步：配置前端使用阿里云API（2分钟）

### 6.1 编辑 aliyun-config.js
```bash
vi aliyun-config.js
```

### 6.2 取消注释并填入URL
```javascript
// 改为：
window.ALIYUN_API_URL = 'https://您的函数地址.cn-shanghai.fc.aliyuncs.com/create-alipay-order';
```

### 6.3 提交并推送
```bash
git add aliyun-config.js
git commit -m "chore: configure aliyun api endpoint"
git push
```

---

## 第七步：测试支付功能（10分钟）

### 7.1 等待Vercel部署
推送后，等待1-2分钟Vercel自动部署

### 7.2 访问网站测试
1. 打开 https://l-reader.com
2. 登录您的账号
3. 点击"支付宝支付"
4. **如果能跳转到支付宝 = 成功！**

### 7.3 如果出现CORS错误
在阿里云函数控制台：
1. 进入函数详情
2. 找到"触发器配置"
3. 添加响应头：
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: POST, OPTIONS`

---

## 第八步：申请ICP备案（提交后等待7-22天）

### 8.1 准备材料
- [x] 营业执照扫描件
- [x] 法人身份证正反面照片
- [x] 网站负责人照片（可以是法人）
- [x] 域名证书（从域名注册商处下载）
- [ ] 真实性核验单（阿里云系统生成）

### 8.2 进入备案系统
访问：[https://beian.aliyun.com](https://beian.aliyun.com)

### 8.3 填写备案信息
1. 选择 **"首次备案"**
2. 填写主体信息（营业执照信息）
3. 填写网站信息：
   - 网站名称：L-reader
   - 网站域名：l-reader.com
   - 服务类型：软件服务
4. 上传材料
5. 下载并填写核验单
6. 提交初审

### 8.4 等待审核
- 阿里云初审：1-2个工作日
- 管局审核：5-20个工作日
- 收到备案号短信：如"沪ICP备2024***号"

---

## 第九步：完成支付宝签约

备案通过后：
1. 登录支付宝开放平台
2. 进入应用 → "电脑网站支付"签约
3. 填写ICP备案号
4. 提交（1-3天审核）

---

## 故障排查

### 问题1：部署失败 "权限不足"
**解决**：检查AccessKey是否有FC权限，重新创建AccessKey

### 问题2：函数调用超时
**解决**：编辑 s.yaml，调整 timeout 参数

### 问题3：支付宝回调不生效
**解决**：检查SUPABASE_SERVICE_ROLE_KEY是否正确配置

---

**完成上述步骤后，请告诉我进展！**
