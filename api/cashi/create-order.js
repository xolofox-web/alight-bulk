const { createClient } = require('@supabase/supabase-js');

// Koneksi ke Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, order_id, username, type } = req.body;

    try {
        // 1. Ambil API Key dan Base URL dari Supabase
        const { data: settings, error: dbError } = await supabase
            .from('settings')
            .select('key, value')
            .in('key', ['cashi_api_key', 'cashi_base_url']);

        if (dbError) throw new Error('Gagal konek ke database Supabase');

        let apiKey = '';
        let baseUrl = '';

        settings.forEach(item => {
            if (item.key === 'cashi_api_key') apiKey = item.value;
            if (item.key === 'cashi_base_url') baseUrl = item.value;
        });

        if (!apiKey || !baseUrl) {
            return res.status(500).json({ success: false, message: 'API Key atau Base URL belum diisi di tabel settings Supabase' });
        }

        // 2. Tembak API Cashi SESUAI CONTOH CURL LU
        // Base URL: https://cashi.id/api
        // Endpoint: /create-order
        const targetUrl = `${baseUrl}/create-order`;
        
        console.log("Mencoba request ke:", targetUrl);

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey, // Sesuai contoh curl
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount),
                order_id: order_id
                // Kita buang customerEmail dll biar sama persis kayak curl lu
            })
        });

        const data = await response.json();

        // Kalau Cashi nolak
        if (!response.ok) {
            return res.status(response.status).json({ success: false, message: data.message || data.error || 'Ditolak Cashi' });
        }

        // 3. Ambil URL QR (Sesuaikan dengan response Cashi, biasanya di payment_url atau qr_string)
        const qrUrl = data.payment_url || data.qr_code_url || data.qr_string || data.data?.qr_string || data.data?.payment_url;
        
        if(!qrUrl) {
             return res.status(500).json({ success: false, message: 'Cashi sukses tapi tidak mengirimkan URL QR.' });
        }

        return res.status(200).json({
            success: true,
            qr_url: qrUrl,
            expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
}
