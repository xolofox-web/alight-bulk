const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // FIX: Cek berbagai kemungkinan header signature
  const signature = req.headers['x-gateway-signature'] || req.headers['x-cashi-signature'] || req.headers['x-callback-signature'];
  
  if (!signature) {
      console.warn('Webhook masuk tanpa signature');
      // Kadang untuk TEST, Cashi gak ngirim signature
      if (req.body && req.body.order_id && req.body.order_id.startsWith('TEST-')) {
          return res.status(200).send('Test OK (No Signature)');
      }
      return res.status(401).send('Missing signature');
  }

  const secret = process.env.GATEWAY_SECRET_KEY || 'YOUR_SECRET_KEY';
  // FIX: Vercel udah nge-parse body, jadi kita stringify ulang. 
  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (signature !== expected) {
      console.warn('Signature tidak cocok. Expected:', expected, 'Got:', signature);
      return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;

  // FIX: Kadang Cashi gak ngirim 'event', langsung data transaksinya
  const payloadData = data || req.body; 
  const payloadEvent = event || 'PAYMENT_SETTLED';

  if (payloadEvent === 'PAYMENT_SETTLED' || payloadEvent === 'payment.success') {
    if (payloadData.order_id?.startsWith('TEST-')) {
      return res.status(200).send('Test OK');
    }

    if (payloadData.status === 'SETTLED' || payloadData.status === 'SUCCESS') {
      try {
        // Cari transaksi
        const { data: trxData, error: getTrxError } = await supabase
          .from('transactions').select('username, plan_type, amount').eq('order_id', payloadData.order_id).single();

        if (getTrxError || !trxData) {
            console.warn('Transaksi tidak ditemukan:', payloadData.order_id);
            return res.status(200).send('Transaksi tidak ditemukan, diabaikan.');
        }

        // Update jadi sukses
        await supabase.from('transactions').update({ status: 'success' }).eq('order_id', payloadData.order_id);

        // Beri VIP atau Kuota
        if (trxData.plan_type === 'vip') {
          const expiredAt = new Date(); expiredAt.setDate(expiredAt.getDate() + 30);
          await supabase.from('users').update({ tier: 'VIP', limit_harian: 5000, vip_expired_at: expiredAt.toISOString() }).eq('username', trxData.username);
        } else {
          const { data: userData } = await supabase.from('users').select('bonus_kuota').eq('username', trxData.username).single();
          await supabase.from('users').update({ bonus_kuota: (userData?.bonus_kuota || 0) + 1000 }).eq('username', trxData.username);
        }
        res.status(200).send('OK');
      } catch (err) {
        console.error('Webhook DB Error:', err);
        res.status(500).send('Internal Server Error');
      }
    } else {
      res.status(200).send('Status not SETTLED');
    }
  } else {
    res.status(200).send('Event ignored');
  }
}
