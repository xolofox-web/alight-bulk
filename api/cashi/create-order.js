export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { amount, order_id, username, type } = req.body;
        const apiKey = process.env.CASHI_API_KEY;

        if (!apiKey) return res.status(500).json({ success: false, message: 'CASHI_API_KEY kosong' });

        // LOG: Biar lu tau kalau fungsi ini kepanggil
        console.log("Meminta QRIS ke Cashi untuk order:", order_id);

        const cashiResponse = await fetch('https://api.cashi.id/v1/transactions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                merchantOrderId: order_id, // <-- Biasanya ini yang bener, bukan reference_id
                customerEmail: "user@zyxell.com", // Cashi kadang wajibin email
                description: `Pembelian ${type === 'vip' ? 'VIP 30 Hari' : 'Booster Kuota'}`,
                callbackUrl: "https://alight-bulk.vercel.app/api/payment-webhook" // Sesuaikan domain lu
            })
        });

        const data = await cashiResponse.json();
        console.log("Respon Cashi:", data); // Cek log Vercel kalau masih gagal

        if (!cashiResponse.ok) {
            return res.status(cashiResponse.status).json({ success: false, message: data.message || 'Ditolak Cashi' });
        }

        return res.status(200).json({
            success: true,
            qr_url: data.payment_url || data.qr_code_url || data.qr_string || data.data?.qr_string, 
            expires_at: data.expires_at
        });

    } catch (error) {
        console.error('Create Order Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
