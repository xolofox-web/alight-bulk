// api/telegram-webhook.js
// Vercel Serverless Function — Handler Bot Telegram Zyxell (CommonJS)
// Commands: /close, /open, /status, /ctvoucher, /listvoucher, /delvoucher, /addlimit, /rdlimit, /userinfo, /resetlimit, /ban, /unban, /setvip, /setfree, /topup, /cekvoucher, /stats, /help

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const update = req.body || {};

    // =========================================================
    // FITUR WEB PANEL (Notifikasi, Test Bot, Backup)
    // Membedakan request dari Web jika 'message' berupa String
    // =========================================================
    if (update.message && typeof update.message === 'string') {
      const { data: settings } = await supabase.from('settings').select('key, value').in('key', ['telegram_token', 'telegram_chat_id']);
      const cfg = {};
      (settings || []).forEach(s => { if (s.value && s.value.trim() !== '') cfg[s.key] = s.value; });
      
      const adminChatId = String(cfg.telegram_chat_id || '');
      const botToken = cfg.telegram_token || process.env.TELEGRAM_BOT_TOKEN;

      if (botToken && adminChatId) {
        // Kirim pesan dari web ke admin
        await sendMsg(botToken, adminChatId, update.message);
        return res.status(200).json({ ok: true, source: 'web' });
      }
      return res.status(400).json({ ok: false, error: 'Token/ID tidak ditemukan' });
    }

    // =========================================================
    // TELEGRAM WEBHOOK (Bawaan)
    // =========================================================
    const message = update.message;
    if (!message || !message.text) return res.status(200).json({ ok: true });

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const senderName = message.from?.username || message.from?.first_name || 'Admin';

    const { data: settings } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['telegram_token', 'telegram_chat_id']);

    const cfg = {};
    (settings || []).forEach(s => { 
      if (s.value && s.value.trim() !== '') {
        cfg[s.key] = s.value; 
      }
    });
    
    const adminChatId = String(cfg.telegram_chat_id || '');
    const botToken = cfg.telegram_token || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) return res.status(200).json({ ok: true });

    if (!adminChatId || chatId !== adminChatId) {
      await sendMsg(botToken, chatId, '⛔ *Akses Ditolak*\nAnda bukan admin Zyxell Bulk.');
      return res.status(200).json({ ok: true });
    }

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase().split('@')[0];

    switch (command) {
      case '/start':
      case '/help':
      case '/allmenu':
        await sendMsg(botToken, chatId, helpText());
        break;
      case '/close':
        await handleCloseWeb(botToken, chatId, parts, senderName);
        break;
      case '/open':
        await handleOpenWeb(botToken, chatId, senderName);
        break;
      case '/status':
        await handleWebStatus(botToken, chatId);
        break;
      case '/ctvoucher':
        await handleCreateVoucher(botToken, chatId, parts, senderName);
        break;
      case '/listvoucher':
        await handleListVouchers(botToken, chatId);
        break;
      case '/delvoucher':
        await handleDeleteVoucher(botToken, chatId, parts, senderName);
        break;
      case '/addlimit':
        await handleLimitChange(botToken, chatId, parts, senderName, 'add');
        break;
      case '/rdlimit':
      case '/rclimit': // Alias
        await handleLimitChange(botToken, chatId, parts, senderName, 'reduce');
        break;
      // --- FITUR MANAJEMEN USER BARU ---
      case '/userinfo':
        await handleUserInfo(botToken, chatId, parts);
        break;
      case '/resetlimit':
        await handleResetLimit(botToken, chatId, parts, senderName);
        break;
      case '/ban':
        await handleBanUser(botToken, chatId, parts, senderName, true);
        break;
      case '/unban':
        await handleBanUser(botToken, chatId, parts, senderName, false);
        break;
      case '/setvip':
        await handleSetVip(botToken, chatId, parts, senderName);
        break;
      case '/setfree':
        await handleSetTier(botToken, chatId, parts, senderName, 'Free');
        break;
      case '/topup':
        await handleTopup(botToken, chatId, parts, senderName);
        break;
      case '/cekvoucher':
        await handleCekVoucher(botToken, chatId, parts);
        break;
      // ---------------------------------
      case '/stats':
        await handleStats(botToken, chatId);
        break;
      default:
        await sendMsg(botToken, chatId, '❓ Command ' + command + ' tidak dikenal.\n\nKetik /allmenu untuk melihat daftar command.');
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[telegram-webhook] Error:', err);
    return res.status(200).json({ ok: true });
  }
};

/* ============ FITUR BARU: /topup ============ */
async function handleTopup(botToken, chatId, parts, senderName) {
  if (parts.length < 3) return sendMsg(botToken, chatId, '❌ Format: `/topup <username> <jumlah>`');
  
  const targetUser = parts[1];
  const amount = parseInt(parts[2]);
  
  if (isNaN(amount) || amount <= 0) return sendMsg(botToken, chatId, '❌ Jumlah harus angka positif.');

  const { data: user, error: errFetch } = await supabase.from('users').select('saldo, bonus_kuota').eq('username', targetUser).single();
  if (errFetch || !user) return sendMsg(botToken, chatId, `❌ User \`${targetUser}\` tidak ditemukan.`);

  let newSaldo = (user.saldo || 0) + amount;
  let newBonus = (user.bonus_kuota || 0) + amount;

  const { error: errUpdate } = await supabase.from('users').update({ saldo: newSaldo, bonus_kuota: newBonus }).eq('username', targetUser);
  if (errUpdate) return sendMsg(botToken, chatId, `❌ Gagal topup: ${errUpdate.message}`);

  try { await supabase.from('admin_logs').insert([{ admin_username: 'Telegram:' + senderName, action: `Topup ${amount} ke ${targetUser}` }]); } catch (e) {}

  await sendMsg(botToken, chatId, `✅ Berhasil menambahkan *${amount} Saldo/Kuota* ke user \`${targetUser}\`.\nTotal Saldo: *${newSaldo}*`);
}

/* ============ FITUR BARU: /cekvoucher ============ */
async function handleCekVoucher(botToken, chatId, parts) {
  if (parts.length < 2) return sendMsg(botToken, chatId, '❌ Format: `/cekvoucher <kode>`');
  const code = parts[1].toUpperCase();

  const { data: redemptions, error } = await supabase.from('voucher_redemptions').select('username, redeemed_at').eq('voucher_code', code).order('redeemed_at', { ascending: false });

  if (error) return sendMsg(botToken, chatId, `❌ Error: ${error.message}`);
  if (!redemptions || !redemptions.length) return sendMsg(botToken, chatId, `📭 Voucher \`${code}\` belum pernah ditukar oleh siapapun.`);

  let txt = `🎟️ *PENGGUNA VOUCHER: ${code}*\nTotal: ${redemptions.length} orang\n\n`;
  redemptions.forEach((r, i) => {
    txt += `${i + 1}. \`${r.username}\` (${new Date(r.redeemed_at).toLocaleString('id-ID')})\n`;
  });
  
  await sendMsg(botToken, chatId, txt);
}

/* ============ FITUR VIP (DENGAN MASA AKTIF) ============ */
async function handleSetVip(botToken, chatId, parts, senderName) {
  if (parts.length < 2) return sendMsg(botToken, chatId, '❌ Format: `/setvip <username> [hari]`\nContoh: `/setvip budi 30`');
  
  const targetUser = parts[1];
  const days = parseInt(parts[2]) || 30; // Default 30 hari
  const expiredAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  
  const { error } = await supabase.from('users').update({ tier: 'VIP', limit_harian: 100, vip_expired_at: expiredAt }).eq('username', targetUser);
  if (error) return sendMsg(botToken, chatId, `❌ Gagal: ${error.message}`);
  
  try { await supabase.from('admin_logs').insert([{ admin_username: 'Telegram:' + senderName, action: `Set VIP ${targetUser} selama ${days} hari` }]); } catch (e) {}

  await sendMsg(botToken, chatId, `✅ User \`${targetUser}\` sekarang VIP selama *${days} hari* (s/d ${new Date(expiredAt).toLocaleDateString('id-ID')}).`);
}

async function handleSetTier(botToken, chatId, parts, senderName, tier) {
  if (parts.length < 2) return sendMsg(botToken, chatId, `❌ Format: /setfree <username>`);
  const targetUser = parts[1];
  const newLimitHarian = tier === 'VIP' ? 100 : 30;
  
  const { error } = await supabase.from('users').update({ tier: tier, limit_harian: newLimitHarian, vip_expired_at: null }).eq('username', targetUser);
  if (error) return sendMsg(botToken, chatId, `❌ Gagal: ${error.message}`);
  
  await sendMsg(botToken, chatId, `✅ User \`${targetUser}\` sekarang berstatus *${tier}*.`);
}

/* ============ /addlimit & /rdlimit ============ */
async function handleLimitChange(botToken, chatId, parts, senderName, action) {
  if (parts.length < 3) return sendMsg(botToken, chatId, `❌ Format: /${action === 'add' ? 'addlimit' : 'rdlimit'} <username> <jumlah>`);
  const targetUser = parts[1];
  const amount = parseInt(parts[2]);
  if (isNaN(amount) || amount <= 0) return sendMsg(botToken, chatId, '❌ Jumlah harus angka positif.');

  const { data: user } = await supabase.from('users').select('bonus_kuota').eq('username', targetUser).single();
  if (!user) return sendMsg(botToken, chatId, `❌ User tidak ditemukan.`);

  let newBonus = action === 'add' ? (user.bonus_kuota || 0) + amount : Math.max(0, (user.bonus_kuota || 0) - amount);
  await supabase.from('users').update({ bonus_kuota: newBonus }).eq('username', targetUser);
  await sendMsg(botToken, chatId, `✅ Limit user \`${targetUser}\` diupdate. Bonus Kuota sekarang: *${newBonus}*`);
}

/* ============ /userinfo ============ */
async function handleUserInfo(botToken, chatId, parts) {
  if (parts.length < 2) return sendMsg(botToken, chatId, '❌ Format: /userinfo <username>');
  const { data: user } = await supabase.from('users').select('*').eq('username', parts[1]).single();
  if (!user) return sendMsg(botToken, chatId, `❌ User tidak ditemukan.`);

  const baseLimit = user.tier === 'VIP' ? 100 : 30;
  const totalLimit = baseLimit + (user.bonus_kuota || 0);
  const sisaLimit = Math.max(0, totalLimit - (user.kuota_terpakai || 0));
  const vipExpired = user.vip_expired_at ? new Date(user.vip_expired_at).toLocaleDateString('id-ID') : '-';

  await sendMsg(botToken, chatId, 
    `👤 *INFO USER: ${user.username}*\n\n` +
    `📧 Email: ${user.email}\n` +
    `🏷️ Tier: *${user.tier || 'Free'}* (Exp: ${vipExpired})\n` +
    `📊 Status: ${user.status === 'banned' ? '🔴 Banned' : '🟢 Active'}\n` +
    `🌐 IP: \`${user.ip_address || 'Unknown'}\`\n\n` +
    `🎯 Limit: ${totalLimit}\n` +
    `📉 Terpakai: ${user.kuota_terpakai || 0}\n` +
    `✅ Sisa: ${sisaLimit}\n` +
    `💼 Bonus: ${user.bonus_kuota || 0}`
  );
}

/* ============ /resetlimit ============ */
async function handleResetLimit(botToken, chatId, parts, senderName) {
  if (parts.length < 2) return sendMsg(botToken, chatId, '❌ Format: /resetlimit <username>');
  await supabase.from('users').update({ kuota_terpakai: 0, reset_kuota_at: null }).eq('username', parts[1]);
  await sendMsg(botToken, chatId, `✅ Kuota harian \`${parts[1]}\` berhasil di-reset.`);
}

/* ============ /ban & /unban ============ */
async function handleBanUser(botToken, chatId, parts, senderName, isBan) {
  if (parts.length < 2) return sendMsg(botToken, chatId, `❌ Format: /${isBan ? 'ban' : 'unban'} <username>`);
  const newStatus = isBan ? 'banned' : 'active';
  await supabase.from('users').update({ status: newStatus }).eq('username', parts[1]);
  await sendMsg(botToken, chatId, `✅ User \`${parts[1]}\` berhasil di-${isBan ? 'BAN 🔴' : 'UNBAN 🟢'}.`);
}

/* ============ /close [pesan custom] ============ */
async function handleCloseWeb(botToken, chatId, parts, senderName) {
  const finalMessage = parts.slice(1).join(' ').trim() || 'Web sedang ditutup sementara.';
  await supabase.from('settings').upsert({ key: 'web_status', value: 'closed' });
  await supabase.from('settings').upsert({ key: 'maintenance_message', value: finalMessage });
  await sendMsg(botToken, chatId, `🔒 *WEB DITUTUP*\nPesan: ${finalMessage}`);
}

/* ============ /open ============ */
async function handleOpenWeb(botToken, chatId, senderName) {
  await supabase.from('settings').upsert({ key: 'web_status', value: 'open' });
  await sendMsg(botToken, chatId, `🔓 *WEB DIBUKA*`);
}

/* ============ /status ============ */
async function handleWebStatus(botToken, chatId) {
  const { data } = await supabase.from('settings').select('key, value').in('key', ['web_status', 'maintenance_message']);
  const cfg = {}; (data||[]).forEach(s => cfg[s.key] = s.value);
  await sendMsg(botToken, chatId, `📊 *STATUS WEB*\nStatus: ${cfg.web_status === 'closed' ? '🔴 DITUTUP' : '🟢 TERBUKA'}\nPesan: ${cfg.maintenance_message || '-'}`);
}

/* ============ /ctvoucher ============ */
async function handleCreateVoucher(botToken, chatId, parts, senderName) {
  if (parts.length < 5) return sendMsg(botToken, chatId, '❌ Format: /ctvoucher <kode> <kuota/vip> <jumlah> <max>');
  const code = parts[1].toUpperCase(); const type = parts[2].toLowerCase(); const amount = parseInt(parts[3]) || 0; const maxUses = parseInt(parts[4]) || 100;
  const { error } = await supabase.from('vouchers').insert([{ code, reward_type: type, reward_amount: type === 'kuota' ? amount : 0, max_uses: maxUses }]);
  if (error) return sendMsg(botToken, chatId, `❌ Gagal: ${error.message}`);
  await sendMsg(botToken, chatId, `✅ Voucher \`${code}\` berhasil dibuat.`);
}

async function handleListVouchers(botToken, chatId) {
  const { data } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false }).limit(25);
  if (!data || !data.length) return sendMsg(botToken, chatId, '📭 Belum ada voucher.');
  let txt = '📋 *VOUCHER TERBARU*\n\n';
  data.forEach((v, i) => { txt += `${i+1}. \`${v.code}\` (${v.current_uses}/${v.max_uses})\n`; });
  await sendMsg(botToken, chatId, txt);
}

async function handleDeleteVoucher(botToken, chatId, parts, senderName) {
  if (parts.length < 2) return sendMsg(botToken, chatId, '❌ Format: /delvoucher <kode>');
  await supabase.from('vouchers').delete().eq('code', parts[1].toUpperCase());
  await sendMsg(botToken, chatId, `✅ Voucher \`${parts[1].toUpperCase()}\` dihapus.`);
}

/* ============ /stats ============ */
async function handleStats(botToken, chatId) {
  const [u, v] = await Promise.all([ supabase.from('users').select('*', { count: 'exact', head: true }), supabase.from('vouchers').select('*', { count: 'exact', head: true }) ]);
  await sendMsg(botToken, chatId, `📊 *STATS*\n👥 Users: ${u.count || 0}\n🎟️ Vouchers: ${v.count || 0}`);
}

/* ============ Helper: Send Message ============ */
async function sendMsg(token, chatId, text) {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
  } catch (e) { console.error('[sendMsg] gagal kirim pesan:', e); }
}

/* ============ Helper: Help Text ============ */
function helpText() {
  return '🤖 *ZYXELL BULK — ADMIN BOT*\n\n' +
    '*🌐 Kontrol Website:*\n' +
    '📌 /close [pesan] — tutup web\n' +
    '📌 /open — buka web kembali\n' +
    '📌 /status — cek status web\n\n' +
    '*👥 Manajemen User:*\n' +
    '📌 /userinfo <username> — detail user\n' +
    '📌 /setvip <username> <hari> — jadikan VIP\n' +
    '📌 /setfree <username> — kembalikan ke Free\n' +
    '📌 /resetlimit <username> — reset kuota user\n' +
    '📌 /ban <username> — blokir user\n' +
    '📌 /unban <username> — buka blokir user\n' +
    '📌 /addlimit <username> <jumlah> — tambah kuota\n' +
    '📌 /rdlimit <username> <jumlah> — kurangi kuota\n' +
    '📌 /topup <username> <jumlah> — tambah saldo/kuota\n\n' +
    '*🎟️ Voucher:*\n' +
    '📌 /ctvoucher <kode> <tipe> <jumlah> <max>\n' +
    '📌 /listvoucher — lihat 25 voucher terakhir\n' +
    '📌 /delvoucher <kode> — hapus voucher\n' +
    '📌 /cekvoucher <kode> — cek siapa yang pakai voucher\n\n' +
    '*📊 Lainnya:*\n' +
    '📌 /stats — statistik website\n' +
    '📌 /allmenu — menu bantuan ini';
}