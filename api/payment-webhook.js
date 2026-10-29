const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Koneksi ke Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1. Ambil Signature
  const signature = req.headers['x-gateway-signature'] || req.headers['x-cashi-signature'];
  
  if (!signature) {
    return res.status(401).send('Missing signature');
  }

  // 2. Ambil Secret Key
  const secret = process.env.GATEWAY_SECRET_KEY || 'YOUR_SECRET_KEY';
  
  // 3. Siapkan Payload
  // Vercel otomatis mengubah body jadi object. Kita ubah balik ke string.
  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  
  // 4. Buat Hash
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // 5. Cocokkan Signature
  if (signature !== expected) {
    console.warn('Signature tidak cocok!');
    return res.status(401).send('Invalid signature');
  }

  // 6. Proses Data
  const { event, data } = req.body;
  const payloadData = data || req.body;

  if (event === 'PAYMENT_SETTLED' || event === 'payment.success') {
    const orderId = payloadData.order_id || payloadData.merchantOrderId;
    
    // Untuk testing dari dashboard Cashi
    if (orderId?.startsWith('TEST-')) {
      return res.status(200).send('Test OK');
    }

    if (payloadData.status === 'SETTLED' || payloadData.status === 'SUCCESS') {
      try {
        const { data: trxData, error: getTrxError } = await supabase
          .from('transactions')
          .select('username, plan_type, amount')
          .eq('order_id', orderId)
          .single();

        if (getTrxError || !trxData) {
          console.warn('Transaksi tidak ditemukan:', orderId);
          return res.status(200).send('Transaksi tidak ditemukan di DB');
        }

        // Update status di tabel transaksi jadi success
        await supabase
          .from('transactions')
          .update({ status: 'success' })
          .eq('order_id', orderId);

        // Beri hadiah VIP / Kuota
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
  }
  
  return res.status(200).send('Event ignored');
}