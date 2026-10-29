export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { amount, order_id, username, type } = req.body;

        if (!amount || !order_id) {
            return res.status(400).json({ success: false, message: 'amount dan order_id wajib diisi' });
        }

        const apiKey = process.env.CASHI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: 'CASHI_API_KEY belum diset' });
        }

        // Tembak API Cashi
        const cashiResponse = await fetch('https://api.cashi.id/v1/transactions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                reference_id: order_id,        // Sesuaikan sama dokumentasi Cashi
                merchantOrderId: order_id,     // Jaga-jaga kalau Cashi minta ini
                customer_name: username,
                description: `Pembelian ${type === 'vip' ? 'VIP 30 Hari' : 'Booster Kuota'}`,
                
                // INI YANG PALING PENTING: URL webhook lu!
                callbackUrl: "https://alight-bulk.vercel.app/api/payment-webhook",
                webhook_url: "https://alight-bulk.vercel.app/api/payment-webhook"
            })
        });

        const data = await cashiResponse.json();

        if (!cashiResponse.ok) {
            return res.status(cashiResponse.status).json({ success: false, message: data.message || 'Gagal membuat order ke Cashi' });
        }

        // Kembalikan ke Frontend
        return res.status(200).json({
            success: true,
            qr_url: data.payment_url || data.qr_code_url || data.qr_string || data.data?.qr_string, 
            expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
        });

    } catch (error) {
        console.error('Create Order Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
