// api/cron.js
// Vercel Serverless Function — Auto Reset Kuota, Expire VIP, Clean Logs
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // Keamanan: Pastikan hanya Vercel Cron yang bisa akses
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CRON] Memulai pembersihan harian...');
    
    // 1. Reset Kuota Harian User (kuota_terpakai = 0)
    const { error: err1 } = await supabase
      .from('users')
      .update({ kuota_terpakai: 0, reset_kuota_at: null })
      .neq('kuota_terpakai', 0); // Hanya update yang terpakai > 0
    if (err1) console.error('[CRON] Error reset kuota:', err1.message);
    else console.log('[CRON] Sukses reset kuota harian semua user.');

    // 2. Expire VIP yang sudah melewati tanggal
    const now = new Date().toISOString();
    const { error: err2 } = await supabase
      .from('users')
      .update({ tier: 'Free', limit_harian: 30, vip_expired_at: null })
      .eq('tier', 'VIP')
      .lt('vip_expired_at', now);
    if (err2) console.error('[CRON] Error expire VIP:', err2.message);
    else console.log('[CRON] Sukses menurunkan VIP yang expired.');

    // 3. Hapus Log Login yang lebih dari 30 hari
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: err3 } = await supabase
      .from('login_logs')
      .delete()
      .lt('logged_at', thirtyDaysAgo);
    if (err3) console.error('[CRON] Error hapus log login:', err3.message);

    // 4. Hapus Log Admin yang lebih dari 30 hari
    const { error: err4 } = await supabase
      .from('admin_logs')
      .delete()
      .lt('created_at', thirtyDaysAgo);
    if (err4) console.error('[CRON] Error hapus log admin:', err4.message);

    return res.status(200).json({ ok: true, message: 'Cron job berhasil dijalankan.' });
  } catch (err) {
    console.error('[CRON] Error fatal:', err);
    return res.status(500).json({ error: err.message });
  }
};