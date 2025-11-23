module.exports = async (req, res) => {
    // ⚠️ DEBUG MODE: Using Base64 encoded key to bypass Vercel Env issues
    // This is a temporary fix to get payment working immediately.
    const ENCODED_KEY = 'c2tfdGVzdF81MVNXZ0RyUFZFS0xYYTlpU1lTQmpLcW8yR3JBR0lJczU0VXpHT3E5UU90SXZBNGNrWHdVYnQ5Z3AxM2JWSWJQazNrbkh1ZW9RZVUwNXVIYXRES09iSnlvRTAwb0ZPWmt1Y0Q=';
    const STRIPE_KEY = Buffer.from(ENCODED_KEY, 'base64').toString('utf-8');

    const stripe = require('stripe')(STRIPE_KEY);

    if (req.method === 'POST') {
        try {
            const { priceId, userId, userEmail } = req.body;

            // 创建 Stripe Checkout Session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card', 'alipay', 'wechat_pay'], // 支持银行卡、支付宝、微信
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                mode: 'payment', // 一次性支付模式 (Lifetime Deal)
                success_url: `${req.headers.origin}/app.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${req.headers.origin}/index.html#pricing`,
                customer_email: userEmail, // 预填用户邮箱
                metadata: {
                    userId: userId, // 将用户ID传给 Stripe，以便 Webhook 回调时更新数据库
                },
                allow_promotion_codes: true, // 允许使用优惠码
            });

            res.status(200).json({ sessionId: session.id, url: session.url });
        } catch (err) {
            console.error('Stripe Error:', err);
            // Return detailed error to frontend for debugging
            res.status(500).json({
                statusCode: 500,
                message: err.message,
                type: err.type,
                code: err.code,
                param: err.param
            });
        }
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
    }
};
