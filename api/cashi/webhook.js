// api/cashi/webhook.js
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 1. IZINKAN CORS (Penting untuk Dashboard Cashi)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gateway-signature');

  // 2. TANGANI PREFLIGHT OPTIONS (Sering ditembak browser Cashi)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. TANGANI GET (Untuk Tes Validasi di Dashboard Cashi)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'active', 
      message: 'Webhook Zyxell Bulk siap menerima notifikasi pembayaran.' 
    });
  }

  // 4. TANGANI POST (Data Asli dari Server Cashi)
  if (req.method === 'POST') {
    const signature = req.headers['x-gateway-signature'];
    if (!signature) return res.status(401).json({ message: 'Missing signature' });

    const payload = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', process.env.CASHI_SECRET_KEY).update(payload).digest('hex');
    
    if (signature !== expected) return res.status(401).json({ message: 'Invalid signature' });

    const { event, data } = req.body;

    if (event === 'PAYMENT_SETTLED' && data.status === 'SETTLED') {
      const orderId = data.order_id;
      if (orderId.startsWith('TEST-')) return res.status(200).json({ message: 'Test OK' });

      try {
        const { data: trx, error: trxErr } = await supabase.from('transactions').select('*').eq('order_id', orderId).single();
        if (trxErr || !trx) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
        if (trx.status === 'SUCCESS') return res.status(200).json({ message: 'Sudah diproses' });

        await supabase.from('transactions').update({ status: 'SUCCESS' }).eq('order_id', orderId);

        if (trx.type === 'vip') {
          const expiredAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabase.from('users').update({ tier: 'VIP', limit_harian: 100, vip_expired_at: expiredAt }).eq('username', trx.username);
        } else {
          const { data: user } = await supabase.from('users').select('bonus_kuota').eq('username', trx.username).single();
          await supabase.from('users').update({ bonus_kuota: (user.bonus_kuota || 0) + 50 }).eq('username', trx.username);
        }

        console.log(`SUKSES! Reward diberikan ke: ${trx.username}`);
        return res.status(200).json({ message: 'OK' });
      } catch (err) {
        return res.status(500).json({ message: err.message });
      }
    }
    return res.status(200).json({ message: 'Event ignored' });
  }

  // Jika metode lain (PUT/DELETE), baru tolak
  return res.status(405).json({ message: 'Method not allowed' });
}