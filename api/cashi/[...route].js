// api/cashi/[...route].js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
    // Setup CORS agar aman dari error browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Ambil URL path untuk menentukan fungsi mana yang dipanggil
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const fullUrl = new URL(req.url, `${protocol}://${host}`);
    const pathname = fullUrl.pathname;

    // =========================================================
    // RUTE 1: CREATE ORDER (Dari file create-order.js lama)
    // =========================================================
    if (pathname.includes('create-order')) {
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

            const qrData = data.qrUrl; 
            
            if(!qrData) {
                 return res.status(500).json({ success: false, message: 'QR Code tidak ditemukan di respon Cashi.' });
            }

            return res.status(200).json({
                success: true,
                qr_url: qrData,
                expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
            });

        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error: ' + error.message });
        }
    }

    // =========================================================
    // RUTE 2: CHECK STATUS (Dari file check-status.js lama)
    // =========================================================
    if (pathname.includes('check-status')) {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

        try {
            const orderId = fullUrl.searchParams.get('order_id');

            if (!orderId) {
                return res.status(400).json({ status: 'ERROR', message: 'order_id wajib disertakan' });
            }

            const apiKey = process.env.CASHI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ status: 'ERROR', message: 'CASHI_API_KEY belum diset di Vercel' });
            }

            const cashiResponse = await fetch(`https://api.cashi.id/v1/transactions/${orderId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await cashiResponse.json();

            if (!cashiResponse.ok) {
                return res.status(cashiResponse.status).json(data);
            }

            return res.status(200).json({ 
                status: data.status || 'PENDING',
                raw: data
            });

        } catch (error) {
            console.error('Check Status Error:', error);
            return res.status(500).json({ status: 'ERROR', message: error.message });
        }
    }

    // =========================================================
    // RUTE 3: CANCEL ORDER (Dari file cancel-order.js lama)
    // =========================================================
    if (pathname.includes('cancel-order')) {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Transaksi berhasil dibatalkan di sistem lokal.' 
        });
    }

    // =========================================================
    // JIKA RUTE TIDAK DITEMUKAN
    // =========================================================
    return res.status(404).json({ success: false, message: 'API Route Not Found' });
};