export default async function handler(req, res) {
    // Setup CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, order_id, username, type } = req.body;
    const apiKey = process.env.CASHI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ success: false, message: 'CASHI_API_KEY kosong di Vercel' });
    }

    try {
        // =====================================================================
        // LU CUMAN PERLU GANTI URL DI BAWAH INI
        // Cek dashboard Cashi lu, URL API-nya apa?
        // Pilihan yang mungkin:
        // - https://api.cashipay.id/v1/transactions
        // - https://api.cashi.id/v1/transactions (Kemarin ini ENOTFOUND/mati)
        // - https://api.cashin.id/v1/transactions
        // =====================================================================
        const TARGET_URL = 'https://cashi.id/create-product'; // <--- GANTI URL INI

        console.log(`Mencoba request ke: ${TARGET_URL}`);

        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
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

        // Kalau Cashi nolak, kasih tau errornya
        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                message: data.message || data.error || 'Ditolak Cashi' 
            });
        }

        // --- INI BAGIAN YANG KAMU BILANG "TINGGAL JALAN" ---
        // Kita ambil URL QR-nya langsung tanpa ribet ngecek "ada apa nggak"
        // Cashi biasanya ngasih di payment_url atau qr_code_url
        const qrUrl = data.payment_url || data.qr_code_url || data.qr_string || data.data?.qr_string;

        if (!qrUrl) {
            return res.status(500).json({ success: false, message: 'Cashi tidak ngirim URL QR' });
        }

        // Kirim balik ke Frontend
        return res.status(200).json({
            success: true,
            qr_url: qrUrl,
            expires_at: data.expires_at
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Gagal konek ke Cashi: ' + error.message 
        });
    }
}
