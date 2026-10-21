// api/telegram-webhook.js
// Vercel Serverless Function — Handler Bot Telegram Zyxell (CommonJS)
// Commands: /close, /open, /status, /ctvoucher, /listvoucher, /delvoucher, /addlimit, /rdlimit, /userinfo, /resetlimit, /ban, /unban, /setvip, /setfree, /stats, /help

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
        await handleSetTier(botToken, chatId, parts, senderName, 'VIP');
        break;
      case '/setfree':
        await handleSetTier(botToken, chatId, parts, senderName, 'Free');
        break;
      // ---------------------------------
      case '/stats':
        await handleStats(botToken, chatId);
        break;
      default:
        await sendMsg(botToken, chatId, '❓ Command ' + command + ' tidak dikenal.\n\nKetik /help untuk melihat daftar command.');
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[telegram-webhook] Error:', err);
    return res.status(200).json({ ok: true });
  }
};

/* ============ /addlimit & /rdlimit ============ */
async function handleLimitChange(botToken, chatId, parts, senderName, action) {
  if (parts.length < 3) {
    return sendMsg(botToken, chatId, `❌ *Format salah!*\n\n*Format:* /${action === 'add' ? 'addlimit' : 'rdlimit'} <username> <jumlah>\n*Contoh:* /${action === 'add' ? 'addlimit' : 'rdlimit'} budi 50`);
  }
  
  const targetUser = parts[1];
  const amount = parseInt(parts[2]);
  
  if (isNaN(amount) || amount <= 0) {
    return sendMsg(botToken, chatId, '❌ Jumlah harus berupa angka positif.');
  }

  const { data: user, error: errFetch } = await supabase.from('users').select('bonus_kuota, tier').eq('username', targetUser).single();
  
  if (errFetch || !user) {
    return sendMsg(botToken, chatId, `❌ User \`${targetUser}\` tidak ditemukan di database.`);
  }

  let currentBonus = user.bonus_kuota || 0;
  let newBonus = action === 'add' ? currentBonus + amount : Math.max(0, currentBonus - amount);

  const { error: errUpdate } = await supabase.from('users').update({ bonus_kuota: newBonus }).eq('username', targetUser);
  
  if (errUpdate) {
    return sendMsg(botToken, chatId, `❌ Gagal update limit:\n${errUpdate.message}`);
  }

  try {
    await supabase.from('admin_logs').insert([{
      admin_username: 'Telegram:' + senderName,
      action: `${action === 'add' ? 'Menambah' : 'Mengurangi'} limit ${targetUser} sebanyak ${amount}`
    }]);
  } catch (e) {}

  const baseLimit = user.tier === 'VIP' ? 100 : 30;
  const totalLimit = baseLimit + newBonus;

  await sendMsg(botToken, chatId,
    `✅ *BERHASIL ${action === 'add' ? 'MENAMBAH' : 'MENGURANGI'} LIMIT*\n\n` +
    `👤 Username    : \`${targetUser}\`\n` +
    `🏷️ Tier        : ${user.tier || 'Free'}\n` +
    `➕/- Perubahan : ${action === 'add' ? '+' : '-'}${amount}\n` +
    `💼 Bonus Kuota : ${newBonus}\n` +
    `🎯 Limit Total : *${totalLimit} akun/hari*`
  );
}

/* ============ /userinfo ============ */
async function handleUserInfo(botToken, chatId, parts) {
  if (parts.length < 2) {
    return sendMsg(botToken, chatId, '❌ *Format salah!*\n\n*Format:* /userinfo <username>\n*Contoh:* /userinfo budi');
  }
  
  const targetUser = parts[1];
  const { data: user, error } = await supabase.from('users').select('*').eq('username', targetUser).single();
  
  if (error || !user) {
    return sendMsg(botToken, chatId, `❌ User \`${targetUser}\` tidak ditemukan.`);
  }

  const baseLimit = user.tier === 'VIP' ? 100 : 30;
  const totalLimit = baseLimit + (user.bonus_kuota || 0);
  const sisaLimit = Math.max(0, totalLimit - (user.kuota_terpakai || 0));

  await sendMsg(botToken, chatId,
    `👤 *DETAIL USER: ${user.username}*\n\n` +
    `📧 Email       : ${user.email}\n` +
    `🏷️ Tier        : *${user.tier || 'Free'}*\n` +
    `📊 Status      : ${user.status === 'banned' ? '🔴 Banned' : '🟢 Active'}\n` +
    `🌐 IP Address  : \`${user.ip_address || 'Unknown'}\`\n\n` +
    `🎯 Limit Harian: ${totalLimit} akun\n` +
    `📉 Terpakai    : ${user.kuota_terpakai || 0} akun\n` +
    `✅ Sisa Limit  : ${sisaLimit} akun\n` +
    `💼 Bonus Kuota : ${user.bonus_kuota || 0}\n\n` +
    `📅 Tgl Daftar  : ${new Date(user.created_at).toLocaleString('id-ID')}`
  );
}

/* ============ /resetlimit ============ */
async function handleResetLimit(botToken, chatId, parts, senderName) {
  if (parts.length < 2) {
    return sendMsg(botToken, chatId, '❌ *Format salah!*\n\n*Format:* /resetlimit <username>');
  }
  
  const targetUser = parts[1];
  const { error } = await supabase.from('users').update({ kuota_terpakai: 0, reset_kuota_at: null }).eq('username', targetUser);
  
  if (error) return sendMsg(botToken, chatId, `❌ Gagal reset limit: ${error.message}`);
  
  try {
    await supabase.from('admin_logs').insert([{ admin_username: 'Telegram:' + senderName, action: `Reset limit ${targetUser}` }]);
  } catch (e) {}

  await sendMsg(botToken, chatId, `✅ Kuota harian untuk user \`${targetUser}\` berhasil di-reset menjadi 0.`);
}

/* ============ /ban & /unban ============ */
async function handleBanUser(botToken, chatId, parts, senderName, isBan) {
  if (parts.length < 2) {
    return sendMsg(botToken, chatId, `❌ *Format salah!*\n\n*Format:* /${isBan ? 'ban' : 'unban'} <username>`);
  }
  
  const targetUser = parts[1];
  const newStatus = isBan ? 'banned' : 'active';
  
  const { error } = await supabase.from('users').update({ status: newStatus }).eq('username', targetUser);
  
  if (error) return sendMsg(botToken, chatId, `❌ Gagal update status: ${error.message}`);
  
  try {
    await supabase.from('admin_logs').insert([{ 
      admin_username: 'Telegram:' + senderName, 
      action: `${isBan ? 'Memblokir' : 'Membuka blokir'} user ${targetUser}` 
    }]);
  } catch (e) {}

  await sendMsg(botToken, chatId, `✅ User \`${targetUser}\` berhasil ${isBan ? 'di-**BAN** 🔴' : 'di-**UNBAN** 🟢'}.`);
}

/* ============ /setvip & /setfree ============ */
async function handleSetTier(botToken, chatId, parts, senderName, tier) {
  if (parts.length < 2) {
    return sendMsg(botToken, chatId, `❌ *Format salah!*\n\n*Format:* /${tier === 'VIP' ? 'setvip' : 'setfree'} <username>`);
  }
  
  const targetUser = parts[1];
  const newLimitHarian = tier === 'VIP' ? 100 : 30;
  
  const { error } = await supabase.from('users').update({ tier: tier, limit_harian: newLimitHarian }).eq('username', targetUser);
  
  if (error) return sendMsg(botToken, chatId, `❌ Gagal update tier: ${error.message}`);
  
  try {
    await supabase.from('admin_logs').insert([{ 
      admin_username: 'Telegram:' + senderName, 
      action: `Mengubah tier ${targetUser} menjadi ${tier}` 
    }]);
  } catch (e) {}

  await sendMsg(botToken, chatId, `✅ User \`${targetUser}\` sekarang berstatus **${tier}** (Limit: ${newLimitHarian}).`);
}

/* ============ /close [pesan custom] ============ */
async function handleCloseWeb(botToken, chatId, parts, senderName) {
  const customMessage = parts.slice(1).join(' ').trim();
  const defaultMessage = 'Web Zyxell Bulk sedang dalam masa perbaikan atau ditutup sementara oleh Admin. Silakan kembali lagi nanti.';
  const finalMessage = customMessage || defaultMessage;

  try {
    const { error: err1 } = await supabase.from('settings').upsert({ key: 'web_status', value: 'closed' });
    if (err1) throw err1;

    const { error: err2 } = await supabase.from('settings').upsert({ key: 'maintenance_message', value: finalMessage });
    if (err2) throw err2;

    try {
      await supabase.from('admin_logs').insert([{
        admin_username: 'Telegram:' + senderName,
        action: 'Menutup web via Bot. Pesan: ' + finalMessage
      }]);
    } catch (e) {}

    await sendMsg(botToken, chatId,
      '🔒 *WEB BERHASIL DITUTUP*\n\n' +
      '📢 *Pesan Maintenance:*\n' + finalMessage + '\n\n' +
      '👤 Oleh: ' + senderName + '\n' +
      '🕐 Waktu: ' + new Date().toLocaleString('id-ID') + '\n\n' +
      '_Gunakan /open untuk membuka kembali website._'
    );
  } catch (err) {
    await sendMsg(botToken, chatId, '❌ Gagal menutup web:\n' + err.message);
  }
}

/* ============ /open ============ */
async function handleOpenWeb(botToken, chatId, senderName) {
  try {
    const { error } = await supabase.from('settings').upsert({ key: 'web_status', value: 'open' });
    if (error) throw error;

    try {
      await supabase.from('admin_logs').insert([{
        admin_username: 'Telegram:' + senderName,
        action: 'Membuka akses web via Bot'
      }]);
    } catch (e) {}

    await sendMsg(botToken, chatId,
      '🔓 *WEB BERHASIL DIBUKA*\n\n' +
      '✅ Semua pengguna sekarang bisa mengakses website kembali.\n\n' +
      '👤 Oleh: ' + senderName + '\n' +
      '🕐 Waktu: ' + new Date().toLocaleString('id-ID')
    );
  } catch (err) {
    await sendMsg(botToken, chatId, '❌ Gagal membuka web:\n' + err.message);
  }
}

/* ============ /status ============ */
async function handleWebStatus(botToken, chatId) {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['web_status', 'maintenance_message', 'maintenance_start', 'maintenance_end']);

    if (error) throw error;

    const cfg = {};
    (data || []).forEach(s => { cfg[s.key] = s.value; });

    const isClosed = cfg.web_status === 'closed';
    const statusIcon = isClosed ? '🔴' : '🟢';
    const statusText = isClosed ? 'DITUTUP (Maintenance)' : 'TERBUKA (Aktif)';

    let txt = '📊 *STATUS WEBSITE*\n\n' + statusIcon + ' Status: *' + statusText + '*\n';

    if (isClosed && cfg.maintenance_message) {
      txt += '\n📢 Pesan:\n' + cfg.maintenance_message + '\n';
    }

    if (cfg.maintenance_start || cfg.maintenance_end) {
      txt += '\n⏰ Jadwal Maintenance:\n';
      txt += '• Mulai: ' + (cfg.maintenance_start || '-') + '\n';
      txt += '• Selesai: ' + (cfg.maintenance_end || '-') + '\n';
    }

    await sendMsg(botToken, chatId, txt);
  } catch (err) {
    await sendMsg(botToken, chatId, '❌ Gagal ambil status:\n' + err.message);
  }
}

/* ============ /ctvoucher ============ */
async function handleCreateVoucher(botToken, chatId, parts, senderName) {
  if (parts.length < 5) {
    return sendMsg(botToken, chatId,
      '❌ *Format salah!*\n\n' +
      '*Format:* /ctvoucher <kode> <tipe> <jumlah> <max_penggunaan>\n\n' +
      '*Contoh:*\n' +
      '• /ctvoucher ZYXELL50 kuota 50 100\n' +
      '• /ctvoucher VIPGRATIS vip 0 50\n\n' +
      '*Tipe:*\n' +
      '• kuota — tambah kuota (isi jumlah > 0)\n' +
      '• vip — upgrade ke VIP (jumlah diabaikan)\n\n' +
      '*Max penggunaan:* batas berapa kali kode bisa ditukar'
    );
  }

  const code = parts[1].toUpperCase().trim();
  const type = parts[2].toLowerCase().trim();
  const amount = parseInt(parts[3]) || 0;
  const maxUses = parseInt(parts[4]) || 100;

  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
    return sendMsg(botToken, chatId, '❌ Kode voucher tidak valid.\nMinimal 3–20 karakter (A-Z, 0-9, _, -).');
  }
  if (!['kuota', 'vip'].includes(type)) {
    return sendMsg(botToken, chatId, '❌ Tipe tidak valid. Gunakan kuota atau vip.');
  }
  if (type === 'kuota' && amount < 1) {
    return sendMsg(botToken, chatId, '❌ Jumlah kuota minimal 1.');
  }
  if (maxUses < 1) {
    return sendMsg(botToken, chatId, '❌ Max penggunaan minimal 1.');
  }

  const { data: exist } = await supabase.from('vouchers').select('code').eq('code', code).maybeSingle();
  if (exist) return sendMsg(botToken, chatId, '❌ Voucher ' + code + ' sudah ada di database.');

  const { error } = await supabase.from('vouchers').insert([{
    code, reward_type: type, reward_amount: type === 'kuota' ? amount : 0,
    max_uses: maxUses, current_uses: 0
  }]);

  if (error) return sendMsg(botToken, chatId, '❌ Gagal membuat voucher:\n' + error.message);

  try {
    await supabase.from('admin_logs').insert([{
      admin_username: 'Telegram:' + senderName,
      action: 'Buat voucher via Bot: ' + code + ' (' + type + ', ' + amount + ', max ' + maxUses + ')'
    }]);
  } catch (e) { }

  const rewardText = type === 'vip' ? '⭐ Upgrade ke VIP' : '💎 +' + amount + ' Kuota';

  await sendMsg(botToken, chatId,
    '✅ *VOUCHER BERHASIL DIBUAT*\n\n' +
    '📝 Kode        : ' + code + '\n' +
    '🎁 Reward      : ' + rewardText + '\n' +
    '🔢 Max Pakai   : ' + maxUses + 'x\n' +
    '👤 Dibuat oleh : ' + senderName + '\n\n' +
    '_Pengguna dapat menukar kode ini di menu Profil → Tukar Voucher._'
  );
}

async function handleListVouchers(botToken, chatId) {
  const { data: list, error } = await supabase
    .from('vouchers').select('*').order('created_at', { ascending: false }).limit(25);

  if (error) return sendMsg(botToken, chatId, '❌ Gagal ambil data: ' + error.message);
  if (!list || !list.length) return sendMsg(botToken, chatId, '📭 Belum ada voucher di database.');

  let txt = '📋 *DAFTAR VOUCHER (' + list.length + ' terakhir)*\n\n';
  list.forEach((v, i) => {
    const reward = v.reward_type === 'vip' ? '⭐ VIP' : '💎 +' + v.reward_amount + ' kuota';
    const habis = v.current_uses >= v.max_uses;
    const status = habis ? '🔴 HABIS' : '🟢 Aktif';
    txt += (i + 1) + '. ' + v.code + ' — ' + reward + '\n   ' + status + ' (' + v.current_uses + '/' + v.max_uses + ')\n';
  });
  await sendMsg(botToken, chatId, txt);
}

async function handleDeleteVoucher(botToken, chatId, parts, senderName) {
  if (parts.length < 2) return sendMsg(botToken, chatId, '❌ Format: /delvoucher <kode>');
  const code = parts[1].toUpperCase();
  const { error } = await supabase.from('vouchers').delete().eq('code', code);
  if (error) return sendMsg(botToken, chatId, '❌ Gagal hapus: ' + error.message);
  try {
    await supabase.from('admin_logs').insert([{
      admin_username: 'Telegram:' + senderName, action: 'Hapus voucher via Bot: ' + code
    }]);
  } catch (e) {}
  await sendMsg(botToken, chatId, '✅ Voucher ' + code + ' berhasil dihapus.');
}

async function handleStats(botToken, chatId) {
  const [u, v, l] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('vouchers').select('*', { count: 'exact', head: true }),
    supabase.from('login_logs').select('*', { count: 'exact', head: true })
  ]);
  await sendMsg(botToken, chatId,
    '📊 *STATISTIK ZYXELL BULK*\n\n' +
    '👥 Total Pengguna : ' + (u.count || 0) + '\n' +
    '🎟️ Total Voucher  : ' + (v.count || 0) + '\n' +
    '🔐 Total Login    : ' + (l.count || 0)
  );
}

async function sendMsg(token, chatId, text) {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
  } catch (e) { console.error('[sendMsg] gagal kirim pesan:', e); }
}

function helpText() {
  return '🤖 *ZYXELL BULK — ADMIN BOT*\n\n' +
    '*🌐 Kontrol Website:*\n' +
    '📌 /close [pesan] — tutup web\n' +
    '📌 /open — buka web kembali\n' +
    '📌 /status — cek status web\n\n' +
    '*👥 Manajemen User:*\n' +
    '📌 /userinfo <username> — detail user\n' +
    '📌 /resetlimit <username> — reset kuota user\n' +
    '📌 /ban <username> — blokir user\n' +
    '📌 /unban <username> — buka blokir user\n' +
    '📌 /setvip <username> — jadikan VIP\n' +
    '📌 /setfree <username> — kembalikan ke Free\n' +
    '📌 /addlimit <username> <jumlah> — tambah kuota\n' +
    '📌 /rdlimit <username> <jumlah> — kurangi kuota\n\n' +
    '*🎟️ Voucher:*\n' +
    '📌 /ctvoucher <kode> <tipe> <jumlah> <max>\n' +
    '📌 /listvoucher — lihat 25 voucher terakhir\n' +
    '📌 /delvoucher <kode> — hapus voucher\n\n' +
    '*📊 Lainnya:*\n' +
    '📌 /stats — statistik website\n' +
    '📌 /allmenu — menu bantuan ini';
}