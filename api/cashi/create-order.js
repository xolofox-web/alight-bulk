export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { amount, order_id, username, type } = req.body;
  
  // Ambil API Key dari Environment Variables Vercel
  const CASHI_API_KEY = process.env.CASHI_API_KEY; 

  if (!CASHI_API_KEY) {
    return res.status(500).json({ success: false, message: 'CASHI_API_KEY belum di-set di Vercel' });
  }

  try {
    // Tembak API Cashier.id (Pastikan URL endpoint-nya sesuai dokumentasi Cashier lu)
    const response = await fetch('https://cashi.id/api/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CASHI_API_KEY // Atau 'Authorization': `Bearer ${CASHI_API_KEY}` sesuai docs Cashier
      },
      body: JSON.stringify({
        amount: amount,
        order_id: order_id,
        description: `Topup ${type} - ${username}`,
        callback_url: `https://domain-vercel-lu.vercel.app/api/payment-webhook` // Ganti pake domain lu
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Gagal request ke Cashier.id');
    }

    // Kirim balik QR asli dari Cashier ke frontend
    return res.status(200).json({ 
      success: true, 
      qr_url: data.qr_url || data.data?.qr_url || data.qr_string, 
      expires_at: data.expires_at || new Date(Date.now() + 15 * 60000).toISOString()
    });

  } catch (error) {
    console.error('Create Order Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
