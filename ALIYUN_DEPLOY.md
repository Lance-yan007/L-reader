# 阿里云函数计算部署指南

## 前提条件

1. **安装 Serverless Devs 工具**
```bash
npm install -g @serverless-devs/s
```

2. **配置阿里云密钥**
```bash
s config add

# 按提示输入:
# AccountID: 在阿里云控制台右上角头像处查看
# AccessKeyID: 创建访问密钥获得
# AccessKeySecret: 创建访问密钥获得
```

## 部署步骤

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
创建 `.env` 文件（已添加到 .gitignore）:
```bash
ALIPAY_APP_ID=your_app_id
ALIPAY_PRIVATE_KEY=your_private_key
ALIPAY_PUBLIC_KEY=your_public_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### 3. 部署到阿里云
```bash
s deploy
```

### 4. 查看函数信息
```bash
s info
```

会输出类似:
```
https://xxxxx.cn-shanghai.fc.aliyuncs.com/create-alipay-order
https://xxxxx.cn-shanghai.fc.aliyuncs.com/alipay-webhook
```

### 5. 测试函数
```bash
curl -X POST https://xxxxx.cn-shanghai.fc.aliyuncs.com/create-alipay-order \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.01, "subject": "Test", "userId": "test-user"}'
```

## 绑定自定义域名

1. 在阿里云控制台购买域名（如 `l-reader.cn`）
2. 添加 CNAME 记录指向函数地址
3. 在 `s.yaml` 中配置 customDomains

## 常见问题

### Q: 部署失败提示权限不足
A: 检查 AccessKey 是否有 FC 权限

### Q: 函数调用超时
A: 调整 timeout 参数（最大 600秒）

### Q: 环境变量未生效
A: 确保 `.env` 文件在项目根目录，且已执行 `s deploy`

## 成本估算

- 调用次数: 100万次/月免费
- 执行时长: 400,000 GB-秒/月免费
- 预计费用: ¥0-20/月（低流量场景）
