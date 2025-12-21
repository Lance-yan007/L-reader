module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Gemini-API-Key');

    // 处理 OPTIONS 请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { body } = req;
    // 优先从请求头获取 Key (用户自定义)，其次从环境变量获取 (服务器配置)
    const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error('❌ Configuration Error: GEMINI_API_KEY is missing in environment variables.');
        res.status(500).json({
            error: 'Configuration Error',
            code: 'MISSING_API_KEY',
            details: 'Server is not configured with an API Key. Please contact the administrator.'
        });
        return;
    }
    const apiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

    try {
        console.log('Proxying request to Gemini API...');

        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API Error:', data);
            res.status(response.status).json(data);
            return;
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
