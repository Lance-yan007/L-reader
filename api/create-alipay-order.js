
module.exports = async (req, res) => {
    // 1. Check Method
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
        return;
    }

    try {
        // 0. Load Modules Safely
        // Ensure dependencies are loaded inside try-catch to report installation errors
        const AlipaySdk = require('alipay-sdk').default;
        const AlipayFormData = require('alipay-sdk/lib/form').default;

        if (!AlipaySdk || !AlipayFormData) {
            throw new Error('Failed to load alipay-sdk module');
        }

        // 2. Check Environment Variables
        const appId = process.env.ALIPAY_APP_ID;
        const privateKey = process.env.ALIPAY_PRIVATE_KEY;
        const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY;

        if (!appId || !privateKey) {
            console.error('Missing Alipay Configuration');
            return res.status(500).json({
                statusCode: 500,
                message: 'Server Error: Missing Alipay Configuration (APP_ID or PRIVATE_KEY)'
            });
        }

        // Helper to ensure private key is in valid PEM format
        const formatPrivateKey = (key) => {
            if (!key) return '';

            // 1. Remove all spaces and newlines to get pure base64
            let cleanKey = key.replace(/[\s\r\n]/g, '');

            // 2. Remove headers/footers if they were included
            cleanKey = cleanKey.replace(/-----BEGIN.*?KEY-----/g, '').replace(/-----END.*?KEY-----/g, '');

            // 3. Wrap in RSA PRIVATE KEY header (Common for Alipay/OpenSSL)
            return `-----BEGIN RSA PRIVATE KEY-----\n${cleanKey}\n-----END RSA PRIVATE KEY-----`;
        };

        const formattedKey = formatPrivateKey(privateKey);
        // Debug info (do not log full key)
        console.log('Key length:', formattedKey.length);

        // 3. Initialize SDK
        const alipaySdk = new AlipaySdk({
            appId: appId,
            privateKey: formattedKey,
            alipayPublicKey: alipayPublicKey,
            gateway: 'https://openapi.alipay.com/gateway.do',
            timeout: 5000,
            camelcase: true
        });

        const { amount, subject, body, userId, planType } = req.body;

        const formData = new AlipayFormData();
        formData.setMethod('get');

        // Use page pay for PC
        formData.addField('bizContent', {
            outTradeNo: Date.now().toString(),
            productCode: 'FAST_INSTANT_TRADE_PAY',
            totalAmount: amount,
            subject: subject || 'L-reader Pro',
            body: body || 'Lifetime Subscription',
            passback_params: encodeURIComponent(JSON.stringify({
                userId: userId,
                planType: planType || 'monthly'
            }))
        });

        // Use request origin for return URL
        const origin = req.headers.origin || 'https://l-reader.com';
        formData.addField('returnUrl', `${origin}/app.html?status=success`);

        // Optional: Notify URL
        // formData.addField('notifyUrl', `${origin}/api/alipay-webhook`);

        const result = await alipaySdk.exec(
            'alipay.trade.page.pay',
            {},
            { formData: formData }
        );

        // Result is a URL
        res.status(200).json({ url: result });

    } catch (err) {
        console.error('Alipay Error:', err);
        res.status(500).json({
            statusCode: 500,
            message: `Alipay Error (v3-rsa-fix): ${err.message}`
        });
    }
};
