// api/cron-backup.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  // Pastikan hanya bisa diakses oleh Cron Vercel (opsional)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Ambil Config Telegram
    const { data: settings } = await supabase.from('settings').select('key, value').in('key', ['telegram_token', 'telegram_chat_id']);
    const cfg = {};
    (settings || []).forEach(s => { if (s.value && s.value.trim() !== '') cfg[s.key] = s.value; });
    const botToken = cfg.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = String(cfg.telegram_chat_id || '');

    if (!botToken || !adminChatId) return res.status(400).send('Config Telegram kosong');

    // 2. Ambil Data Users
    const { data: users } = await supabase.from('users').select('*');
    if (!users || users.length === 0) return res.status(200).send('No data');

    // 3. Buat CSV
    let csvContent = "Username,Email,Tier,Status,Limit Harian,Sisa Kuota,IP Address,Tgl Daftar\n";
    users.forEach(u => {
      const totalLimit = (u.tier === 'VIP' ? 100 : 30) + (u.bonus_kuota || 0);
      csvContent += `"${u.username}","${u.email || ''}","${u.tier || 'Free'}","${u.status || 'active'}","${totalLimit}","${u.kuota_terpakai || 0}","${u.ip_address || ''}","${new Date(u.created_at).toLocaleString('id-ID')}"\n`;
    });

    // 4. Kirim ke Telegram sebagai Dokumen
    const formData = new FormData();
    formData.append('chat_id', adminChatId);
    formData.append('caption', `📦 *Auto-Backup Harian*\nTotal Users: ${users.length}\nWaktu: ${new Date().toLocaleString('id-ID')}`);
    formData.append('parse_mode', 'Markdown');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    formData.append('document', blob, `backup_users_${new Date().toISOString().split('T')[0]}.csv`);

    await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    return res.status(200).json({ success: true, message: 'Backup sent to Telegram' });
  } catch (error) {
    console.error('Cron Error:', error);
    return res.status(500).json({ error: error.message });
  }
};