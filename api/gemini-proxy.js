export default async function handler(req, res) {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { contents } = req.body;

        if (!contents) {
            res.status(400).json({ error: 'Missing contents in request body' });
            return;
        }

        const apiKey = 'AIzaSyCqcvZmcr1-BbAthoDVIvotcjM2gANMklY';
        const apiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';

        console.log('Proxying request to Gemini API...');

        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API error:', data);
            res.status(response.status).json(data);
            return;
        }

        console.log('Successfully proxied request');
        res.status(200).json(data);
    } catch (error) {
        console.error('API proxy error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}
