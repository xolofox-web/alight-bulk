// api/cashi/check-status.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ message: 'Order ID required' });

  try {
    // 1. Cek status ke Cashi
    const response = await fetch(`https://cashi.id/api/check-status/${order_id}`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.CASHI_API_KEY },
    });
    const data = await response.json();

    // 2. Jika Cashi bilang SETTLED, lakukan Fallback (jika webhook gagal)
    if (data.status === 'SETTLED') {
      const { data: trx } = await supabase.from('transactions').select('*').eq('order_id', order_id).single();
      
      if (trx && trx.status === 'PENDING') {
        await supabase.from('transactions').update({ status: 'SUCCESS' }).eq('order_id', order_id);
        
        if (trx.type === 'vip') {
          const expiredAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabase.from('users').update({ tier: 'VIP', limit_harian: 5000, vip_expired_at: expiredAt }).eq('username', trx.username);
        } else {
          const { data: user } = await supabase.from('users').select('bonus_kuota').eq('username', trx.username).single();
          await supabase.from('users').update({ bonus_kuota: (user.bonus_kuota || 0) + 1000 }).eq('username', trx.username);
        }
      }
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
