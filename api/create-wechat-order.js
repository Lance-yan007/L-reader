const WxPay = require('wechatpay-node-v3');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const { amount, subject, userId, planType } = req.body;

        // 1. Check Configuration
        const mchId = process.env.WECHAT_MCH_ID;
        const appId = process.env.WECHAT_APP_ID;
        const apiV3Key = process.env.WECHAT_API_V3_KEY;
        const privateKeyRaw = process.env.WECHAT_PRIVATE_KEY;
        const serialNo = process.env.WECHAT_SERIAL_NO;

        if (!mchId || !appId || !apiV3Key || !privateKeyRaw || !serialNo) {
            throw new Error('Missing WeChat Pay configuration (MCH_ID, APP_ID, API_V3_KEY, PRIVATE_KEY, or SERIAL_NO)');
        }

        // 2. Initialize SDK
        const pay = new WxPay({
            appid: appId,
            mchid: mchId,
            publicKey: '', // Not used for V3 signing, but required by some older versions/wrappers
            privateKey: privateKeyRaw.replace(/\\n/g, '\n'), // Handle newline in env
            key: apiV3Key,
            serial_no: serialNo
        });

        // 3. Generate Order ID
        const outTradeNo = `WX_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        // 4. Create Native Pay (QR Code)
        // Note: WeChat amount is in cents
        const amountCents = Math.round(parseFloat(amount) * 100);

        const params = {
            description: subject || 'L-reader Pro',
            out_trade_no: outTradeNo,
            notify_url: 'http://api.l-reader.com:3001/wechat-webhook',
            amount: {
                total: amountCents,
                currency: 'CNY'
            },
            attach: JSON.stringify({ userId, planType })
        };

        const result = await pay.transactions_native(params);

        if (result.code_url) {
            res.status(200).json({
                url: result.code_url,
                outTradeNo: outTradeNo
            });
        } else {
            throw new Error(result.message || 'Failed to get WeChat Pay QR code');
        }

    } catch (err) {
        console.error('WeChat Pay Error:', err);
        res.status(500).json({
            statusCode: 500,
            message: `WeChat Pay Error: ${err.message}`
        });
    }
};
