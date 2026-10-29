const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, order_id, username, type } = req.body;

    try {
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

        const targetUrl = `${baseUrl}/create-order`;
        
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey, 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount),
                order_id: order_id
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ success: false, message: data.message || data.error || 'Ditolak Cashi' });
        }

        // INI DIA KUNCINYA: Pakai data.qrUrl 
        const qrData = data.qrUrl; 
        
        if(!qrData) {
             return res.status(500).json({ success: false, message: 'QR Code tidak ditemukan di respon Cashi.' });
        }

        // Kirim ke Frontend
        return res.status(200).json({
            success: true,
            qr_url: qrData,
            expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error: ' + error.message });
    }
}
