// api/cashi/webhook.js
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const signature = req.headers['x-gateway-signature'];
  if (!signature) {
    return res.status(401).json({ message: 'Missing signature' });
  }

  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', process.env.CASHI_SECRET_KEY)
    .update(payload)
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  const { event, data } = req.body;

  if (event === 'PAYMENT_SETTLED') {
    if (data.order_id.startsWith('TEST-')) {
      return res.status(200).json({ message: 'Test OK' });
    }

    if (data.status === 'SETTLED') {
      // Update status pembayaran di database Anda
      // Contoh: Update tabel 'transactions' atau 'users'
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('order_id', data.order_id);

      if (error) {
        console.error('Supabase Update Error:', error);
        return res.status(500).json({ message: 'Database error' });
      }

      console.log(`Pembayaran lunas untuk order: ${data.order_id}`);
    }

    return res.status(200).json({ message: 'OK' });
  }

  return res.status(200).json({ message: 'Event ignored' });
}