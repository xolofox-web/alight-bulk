export default async function handler(req, res) {
    // Setup CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // ========================================================
        // PERBAIKAN ERROR: Menggunakan new URL() bukan url.parse()
        // ========================================================
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host || 'localhost';
        const fullUrl = new URL(req.url, `${protocol}://${host}`);
        const orderId = fullUrl.searchParams.get('order_id');

        if (!orderId) {
            return res.status(400).json({ status: 'ERROR', message: 'order_id wajib disertakan' });
        }

        const apiKey = process.env.CASHI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ status: 'ERROR', message: 'CASHI_API_KEY belum diset di Vercel' });
        }

        // Cek status ke API Cashi
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

        // Kirim status ke frontend (index.html) agar QRIS diperbarui
        // Status Cashi biasanya: PENDING, SETTLED, EXPIRED
        return res.status(200).json({ 
            status: data.status || 'PENDING',
            raw: data
        });

    } catch (error) {
        console.error('Check Status Error:', error);
        return res.status(500).json({ status: 'ERROR', message: error.message });
    }
}
