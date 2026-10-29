const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Koneksi ke Supabase (Pastikan ENV ini ada di Vercel)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const signature = req.headers['x-gateway-signature'];
  
  if (!signature) {
    return res.status(401).send('Missing signature');
  }

  // Ambil Secret Key dari ENV Vercel, atau pakai default 'YOUR_SECRET_KEY'
  const secret = process.env.GATEWAY_SECRET_KEY || 'YOUR_SECRET_KEY';
  
  // Di Vercel, req.body udah berupa object. Kita ubah ke string buat di-hash.
  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (signature !== expected) {
    console.warn('Signature tidak cocok!');
    return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;
  const payloadData = data || req.body; // Antisipasi kalau strukturnya beda

  if (event === 'PAYMENT_SETTLED' || event === 'payment.success') {
    const orderId = payloadData.order_id || payloadData.merchantOrderId;
    
    // Kalau ini cuma tes dari dashboard Cashi
    if (orderId?.startsWith('TEST-')) {
      return res.status(200).send('Test OK');
    }

    if (payloadData.status === 'SETTLED' || payloadData.status === 'SUCCESS') {
      try {
        // 1. Cari transaksinya di database
        const { data: trxData, error: getTrxError } = await supabase
          .from('transactions')
          .select('username, plan_type, amount')
          .eq('order_id', orderId)
          .single();

        if (getTrxError || !trxData) {
          console.warn('Transaksi tidak ditemukan:', orderId);
          return res.status(200).send('Transaksi tidak ditemukan di DB');
        }

        // 2. Ubah status order jadi lunas (success)
        await supabase
          .from('transactions')
          .update({ status: 'success' })
          .eq('order_id', orderId);

        // 3. Kirim hadiah (VIP / Kuota) ke User
        if (trxData.plan_type === 'vip') {
          const expiredAt = new Date();
          expiredAt.setDate(expiredAt.getDate() + 30);
          
          await supabase.from('users').update({
            tier: 'VIP',
            limit_harian: 5000,
            vip_expired_at: expiredAt.toISOString()
          }).eq('username', trxData.username);
          
        } else {
          const { data: userData } = await supabase
            .from('users')
            .select('bonus_kuota')
            .eq('username', trxData.username)
            .single();
            
          await supabase.from('users').update({
            bonus_kuota: (userData?.bonus_kuota || 0) + 1000
          }).eq('username', trxData.username);
        }

        return res.status(200).send('OK');
      } catch (err) {
        console.error('Webhook DB Error:', err);
        return res.status(500).send('Internal Server Error');
      }
    }
    
    return res.status(200).send('Status not SETTLED');
  } else {
    return res.status(200).send('Event ignored');
  }
}
