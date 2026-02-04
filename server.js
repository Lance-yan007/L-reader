require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(cors({
    origin: ['https://l-reader.com', 'https://www.l-reader.com', 'http://localhost:8000'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 导入 Vercel 风格的 API 处理函数
const createAlipayOrder = require('./api/create-alipay-order');
const alipayWebhook = require('./api/alipay-webhook');

// API 路由
app.post('/create-alipay-order', (req, res) => {
    createAlipayOrder(req, res);
});

app.post('/alipay-webhook', (req, res) => {
    alipayWebhook(req, res);
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'alipay-api',
        timestamp: new Date().toISOString()
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// 启动服务
app.listen(PORT, () => {
    console.log(`✓ Alipay API server running on port ${PORT}`);
    console.log(`✓ Health check: http://localhost:${PORT}/health`);
});
