const AlipaySdk = require('alipay-sdk').default;
const { createClient } = require('@supabase/supabase-js');

// Initialize Alipay SDK
const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    gateway: 'https://openapi.alipay.com/gateway.do',
    camelcase: true
});

// Initialize Supabase Admin Client (Service Role Key required for backend updates)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if Supabase is configured
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration');
}

const supabase = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

module.exports = async (req, res) => {
    // Only accept POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
        return;
    }

    try {
        const params = req.body;
        console.log('Received Alipay Webhook:', JSON.stringify(params));

        // 1. Verify Signature
        // Alipay sends parameters as a standard form post, so req.body is already an object
        const isValid = alipaySdk.checkNotifySign(params);

        if (!isValid) {
            console.error('Alipay signature verification failed');
            res.status(400).send('fail');
            return;
        }

        // 2. Check Trade Status
        // We only care about success
        if (params.trade_status !== 'TRADE_SUCCESS' && params.trade_status !== 'TRADE_FINISHED') {
            console.log('Trade status is not success:', params.trade_status);
            res.send('success'); // Still return success to stop Alipay from retrying
            return;
        }

        // 3. Parse Passback Params
        let userId = null;
        let planType = 'monthly';

        if (params.passback_params) {
            try {
                const passback = JSON.parse(decodeURIComponent(params.passback_params));
                userId = passback.userId;
                planType = passback.planType;
            } catch (e) {
                console.error('Failed to parse passback_params:', e);
            }
        }

        if (!userId) {
            console.error('No userId found in passback_params');
            res.send('success');
            return;
        }

        // 4. Update Database
        if (supabase) {
            // Calculate end date
            const startDate = new Date();
            const endDate = new Date(startDate);

            if (planType === 'yearly') {
                endDate.setFullYear(endDate.getFullYear() + 1);
            } else {
                // Default to monthly
                endDate.setMonth(endDate.getMonth() + 1);
            }

            // Upsert subscription
            const { error } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: userId,
                    plan_type: planType,
                    status: 'active',
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    payment_id: params.trade_no, // Alipay transaction ID
                    amount: params.total_amount,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id' // Assuming one active subscription per user, or logic might need adjustment based on table schema
                });

            if (error) {
                console.error('Failed to update subscription in Supabase:', error);
                // If database update fails, we might want to return 'fail' to let Alipay retry
                // But be careful not to create infinite loops if the error is permanent
                res.status(500).send('fail');
                return;
            }

            console.log(`Successfully updated subscription for user ${userId} to ${planType}`);
        } else {
            console.error('Supabase client not initialized, cannot update database');
        }

        // 5. Return Success to Alipay
        res.send('success');

    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(500).send('fail');
    }
};
