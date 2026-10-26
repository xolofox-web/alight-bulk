// api/cashi/create-order.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { amount, order_id } = req.body;

  if (!amount || !order_id) {
    return res.status(400).json({ message: 'Amount dan order_id wajib diisi' });
  }

  try {
    const response = await fetch('https://cashi.id/api/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CASHI_API_KEY,
      },
      body: JSON.stringify({
        amount: parseInt(amount),
        order_id: order_id,
        kode_channel: 'QRIS_CUSTOM',
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Gagal membuat order di Cashi');
    }

    // Kembalikan data QR code ke frontend
    return res.status(200).json({
      success: true,
      order_id: data.orderId,
      amount: data.amount,
      qr_url: data.qrUrl,
      checkout_url: data.checkout_url,
      expires_at: data.expires_at,
    });

  } catch (error) {
    console.error('Cashi Create Order Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
