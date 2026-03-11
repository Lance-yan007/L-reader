
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

        // 直接传原始密钥，让 SDK 自己处理格式化
        // keyType: 'PKCS8' 因为密钥是 PKCS#8 编码（以 MIIEvQIBADA 开头）
        const cleanKey = privateKey.replace(/[\s\r\n"']/g, '');

        const gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';

        // 3. Initialize SDK
        const alipaySdk = new AlipaySdk({
            appId: appId,
            privateKey: cleanKey,
            alipayPublicKey: alipayPublicKey,
            keyType: 'PKCS8',
            gateway: gateway,
            timeout: 5000,
            camelcase: true
        });

        const { amount, subject, body, userId, planType } = req.body;

        const formData = new AlipayFormData();
        formData.setMethod('get');

        // Generate unique order ID
        const outTradeNo = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Validate amount against hardcoded prices
        const validPrices = [39.9, 49.9, 99.9, 199.9]; // lifetime, monthly, yearly
        if (!validPrices.includes(parseFloat(amount))) {
            throw new Error('Invalid payment amount');
        }

        // Use page pay for PC
        formData.addField('bizContent', {
            outTradeNo: outTradeNo,
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
        formData.addField('returnUrl', `${origin}/payment-result.html?status=success`);

        // Enable webhook for automatic subscription updates
        // Use the Aliyun subdomain for the notify URL
        const notifyOrigin = 'http://api.l-reader.com:3001';
        formData.addField('notifyUrl', `${notifyOrigin}/alipay-webhook`);

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
            message: `Alipay Error: ${err.message}`
        });
    }
};
