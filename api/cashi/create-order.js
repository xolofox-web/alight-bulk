export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, order_id, username } = req.body;
    const apiKey = process.env.CASHI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ success: false, message: 'CASHI_API_KEY KOSONG DI VERCEL!' });
    }

    try {
        const response = await fetch('https://api.cashi.id/v1/transactions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseInt(amount),
                reference_id: order_id,
                customer_name: username
            })
        });

        // Baca respon teks mentah dari Cashi
        const textData = await response.text();
        
        // Coba ubah ke JSON
        let jsonData;
        try {
            jsonData = JSON.parse(textData);
        } catch (e) {
            return res.status(500).json({ 
                success: false, 
                message: 'Cashi membalas bukan JSON (Mungkin URL salah). Respon: ' + textData.substring(0, 50) 
            });
        }

        // Kalau Cashi nolak
        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                message: 'Cashi Error: ' + (jsonData.message || JSON.stringify(jsonData)) 
            });
        }

        // Kalau sukses, kembalikan apa adanya
        return res.status(200).json({ 
            success: true, 
            raw: jsonData // Kirim semua data ke frontend
        });

    } catch (error) {
        // KALAU MASIH "fetch failed" DI SINI, BERARTI VERCEL LU BENER-BENER NGGAK BISA KONEK KE API.CASHI.ID
        return res.status(500).json({ 
            success: false, 
            message: 'Vercel gagal konek ke Cashi. Cek URL API atau koneksi Vercel. Detail: ' + error.message 
        });
    }
}
