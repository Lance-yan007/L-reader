const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;

// Environment helpers
const appId = process.env.ALIPAY_APP_ID;
const privateKey = process.env.ALIPAY_PRIVATE_KEY;
const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY;

const alipaySdk = new AlipaySdk({
    appId: appId,
    privateKey: privateKey,
    alipayPublicKey: alipayPublicKey,
    gateway: 'https://openapi.alipay.com/gateway.do', // Use sandbox gateway if testing
    timeout: 5000,
    camelcase: true
});

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
        return;
    }

    try {
        const { amount, subject, body } = req.body;

        const formData = new AlipayFormData();
        formData.setMethod('get');

        // Use page pay for PC, wap pay for mobile
        // Here we default to page pay for desktop web
        formData.addField('bizContent', {
            outTradeNo: Date.now().toString(),
            productCode: 'FAST_INSTANT_TRADE_PAY',
            totalAmount: amount,
            subject: subject || 'L-reader Pro',
            body: body || 'Lifetime Subscription',
            passback_params: encodeURIComponent(JSON.stringify({
                userId: req.body.userId,
                planType: req.body.planType || 'monthly'
            }))
        });

        formData.addField('returnUrl', `${req.headers.origin}/app.html?status=success`);
        formData.addField('notifyUrl', `${req.headers.origin}/api/alipay-webhook`); // Need to implement webhook

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
            message: err.message
        });
    }
};
