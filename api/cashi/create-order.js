export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  const { amount, order_id, username, type } = req.body;
  const CASHI_API_KEY = process.env.CASHI_API_KEY; 
  if (!CASHI_API_KEY) return res.status(500).json({ success: false, message: 'CASHI_API_KEY belum di-set di Vercel' });

  try {
    const response = await fetch('https://cashi.id/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CASHI_API_KEY },
      body: JSON.stringify({
        amount: amount,
        order_id: order_id,
        description: `Topup ${type} - ${username}`,
        callback_url: `https://alight-bulk.vercel.app/api/payment-webhook`
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Gagal request ke Cashier.id');

    const responseData = data.data || data; 
    const qrUrl = responseData.qr_url || responseData.qr_string || responseData.payment_url || responseData.qr_code || responseData.qrString;

    return res.status(200).json({ success: true, qr_url: qrUrl, raw: data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
