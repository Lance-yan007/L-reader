# L-reader

智能英文阅读器 - 支持 PDF 阅读、划词翻译、生词本和 AI 助手

## 功能特性

- 📖 PDF 阅读和标注
- 🔤 划词翻译
- 📚 生词本管理
- 🤖 AI 阅读助手
- ☁️ 云端数据同步

## 在线访问

部署后的网址：[待更新]

## 本地开发

```bash
# 启动本地服务器
python3 -m http.server 8081

# 访问
http://localhost:8081/app.html
```

## 技术栈

- 前端：原生 JavaScript + HTML + CSS
- PDF 渲染：PDF.js
- 后端服务：Supabase
- 部署：Vercel (自动部署)

## 环境配置

本项目使用 Google Gemini API 提供 AI 功能。

### Vercel 部署配置

1. 在 Vercel 项目设置中找到 **Environment Variables**。
2. 添加变量：
   - Key: `GEMINI_API_KEY`
   - Value: `您的 Google Gemini API Key`
3. **重要**：添加变量后，必须**重新部署 (Redeploy)** 才能生效。

### 本地开发配置

1. 复制 `.env.example` 为 `.env`
2. 在 `.env` 中填入您的 API Key

## 许可证

MIT
