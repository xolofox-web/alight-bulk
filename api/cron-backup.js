// api/cron-backup.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // Pastikan hanya bisa diakses oleh Vercel Cron
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: settings } = await supabase.from('settings').select('key, value').in('key', ['telegram_token', 'telegram_chat_id']);
    const cfg = {};
    (settings || []).forEach(s => { cfg[s.key] = s.value; });
    
    const botToken = cfg.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = cfg.telegram_chat_id;
    if (!botToken || !adminChatId) return res.status(200).json({ ok: false });

    // Ambil data Users
    const { data: users } = await supabase.from('users').select('username, email, tier, limit_harian, ip_address, status');
    
    let csvContent = "Username,Email,Tier,Limit,IP,Status\n";
    users.forEach(u => {
      csvContent += `"${u.username}","${u.email || ''}","${u.tier}","${u.limit_harian}","${u.ip_address || ''}","${u.status}"\n`;
    });

    const today = new Date().toISOString().split('T')[0];
    const fileName = `backup_zyxell_${today}.csv`;
    
    // Kirim dokumen CSV via Telegram
    const formData = new FormData();
    formData.append('chat_id', adminChatId);
    formData.append('document', new Blob([csvContent], { type: 'text/csv' }), fileName);
    formData.append('caption', `📦 *BACKUP OTOMATIS HARIAN*\n\nTotal Users: ${users.length}\nTanggal: ${today}`);

    await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};