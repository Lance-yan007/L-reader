const fetch = require('node-fetch');

module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // 处理 OPTIONS 请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { body } = req;
    const apiKey = 'AIzaSyCqcvZmcr1-BbAthoDVIvotcjM2gANMklY'; // 暂时硬编码，生产环境应使用环境变量
    const apiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';

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
