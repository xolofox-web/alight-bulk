// api/cashi/create-order.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const { amount, order_id, username, type } = req.body;

  if (!amount || !order_id || !username || !type) {
    return res.status(400).json({ message: 'Data tidak lengkap (amount, order_id, username, type)' });
  }

  try {
    // 1. SIMPAN KE DATABASE SEBELUM MEMBUAT QRIS
    const { error: dbError } = await supabase.from('transactions').insert([{
      order_id: order_id,
      username: username,
      amount: parseInt(amount),
      type: type, // 'kuota' atau 'vip'
      status: 'PENDING'
    }]);

    if (dbError) throw dbError;

    // 2. Buat QRIS ke Cashi
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

    return res.status(200).json({
      success: true,
      order_id: data.orderId,
      amount: data.amount,
      qr_url: data.qrUrl,
      checkout_url: data.checkout_url,
    });

  } catch (error) {
    console.error('Cashi Create Order Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
