export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, order_id, username, type } = req.body;
    const apiKey = process.env.CASHI_API_KEY;
    const baseUrl = process.env.CASHI_BASE_URL;

    if (!apiKey || !baseUrl) {
        return res.status(500).json({ success: false, message: 'CASHI_API_KEY atau CASHI_BASE_URL belum diset di Vercel' });
    }

    // Gabungin URL-nya (Pastiin CASHI_BASE_URL di Vercel itu link API, bukan link web)
    const TARGET_URL = `${baseUrl}/v1/transactions`; 

    try {
        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                // 🔥 INI YANG GUA UBAH: Pakai x-api-key sesuai info dari lu 🔥
                'x-api-key': apiKey, 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount),
                reference_id: order_id,
                merchantOrderId: order_id,
                customer_name: username,
                customerEmail: "user@zyxell.com", 
                description: `Pembelian ${type === 'vip' ? 'VIP 30 Hari' : 'Booster Kuota'}`
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ success: false, message: data.message || 'Ditolak Cashi' });
        }

        const qrUrl = data.payment_url || data.qr_code_url || data.qr_string || data.data?.qr_string || data.data?.payment_url;
        
        return res.status(200).json({
            success: true,
            qr_url: qrUrl,
            expires_at: data.expires_at
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
}
