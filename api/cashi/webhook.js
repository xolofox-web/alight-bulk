// api/cashi/webhook.js
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const signature = req.headers['x-gateway-signature'];
  if (!signature) return res.status(401).json({ message: 'Missing signature' });

  // Verifikasi Signature Cashi
  const payload = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', process.env.CASHI_SECRET_KEY).update(payload).digest('hex');
  if (signature !== expected) return res.status(401).json({ message: 'Invalid signature' });

  const { event, data } = req.body;

  if (event === 'PAYMENT_SETTLED' && data.status === 'SETTLED') {
    const orderId = data.order_id;
    
    // Abaikan pesan test
    if (orderId.startsWith('TEST-')) return res.status(200).json({ message: 'Test OK' });

    try {
      // 1. Ambil data transaksi dari Database
      const { data: trx, error: trxErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (trxErr || !trx) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
      if (trx.status === 'SUCCESS') return res.status(200).json({ message: 'Sudah diproses' });

      // 2. Ubah status transaksi jadi SUCCESS
      await supabase.from('transactions').update({ status: 'SUCCESS' }).eq('order_id', orderId);

      // 3. Berikan Reward ke User
      if (trx.type === 'vip') {
        const expiredAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('users').update({ 
          tier: 'VIP', 
          limit_harian: 100,
          vip_expired_at: expiredAt 
        }).eq('username', trx.username);
      } else {
        // Asumsi paket 15.000 adalah +50 Kuota
        const { data: user } = await supabase.from('users').select('bonus_kuota').eq('username', trx.username).single();
        await supabase.from('users').update({ 
          bonus_kuota: (user.bonus_kuota || 0) + 50 
        }).eq('username', trx.username);
      }

      console.log(`SUKSES! Reward diberikan ke: ${trx.username}`);
      return res.status(200).json({ message: 'OK' });

    } catch (err) {
      console.error('Webhook Error:', err.message);
      return res.status(500).json({ message: err.message });
    }
  }

  return res.status(200).json({ message: 'Event ignored' });
}
