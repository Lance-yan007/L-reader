const WxPay = require('wechatpay-node-v3');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const { headers, body } = req;

        // 1. Initialize Pay for verification
        const pay = new WxPay({
            appid: process.env.WECHAT_APP_ID,
            mchid: process.env.WECHAT_MCH_ID,
            privateKey: process.env.WECHAT_PRIVATE_KEY.replace(/\\n/g, '\n'),
            key: process.env.WECHAT_API_V3_KEY,
            serial_no: process.env.WECHAT_SERIAL_NO
        });

        // 2. Verify and Decrypt Response
        // Note: wechatpay-node-v3 handles decryption
        const result = await pay.verifySign(headers, body);

        if (!result) {
            console.error('WeChat signature verification failed');
            return res.status(401).json({ code: 'FAIL', message: 'Signature verification failed' });
        }

        const data = body.resource ? pay.decipher(body.resource) : body;

        if (data.trade_state === 'SUCCESS') {
            const { userId, planType } = JSON.parse(data.attach);
            const outTradeNo = data.out_trade_no;
            const transactionId = data.transaction_id;
            const amountCents = data.amount.total;

            // Update Database
            const startDate = new Date();
            const endDate = new Date(startDate);
            if (planType === 'yearly') {
                endDate.setFullYear(endDate.getFullYear() + 1);
            } else {
                endDate.setMonth(endDate.getMonth() + 1);
            }

            const { error } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: userId,
                    plan_type: planType,
                    status: 'active',
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    payment_id: transactionId,
                    amount: amountCents / 100,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('Supabase update failed:', error);
                return res.status(500).json({ code: 'FAIL', message: 'Database update failed' });
            }

            console.log(`✓ WeChat Payment Success for user ${userId}`);
        }

        res.status(200).json({ code: 'SUCCESS', message: 'OK' });

    } catch (err) {
        console.error('WeChat Webhook Error:', err);
        res.status(500).json({ code: 'FAIL', message: err.message });
    }
};
