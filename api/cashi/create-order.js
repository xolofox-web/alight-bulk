export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  const { amount, order_id, username, type } = req.body;
  const CASHI_API_KEY = process.env.CASHI_API_KEY; 
  if (!CASHI_API_KEY) return res.status(500).json({ success: false, message: 'CASHI_API_KEY belum di-set di Vercel' });

  try {
    const response = await fetch('https://cashi.id/api/create-order', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-API-Key': CASHI_API_KEY,
        'Authorization': `Bearer ${CASHI_API_KEY}` // Tambahan jaga-jaga kalau Cashi pakai Bearer
      },
      body: JSON.stringify({
        amount: amount,
        order_id: order_id,
        description: `Topup ${type} - ${username}`,
        callback_url: `https://alight-bulk.vercel.app/api/payment-webhook`
      })
    });
    
    const data = await response.json();
    
    // KIRIM BALIK ERROR ASLI DARI CASHI JIKA GAGAL
    if (!response.ok) {
        return res.status(response.status).json({ 
            success: false, 
            message: data.message || 'Gagal request ke Cashi.id', 
            raw: data 
        });
    }

    const responseData = data.data || data; 
    const qrUrl = responseData.qr_url || responseData.qr_string || responseData.payment_url || responseData.qr_code || responseData.qrString || responseData.qr;

    if (!qrUrl) {
        return res.status(200).json({ 
            success: false, 
            message: 'Cashi.id tidak mengirim field QR.', 
            raw: data 
        });
    }

    return res.status(200).json({ success: true, qr_url: qrUrl, raw: data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
