// api/cashi/cancel-order.js
export default async function handler(req, res) {
    // Hanya izinkan metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { order_id } = req.body;
    if (!order_id) {
        return res.status(400).json({ message: 'order_id wajib diisi' });
    }

    try {
        // Ambil API Key dari Environment Variables Vercel
        const API_KEY = process.env.CASHI_API_KEY;
        const API_URL = process.env.CASHI_API_URL || 'https://api.cashi.id'; // Sesuaikan dengan base URL Cashi

        if (!API_KEY) {
            throw new Error('CASHI_API_KEY belum diatur di Vercel Environment Variables');
        }

        // Panggil endpoint pembatalan Cashi
        const response = await fetch(`${API_URL}/v1/orders/${order_id}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                // 'X-API-Key': API_KEY // Gunakan header sesuai dokumentasi Cashi
            },
            body: JSON.stringify({ order_id: order_id })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Cashi Cancel API Error:', data);
            return res.status(response.status).json({ 
                success: false, 
                message: data.message || 'Gagal membatalkan transaksi di Cashi' 
            });
        }

        return res.status(200).json({ success: true, data: data });

    } catch (error) {
        console.error('Error Cancel Order:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}