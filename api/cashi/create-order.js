export default async function handler(req, res) {
    // Setup CORS
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
            return res.status(500).json({ success: false, message: 'CASHI_API_KEY belum diset di Vercel Settings' });
        }

        // =====================================================================
        // UBAH URL DI BAWAH INI
        // Domain "api.cashi.id" kemarin error ENOTFOUND (Domain tidak ditemukan).
        // Silakan cek dokumentasi Cashi.id lu, URL yang benar apa?
        // Contoh gantinya bisa: 'https://api.cashipay.id' atau 'https://api.cashi.co.id'
        // =====================================================================
        const CASHI_BASE_URL = 'https://cashi.id'; // <--- GANTI URL INI
        const targetUrl = `${CASHI_BASE_URL}/v1/transactions`; // Sesuaikan endpointnya juga jika beda

        console.log(`[1] Mencoba request QRIS ke: ${targetUrl}`);
        
        const cashiResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount),
                reference_id: order_id,        
                merchantOrderId: order_id,     
                customer_name: username,
                customerEmail: "user@zyxell.com", 
                description: `Pembelian ${type === 'vip' ? 'VIP 30 Hari' : 'Booster Kuota'}`,
                callbackUrl: "https://alight-bulk.vercel.app/api/payment-webhook"
            })
        });

        console.log(`[2] Respon Cashi HTTP Status: ${cashiResponse.status}`);
        
        const rawText = await cashiResponse.text();
        console.log(`[3] Respon Body Cashi:`, rawText);

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            return res.status(500).json({ 
                success: false, 
                message: 'Respon Cashi bukan JSON (Cek URL API mungkin salah). Respon: ' + rawText.substring(0, 50) 
            });
        }

        if (!cashiResponse.ok) {
            console.error("ERROR: Cashi Menolak Request.", data);
            return res.status(cashiResponse.status).json({ 
                success: false, 
                message: data.message || data.error || 'Ditolak Cashi' 
            });
        }

        // Ambil URL QR
        const qrUrl = data.payment_url || data.qr_code_url || data.qr_string || data.data?.qr_string || data.data?.payment_url;

        if (!qrUrl) {
            return res.status(500).json({ success: false, message: 'Cashi tidak mengirimkan data QR.' });
        }

        console.log(`[4] SUKSES! QR Ditemukan`);

        return res.status(200).json({
            success: true,
            qr_url: qrUrl, 
            expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
        });

    } catch (error) {
        console.error('FATAL ERROR (fetch failed):', error);
        
        // Menangkap error asli (ENOTFOUND, ECONNREFUSED, dll)
        const errorCause = error.cause ? ` (${error.cause.code || error.cause.message})` : '';
        
        return res.status(500).json({ 
            success: false, 
            message: 'Server Error: ' + error.message + errorCause 
        });
    }
}
