const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;

module.exports = async (req, res) => {
    // 1. Check Method
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
        return;
    }

    try {
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

        // 3. Initialize SDK (Lazy initialization to prevent cold start crashes)
        const alipaySdk = new AlipaySdk({
            appId: appId,
            privateKey: privateKey,
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
            message: err.message || 'Alipay SDK Execution Error'
        });
    }
};
