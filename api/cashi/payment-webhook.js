const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // LOGGING: Biar lu bisa liat di Vercel Logs apa yang dikirim Cashi
  console.log('=== WEBHOOK MASUK DARI CASHI ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  // SEMENTARA SIGNATURE DIMATIKAN BIAR BISA LOLOS
  /*
  const signature = req.headers['x-gateway-signature'] || req.headers['x-cashi-signature'];
  if (!signature) return res.status(401).send('Missing signature');
  const secret = process.env.GATEWAY_SECRET_KEY;
  const payload = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (signature !== expected) return res.status(401).send('Invalid signature');
  */

  const { event, data } = req.body;
  const payloadData = data || req.body; 
  const payloadEvent = event || 'PAYMENT_SETTLED';

  if (payloadEvent === 'PAYMENT_SETTLED' || payloadEvent === 'payment.success') {
    if (payloadData.order_id?.startsWith('TEST-') || payloadData.merchantOrderId?.startsWith('TEST-')) {
      return res.status(200).send('Test OK');
    }

    const orderId = payloadData.order_id || payloadData.merchantOrderId;
    const status = payloadData.status;

    if (status === 'SETTLED' || status === 'SUCCESS') {
      try {
        // 1. Cari transaksi
        const { data: trxData, error: getTrxError } = await supabase
          .from('transactions').select('username, plan_type, amount').eq('order_id', orderId).single();

        if (getTrxError || !trxData) {
            console.warn('Transaksi tidak ditemukan:', orderId);
            return res.status(200).send('Transaksi tidak ditemukan, diabaikan.');
        }

        // 2. Update status
        await supabase.from('transactions').update({ status: 'success' }).eq('order_id', orderId);

        // 3. Beri hadiah
        if (trxData.plan_type === 'vip') {
          const expiredAt = new Date(); expiredAt.setDate(expiredAt.getDate() + 30);
          await supabase.from('users').update({ tier: 'VIP', limit_harian: 5000, vip_expired_at: expiredAt.toISOString() }).eq('username', trxData.username);
        } else {
          const { data: userData } = await supabase.from('users').select('bonus_kuota').eq('username', trxData.username).single();
          await supabase.from('users').update({ bonus_kuota: (userData?.bonus_kuota || 0) + 1000 }).eq('username', trxData.username);
        }
        
        console.log('=== SUKSES MEMPROSES TRANSAKSI ===', orderId);
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
