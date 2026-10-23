// api/cron/daily-maintenance.js
const { createClient } = require('@supabase/supabase-js');

// PENTING: Gunakan SERVICE_ROLE_KEY agar bisa update data tanpa terblokir RLS
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

module.exports = async function handler(req, res) {
  // Pastikan hanya Vercel Cron yang bisa akses (metode GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = new Date();
    let report = {
      reset_quota: 0,
      deleted_logs: 0,
      deleted_ips: 0
    };

    // 1. RESET KUOTA HARIAN
    // Cari user yang waktu resetnya sudah lewat atau sama dengan sekarang
    const { data: usersToReset, error: errReset } = await supabase
      .from('users')
      .select('username')
      .lte('reset_kuota_at', now.toISOString());

    if (!errReset && usersToReset && usersToReset.length > 0) {
      const { error: errUpdate } = await supabase
        .from('users')
        .update({ kuota_terpakai: 0, reset_kuota_at: null })
        .lte('reset_kuota_at', now.toISOString());
      
      if (!errUpdate) report.reset_quota = usersToReset.length;
    }

    // 2. HAPUS LOG LOGIN LAMA (Lebih dari 30 Hari)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: countLogs, error: errLogs } = await supabase
      .from('login_logs')
      .delete({ count: 'exact' })
      .lt('logged_at', thirtyDaysAgo.toISOString());
    
    if (!errLogs) report.deleted_logs = countLogs || 0;

    // 3. HAPUS AKTIVITAS IP LAMA (Lebih dari 1 Hari / 24 Jam)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { count: countIps, error: errIps } = await supabase
      .from('ip_activities')
      .delete({ count: 'exact' })
      .lt('created_at', oneDayAgo.toISOString());
      
    if (!errIps) report.deleted_ips = countIps || 0;

    console.log('[CRON SUCCESS]', report);
    return res.status(200).json({ 
      success: true, 
      message: 'Daily maintenance completed', 
      report 
    });

  } catch (err) {
    console.error('[CRON ERROR]', err);
    return res.status(500).json({ error: 'Internal Server Error', detail: err.message });
  }
};
