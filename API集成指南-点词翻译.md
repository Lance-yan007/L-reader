# 🔌 点词翻译功能 - AI API集成指南

## 📋 概述

本指南将帮助您将真实的AI翻译API集成到NPDF Reader的点词翻译功能中。

---

## 🎯 集成位置

**文件**：`src/scripts/reader.js`  
**方法**：`callTranslationAPI(word)`  
**位置**：约第1303-1369行

---

## 🌟 推荐的AI翻译服务

### 1. OpenAI GPT API ⭐⭐⭐⭐⭐

**优点**：
- 翻译质量优秀
- 可自定义提示词
- 支持多种语言
- 可以提供音标和例句

**费用**：按Token计费，约$0.002/1K tokens

**集成代码**：

```javascript
async callTranslationAPI(word) {
    const API_KEY = 'YOUR_OPENAI_API_KEY'; // 替换为您的API密钥
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'system',
                    content: '你是一个专业的英语词典助手，擅长翻译英文单词并提供详细解释。'
                }, {
                    role: 'user',
                    content: `请翻译英文单词"${word}"，以HTML格式返回，包含：
                    1. 中文翻译
                    2. 国际音标
                    3. 2-3个例句（中英对照）
                    
                    格式要求：
                    <p><strong>翻译：</strong>中文含义</p>
                    <p><strong>音标：</strong>/音标/</p>
                    <strong>例句：</strong>
                    <p style="margin-left: 12px; color: #666;">• 英文例句</p>
                    <p style="margin-left: 12px; color: #999; font-size: 13px;">  中文翻译</p>`
                }],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;

    } catch (error) {
        console.error('OpenAI API调用失败:', error);
        throw error;
    }
}
```

---

### 2. Claude API (Anthropic) ⭐⭐⭐⭐⭐

**优点**：
- 翻译准确度高
- 上下文理解能力强
- 响应速度快

**费用**：按Token计费，约$0.003/1K tokens

**集成代码**：

```javascript
async callTranslationAPI(word) {
    const API_KEY = 'YOUR_ANTHROPIC_API_KEY'; // 替换为您的API密钥
    
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 500,
                messages: [{
                    role: 'user',
                    content: `请翻译英文单词"${word}"，提供：
                    1. 准确的中文翻译
                    2. 国际音标
                    3. 2-3个例句（附中文翻译）
                    
                    请使用HTML格式返回，格式如下：
                    <p><strong>翻译：</strong>中文</p>
                    <p><strong>音标：</strong>/音标/</p>
                    <strong>例句：</strong>
                    <p style="margin-left: 12px; color: #666; font-style: italic;">• 英文例句<br><span style="color: #999;">中文翻译</span></p>`
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        return data.content[0].text;

    } catch (error) {
        console.error('Claude API调用失败:', error);
        throw error;
    }
}
```

---

### 3. Google Translate API ⭐⭐⭐⭐

**优点**：
- 翻译速度快
- 支持语言多
- 价格便宜

**缺点**：
- 无法提供音标和详细例句

**费用**：$20/1M字符

**集成代码**：

```javascript
async callTranslationAPI(word) {
    const API_KEY = 'YOUR_GOOGLE_API_KEY'; // 替换为您的API密钥
    
    try {
        const response = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q: word,
                    source: 'en',
                    target: 'zh-CN',
                    format: 'text'
                })
            }
        );

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const translation = data.data.translations[0].translatedText;

        return `
            <p><strong>单词：</strong>${word}</p>
            <p><strong>翻译：</strong>${translation}</p>
            <p style="color: #999; font-size: 13px; margin-top: 12px;">
                💡 提示：Google Translate API只提供基础翻译，
                建议使用OpenAI或Claude获取更详细的信息。
            </p>
        `;

    } catch (error) {
        console.error('Google Translate API调用失败:', error);
        throw error;
    }
}
```

---

### 4. DeepL API ⭐⭐⭐⭐

**优点**：
- 翻译质量极高
- 特别擅长欧洲语言

**缺点**：
- 不支持音标和例句
- 免费版有限制

**费用**：免费版500K字符/月，Pro版$5.49/月起

**集成代码**：

```javascript
async callTranslationAPI(word) {
    const API_KEY = 'YOUR_DEEPL_API_KEY'; // 替换为您的API密钥
    
    try {
        const response = await fetch('https://api-free.deepl.com/v2/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                auth_key: API_KEY,
                text: word,
                source_lang: 'EN',
                target_lang: 'ZH'
            })
        });

        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        const data = await response.json();
        const translation = data.translations[0].text;

        return `
            <p><strong>单词：</strong>${word}</p>
            <p><strong>翻译：</strong>${translation}</p>
            <p style="color: #999; font-size: 13px; margin-top: 12px;">
                ⚡ 由DeepL提供翻译服务
            </p>
        `;

    } catch (error) {
        console.error('DeepL API调用失败:', error);
        throw error;
    }
}
```

---

## 🔒 API密钥安全管理

### ⚠️ 重要提示

**不要将API密钥直接写在前端代码中！**这会暴露您的密钥。

### 推荐方案：使用后端代理

**架构**：
```
前端 → 本地后端服务器 → AI API
```

#### 步骤1：创建后端服务（Node.js示例）

创建文件 `api-server.js`：

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // 从环境变量读取

app.post('/api/translate', async (req, res) => {
    const { word } = req.body;
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{
                    role: 'user',
                    content: `翻译单词: ${word}`
                }]
            })
        });
        
        const data = await response.json();
        res.json({ translation: data.choices[0].message.content });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('API代理服务器运行在 http://localhost:3000');
});
```

#### 步骤2：修改前端代码

```javascript
async callTranslationAPI(word) {
    try {
        const response = await fetch('http://localhost:3000/api/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ word })
        });

        if (!response.ok) {
            throw new Error('翻译请求失败');
        }

        const data = await response.json();
        return data.translation;

    } catch (error) {
        console.error('翻译失败:', error);
        throw error;
    }
}
```

#### 步骤3：启动后端服务

```bash
# 安装依赖
npm install express cors

# 设置环境变量
export OPENAI_API_KEY='your-api-key-here'

# 启动服务
node api-server.js
```

---

## 🎨 响应格式优化

### 标准HTML格式

```html
<p><strong>翻译：</strong>中文含义1；含义2</p>
<p><strong>音标：</strong>/ˈfəʊnətɪk/</p>
<p><strong>词性：</strong>n. 名词；v. 动词</p>
<strong>例句：</strong>
<p style="margin-left: 12px; color: #666; font-style: italic;">
    • This is an example sentence.
</p>
<p style="margin-left: 12px; color: #999; font-size: 13px;">
      这是一个例句。
</p>
```

### CSS样式已预设

在 `reader.css` 中已经为翻译结果设置了样式：

```css
.popup-translation {
    color: #2c3e50;
    line-height: 1.6;
    font-size: 15px;
}

.popup-translation p {
    margin: 8px 0;
}

.popup-translation strong {
    color: #4A90E2;
    display: block;
    margin-top: 12px;
    margin-bottom: 4px;
}
```

---

## 🚀 快速开始

### 方案A：使用OpenAI（推荐）

1. **获取API密钥**：访问 https://platform.openai.com/api-keys
2. **替换代码**：将上面的OpenAI集成代码复制到 `callTranslationAPI()` 方法
3. **设置密钥**：将 `YOUR_OPENAI_API_KEY` 替换为您的实际密钥
4. **测试**：启动应用，开启点词翻译，点击单词测试

### 方案B：使用本地词典数据库

如果不想依赖在线API，可以使用离线词典：

```javascript
async callTranslationAPI(word) {
    // 从本地JSON文件加载词典
    const dictionary = await this.loadLocalDictionary();
    
    const entry = dictionary[word.toLowerCase()];
    
    if (entry) {
        return `
            <p><strong>翻译：</strong>${entry.translation}</p>
            <p><strong>音标：</strong>${entry.phonetic}</p>
            ${entry.examples ? `<strong>例句：</strong>
            ${entry.examples.map(ex => `
                <p style="margin-left: 12px; color: #666; font-style: italic;">
                    • ${ex.en}<br>
                    <span style="color: #999; font-size: 13px;">${ex.zh}</span>
                </p>
            `).join('')}` : ''}
        `;
    } else {
        return `<p style="color: #999;">未找到单词"${word}"的翻译</p>`;
    }
}

async loadLocalDictionary() {
    // 加载本地词典文件（需要先准备dictionary.json）
    const response = await fetch('path/to/dictionary.json');
    return await response.json();
}
```

---

## 📊 性能优化建议

### 1. 实现翻译缓存

```javascript
constructor() {
    // ... 其他代码 ...
    this.translationCache = new Map(); // 翻译缓存
}

async translateWord(word) {
    // 检查缓存
    if (this.translationCache.has(word.toLowerCase())) {
        console.log('📦 使用缓存的翻译');
        const cached = this.translationCache.get(word.toLowerCase());
        
        popupLoading.style.display = 'none';
        popupTranslation.style.display = 'block';
        popupTranslation.innerHTML = cached;
        return;
    }
    
    // ... 原有的翻译逻辑 ...
    
    // 保存到缓存
    this.translationCache.set(word.toLowerCase(), translation);
}
```

### 2. 限制API调用频率

```javascript
constructor() {
    // ... 其他代码 ...
    this.lastTranslateTime = 0;
    this.translateCooldown = 500; // 500ms冷却时间
}

async handleWordClick(event) {
    // 检查冷却时间
    const now = Date.now();
    if (now - this.lastTranslateTime < this.translateCooldown) {
        console.log('⏱️ 翻译请求过于频繁，请稍候');
        return;
    }
    this.lastTranslateTime = now;
    
    // ... 原有的处理逻辑 ...
}
```

### 3. 批量预加载常用词

```javascript
async preloadCommonWords() {
    const commonWords = ['the', 'a', 'is', 'in', 'of', 'to', 'and', 'for'];
    
    console.log('📚 预加载常用词汇...');
    for (const word of commonWords) {
        try {
            const translation = await this.callTranslationAPI(word);
            this.translationCache.set(word, translation);
        } catch (error) {
            console.error(`预加载"${word}"失败:`, error);
        }
    }
    console.log('✅ 常用词汇预加载完成');
}
```

---

## 🎯 测试清单

### 基础功能测试

- [ ] 点击"点词翻译"按钮，按钮变蓝色
- [ ] 鼠标悬停单词，有淡蓝色高亮
- [ ] 点击单词，弹出翻译窗口
- [ ] 翻译结果正确显示
- [ ] 关闭按钮正常工作
- [ ] 再次点击"点词翻译"按钮，模式关闭

### API集成测试

- [ ] API密钥配置正确
- [ ] 网络请求成功
- [ ] 翻译结果格式正确
- [ ] 错误处理正常
- [ ] 加载动画显示正确

### 性能测试

- [ ] 翻译响应时间 < 2秒
- [ ] 缓存功能正常工作
- [ ] 连续点击不会崩溃
- [ ] 内存使用正常

---

## 📞 故障排除

### 问题1：API请求失败

**检查**：
1. API密钥是否正确
2. 网络连接是否正常
3. 查看Console错误信息

**解决**：
```javascript
// 添加详细的错误日志
catch (error) {
    console.error('完整错误信息:', error);
    console.error('错误名称:', error.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
}
```

### 问题2：CORS跨域错误

**原因**：浏览器安全策略限制

**解决**：使用后端代理服务器（见上文）

### 问题3：响应格式不对

**检查**：API返回的数据结构

**解决**：
```javascript
console.log('API原始响应:', JSON.stringify(data, null, 2));
```

---

**集成指南版本**：v1.0  
**更新日期**：2025年10月16日  
**状态**：✅ 完整可用

---

> **"选择合适的API，让翻译更智能！"**  
> — NPDF Reader API集成指南

