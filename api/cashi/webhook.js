// api/cashi/webhook.js
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Buka akses CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gateway-signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'active', message: 'Webhook Ready' });
  }

  if (req.method === 'POST') {
    try {
      // CEK 1: Apakah Secret Key ada di Vercel?
      if (!process.env.CASHI_SECRET_KEY) {
        console.error("ERROR FATAL: CASHI_SECRET_KEY tidak ada di Environment Variables Vercel!");
        // Tetap balas 200 OK agar Cashi mau menyimpan Webhook-nya
        return res.status(200).json({ message: 'Webhook saved, but Secret Key is missing in server.' });
      }

      // CEK 2: Apakah ini request dari Cashi?
      const signature = req.headers['x-gateway-signature'];
      
      // Jika tidak ada signature, anggap ini Test Ping dari Dashboard Cashi
      if (!signature) {
        return res.status(200).json({ message: 'Test Ping OK.' });
      }

      // Verifikasi Signature
      const payload = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', process.env.CASHI_SECRET_KEY).update(payload).digest('hex');
      
      if (signature !== expected) {
        return res.status(401).json({ message: 'Invalid signature' });
      }

      // PROSES DATA PEMBAYARAN
      const { event, data } = req.body;
      if (event === 'PAYMENT_SETTLED' && data.status === 'SETTLED') {
        const orderId = data.order_id;
        
        const { data: trx, error: trxErr } = await supabase.from('transactions').select('*').eq('order_id', orderId).single();
        if (trxErr || !trx) return res.status(200).json({ message: 'Transaksi tidak ditemukan (abaikan)' });
        if (trx.status === 'SUCCESS') return res.status(200).json({ message: 'Sudah diproses' });

        // Ubah status
        await supabase.from('transactions').update({ status: 'SUCCESS' }).eq('order_id', orderId);

        // Beri Hadiah
        if (trx.type === 'vip') {
          const expiredAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabase.from('users').update({ tier: 'VIP', limit_harian: 5000, vip_expired_at: expiredAt }).eq('username', trx.username);
        } else {
          const { data: user } = await supabase.from('users').select('bonus_kuota').eq('username', trx.username).single();
          await supabase.from('users').update({ bonus_kuota: (user.bonus_kuota || 0) + 1000 }).eq('username', trx.username);
        }
        return res.status(200).json({ message: 'OK' });
      }
      return res.status(200).json({ message: 'Event ignored' });

    } catch (error) {
      // JIKA ADA ERROR LAIN, LOG DI VERCEL TAPI JANGAN CRASH
      console.error("Webhook Error:", error.message);
      return res.status(200).json({ message: 'Internal error handled' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
