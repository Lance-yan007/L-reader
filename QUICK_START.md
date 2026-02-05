# 阿里云部署快速指南

## 第一步：访问宝塔面板（现在就做）

### 获取登录信息
1. 登录阿里云控制台：https://account.aliyun.com
2. 进入"轻量应用服务器"
3. 点击您的服务器实例
4. 查看"应用信息"获取：
   - 宝塔面板地址（通常是 http://47.98.144.154:8888/安全码）
   - 用户名
   - 密码

### 登录宝塔面板
复制地址到浏览器打开，输入用户名密码登录

---

## 第二步：安装Node.js环境（在宝塔面板操作）

1. 宝塔面板 → 软件商店
2. 搜索"Node版本管理器"→ 安装
3. 安装完成后，点击设置
4. 安装Node.js 18.x版本

---

## 第三步：安装Nginx（在宝塔面板操作）

1. 软件商店 → 搜索"Nginx"
2. 点击"安装"（选择极速安装）
3. 等待安装完成

---

## 第四步：安装PM2管理器（在宝塔面板操作）

1. 软件商店 → 搜索"PM2管理器"
2. 点击"安装"

---

## 第五步：上传代码（在宝塔面板终端操作）

**打开宝塔终端：**
宝塔面板顶部 → 点击"终端"图标

**执行以下命令：**
```bash
# 创建项目目录
mkdir -p /www/wwwroot/alipay-api
cd /www/wwwroot/alipay-api

# 从GitHub拉取代码
git clone https://github.com/Lance-yan007/L-reader.git temp

# 复制需要的文件
cp -r temp/api ./
cp temp/server.js ./
cp temp/package.json ./

# 删除临时文件
rm -rf temp

# 查看文件
ls -la
```

应该看到：api/ server.js package.json

---

## 第六步：配置环境变量

**在宝塔终端继续执行：**

```bash
cd /www/wwwroot/alipay-api

# 创建.env文件（需要填入您的实际密钥）
cat > .env << 'EOF'
ALIPAY_APP_ID=替换为您的AppID
ALIPAY_PRIVATE_KEY=替换为您的私钥
ALIPAY_PUBLIC_KEY=替换为支付宝公钥
SUPABASE_URL=替换为您的Supabase地址
SUPABASE_SERVICE_ROLE_KEY=替换为Service Key
PORT=3001
EOF

# 编辑.env文件填入真实密钥
vi .env
```

**vi编辑器使用方法：**
- 按 `i` 进入编辑模式
- 修改对应的值
- 按 `ESC` 退出编辑
- 输入 `:wq` 保存并退出

---

## 第七步：安装依赖

```bash
cd /www/wwwroot/alipay-api
npm install
```

等待安装完成（约1-2分钟）

---

## 第八步：启动服务（使用PM2）

**方式A：在宝塔PM2管理器（推荐）**
1. 宝塔面板 → PM2管理器
2. 点击"添加项目"
3. 填写：
   - 项目名称：alipay-api
   - 启动文件：/www/wwwroot/alipay-api/server.js
   - 项目路径：/www/wwwroot/alipay-api
4. 提交

**方式B：命令行**
```bash
pm2 start server.js --name alipay-api
pm2 save
pm2 status
```

应该看到：alipay-api | online

---

## 第九步：配置Nginx反向代理

1. 宝塔面板 → 网站 → 添加站点
2. 填写：
   - 域名：47.98.144.154
   - 根目录：/www/wwwroot/alipay-api
   - PHP版本：纯静态
3. 提交

4. 找到刚创建的站点 → 设置 → 反向代理
5. 添加反向代理：
   - 代理名称：alipay-api
   - 目标URL：http://127.0.0.1:3001
   - 发送域名：$host
6. 提交并保存

---

## 第十步：开放防火墙

**在阿里云控制台：**
1. 轻量应用服务器 → 防火墙
2. 添加规则：HTTP(80)
3. 确定

---

## 第十一步：测试

**在浏览器访问：**
```
http://47.98.144.154/health
```

应返回：
```json
{"status":"ok","service":"alipay-api"}
```

---

## 完成！

如果测试通过，说明服务器部署成功！

**下一步：**
更新前端配置文件 `aliyun-config.js` 中的API地址
