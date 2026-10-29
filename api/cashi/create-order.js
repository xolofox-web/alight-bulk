const { createClient } = require('@supabase/supabase-js');

// Koneksi ke Supabase (pakai kunci rahasia Vercel lu)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, order_id, username, type } = req.body;

    try {
        // 🔥 AMBIL KEY DAN URL LANGSUNG DARI SUPABASE 🔥
        const { data: settings, error: dbError } = await supabase
            .from('settings')
            .select('key, value')
            .in('key', ['cashi_api_key', 'cashi_base_url']);

        if (dbError) throw new Error('Gagal konek ke database Supabase');

        // Pisahin datanya
        let apiKey = '';
        let baseUrl = '';

        settings.forEach(item => {
            if (item.key === 'cashi_api_key') apiKey = item.value;
            if (item.key === 'cashi_base_url') baseUrl = item.value;
        });

        if (!apiKey || !baseUrl) {
            return res.status(500).json({ success: false, message: 'API Key atau Base URL belum diisi di tabel settings Supabase' });
        }

        console.log("Mencoba request ke:", `${baseUrl}/v1/transactions`);

        // Tembak API Cashi
        const response = await fetch(`${baseUrl}/v1/transactions`, {
            method: 'POST',
            headers: {
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
        
        if(!qrUrl) {
             return res.status(500).json({ success: false, message: 'Cashi sukses tapi tidak ngasih URL QR' });
        }

        return res.status(200).json({
            success: true,
            qr_url: qrUrl
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
}
