// api/telegram-webhook.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Webhook is active.');
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!supabaseUrl || !supabaseKey || !token) {
      return res.status(200).send('OK');
    }

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const text = message.text.trim();
    const senderName = message.from?.username || message.from?.first_name || 'Admin';

    const supabase = createClient(supabaseUrl, supabaseKey);

    const sendMessage = async (msg) => {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
        });
      } catch (e) {
        console.error('Gagal kirim pesan:', e.message);
      }
    };

    const args = text.split(/\s+/);
    let command = args[0];
    if (command.includes('@')) command = command.split('@')[0];

    /* ============================================================
       🔐 CEK ADMIN (untuk command khusus admin)
       Ambil chat_id admin dari tabel settings.
       Kalau belum diset, command admin tetap dibuka (untuk testing awal).
    ============================================================ */
    const requireAdmin = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'telegram_chat_id')
          .maybeSingle();

        const adminChatId = data?.value ? String(data.value).trim() : null;

        if (adminChatId && String(chatId) !== adminChatId) {
          await sendMessage('⛔ <b>Akses Ditolak</b>\nAnda bukan admin Zyxell Bulk.');
          return false;
        }
        return true;
      } catch (e) {
        return true; // kalau tabel settings error, biarkan (fail-open untuk testing)
      }
    };

    /* ============================================================
       /register — (KODE ASLI KAMU, TIDAK DIUBAH)
    ============================================================ */
    if (command === '/register') {
      if (args.length < 4 || args.length > 5) {
        await sendMessage('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/register username email password role</code>\n\nRole: <code>free</code> atau <code>vip</code>');
        return res.status(200).send('OK');
      }

      const username = args[1];
      const email = args[2];
      const password = args[3];

      let roleInput = args[4] ? args[4].toLowerCase() : 'free';
      let tier = 'Free';
      let limit = 30;

      if (roleInput === 'vip') {
        tier = 'VIP';
        limit = 100;
      }

      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

      const { error } = await supabase.from('users').insert([{
        username, email, password: hashedPassword,
        status: 'active', limit_harian: limit, kuota_terpakai: 0,
        tier: tier, ip_address: 'Via Telegram Bot',
        referral_code: 'ZYX-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        bonus_kuota: 0
      }]);

      if (error) {
        console.error("Supabase Error:", error.message);
        if (error.code === '23505') {
          await sendMessage('❌ <b>Gagal!</b>\nUsername atau Email sudah terdaftar.');
        } else {
          await sendMessage(`❌ Gagal database: ${error.message}`);
        }
      } else {
        await sendMessage(`pendaftaran berhasil ✅
username: ${username}
password: ${password}
email: ${email}
role: ${tier}

silakan login ke website: alight-bulk.vercel.app`);
      }

    /* ============================================================
       /ctvoucher <kode> <tipe> <jumlah> <max_penggunaan>
       Contoh:
         /ctvoucher ZYXELL50 kuota 50 100
         /ctvoucher VIPGRATIS vip 0 50
    ============================================================ */
    } else if (command === '/ctvoucher') {
      if (!(await requireAdmin())) return res.status(200).send('OK');

      if (args.length < 5) {
        await sendMessage(
          '❌ <b>Format Salah!</b>\n\n' +
          '<b>Format:</b>\n<code>/ctvoucher kode tipe jumlah max_penggunaan</code>\n\n' +
          '<b>Contoh:</b>\n' +
          '• <code>/ctvoucher ZYXELL50 kuota 50 100</code>\n' +
          '• <code>/ctvoucher VIPGRATIS vip 0 50</code>\n\n' +
          '<b>Tipe:</b>\n' +
          '• <code>kuota</code> — tambah kuota (jumlah &gt; 0)\n' +
          '• <code>vip</code> — upgrade VIP (jumlah diabaikan)\n\n' +
          '<b>max_penggunaan:</b> batas berapa kali kode bisa ditukar'
        );
        return res.status(200).send('OK');
      }

      const code = args[1].toUpperCase().trim();
      const type = args[2].toLowerCase().trim();
      const amount = parseInt(args[3]) || 0;
      const maxUses = parseInt(args[4]) || 100;

      // Validasi
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
        await sendMessage('❌ Kode voucher tidak valid.\nMinimal 3–20 karakter (A-Z, 0-9, <code>_</code>, <code>-</code>).');
        return res.status(200).send('OK');
      }
      if (!['kuota', 'vip'].includes(type)) {
        await sendMessage('❌ Tipe tidak valid. Gunakan <code>kuota</code> atau <code>vip</code>.');
        return res.status(200).send('OK');
      }
      if (type === 'kuota' && amount < 1) {
        await sendMessage('❌ Jumlah kuota minimal 1.');
        return res.status(200).send('OK');
      }
      if (maxUses < 1) {
        await sendMessage('❌ Max penggunaan minimal 1.');
        return res.status(200).send('OK');
      }

      // Cek duplikat
      const { data: exist } = await supabase.from('vouchers').select('code').eq('code', code).maybeSingle();
      if (exist) {
        await sendMessage(`❌ Voucher <code>${code}</code> sudah ada di database.`);
        return res.status(200).send('OK');
      }

      // Insert voucher
      const { error: insertErr } = await supabase.from('vouchers').insert([{
        code,
        reward_type: type,
        reward_amount: type === 'kuota' ? amount : 0,
        max_uses: maxUses,
        current_uses: 0
      }]);

      if (insertErr) {
        await sendMessage(`❌ Gagal membuat voucher:\n<code>${insertErr.message}</code>`);
        return res.status(200).send('OK');
      }

      // Audit log
      try {
        await supabase.from('admin_logs').insert([{
          admin_username: `Telegram:${senderName}`,
          action: `Buat voucher via Bot: ${code} (${type}, ${amount}, max ${maxUses})`
        }]);
      } catch (e) { /* silent */ }

      const rewardText = type === 'vip' ? '⭐ Upgrade ke VIP' : `💎 +${amount} Kuota`;

      await sendMessage(
        '✅ <b>VOUCHER BERHASIL DIBUAT</b>\n\n' +
        `📝 Kode        : <code>${code}</code>\n` +
        `🎁 Reward      : ${rewardText}\n` +
        `🔢 Max Pakai   : ${maxUses}x\n` +
        `👤 Dibuat oleh : ${senderName}\n\n` +
        '<i>Pengguna dapat menukar kode ini di menu Profil → Tukar Voucher.</i>'
      );

    /* ============================================================
       /listvoucher — lihat 25 voucher terakhir
    ============================================================ */
    } else if (command === '/listvoucher') {
      if (!(await requireAdmin())) return res.status(200).send('OK');

      const { data: list, error } = await supabase
        .from('vouchers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) {
        await sendMessage(`❌ Gagal ambil data: <code>${error.message}</code>`);
        return res.status(200).send('OK');
      }
      if (!list || !list.length) {
        await sendMessage('📭 Belum ada voucher di database.');
        return res.status(200).send('OK');
      }

      let txt = `📋 <b>DAFTAR VOUCHER (${list.length} terakhir)</b>\n\n`;
      list.forEach((v, i) => {
        const reward = v.reward_type === 'vip' ? '⭐ VIP' : `💎 +${v.reward_amount} kuota`;
        const habis = v.current_uses >= v.max_uses;
        const status = habis ? '🔴 HABIS' : '🟢 Aktif';
        txt += `${i + 1}. <code>${v.code}</code> — ${reward}\n   ${status} (${v.current_uses}/${v.max_uses})\n`;
      });

      await sendMessage(txt);

    /* ============================================================
       /delvoucher <kode> — hapus voucher
    ============================================================ */
    } else if (command === '/delvoucher') {
      if (!(await requireAdmin())) return res.status(200).send('OK');

      if (args.length < 2) {
        await sendMessage('❌ Format: <code>/delvoucher KODE</code>');
        return res.status(200).send('OK');
      }

      const code = args[1].toUpperCase();
      const { error } = await supabase.from('vouchers').delete().eq('code', code);

      if (error) {
        await sendMessage(`❌ Gagal hapus: <code>${error.message}</code>`);
        return res.status(200).send('OK');
      }

      try {
        await supabase.from('admin_logs').insert([{
          admin_username: `Telegram:${senderName}`,
          action: `Hapus voucher via Bot: ${code}`
        }]);
      } catch (e) {}

      await sendMessage(`✅ Voucher <code>${code}</code> berhasil dihapus.`);

    /* ============================================================
       /stats — statistik website
    ============================================================ */
    } else if (command === '/stats') {
      if (!(await requireAdmin())) return res.status(200).send('OK');

      const [u, v, l] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('vouchers').select('*', { count: 'exact', head: true }),
        supabase.from('login_logs').select('*', { count: 'exact', head: true })
      ]);

      await sendMessage(
        '📊 <b>STATISTIK ZYXELL BULK</b>\n\n' +
        `👥 Total Pengguna : <b>${u.count || 0}</b>\n` +
        `🎟️ Total Voucher  : <b>${v.count || 0}</b>\n` +
        `🔐 Total Login    : <b>${l.count || 0}</b>`
      );

    /* ============================================================
       /start & /help — MENU BANTUAN (diperbarui)
    ============================================================ */
    } else if (command === '/start' || command === '/help') {
      await sendMessage(
        '👋 <b>Selamat Datang di Zyxell Bot!</b>\n\n' +
        '<b>📌 Perintah Pengguna:</b>\n' +
        '<code>/register username email password role</code>\n' +
        '↳ Daftar akun baru (role: <code>free</code> / <code>vip</code>)\n\n' +
        'Contoh Free:\n<code>/register Zyxell email@gmail.com pass123</code>\n' +
        'Contoh VIP:\n<code>/register Zyxell email@gmail.com pass123 VIP</code>\n\n' +
        '<b>🛠️ Perintah Admin:</b>\n' +
        '<code>/ctvoucher kode tipe jumlah max</code>\n' +
        '↳ Buat voucher baru\n' +
        '   Contoh: <code>/ctvoucher ZYXELL50 kuota 50 100</code>\n' +
        '   Contoh: <code>/ctvoucher VIPGRATIS vip 0 50</code>\n\n' +
        '<code>/listvoucher</code> — Lihat voucher\n' +
        '<code>/delvoucher KODE</code> — Hapus voucher\n' +
        '<code>/stats</code> — Statistik website\n\n' +
        '<b>Tipe Reward:</b>\n' +
        '• <code>kuota</code> — tambah kuota ke user\n' +
        '• <code>vip</code> — upgrade user ke VIP'
      );
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook Fatal Error:', error);
    return res.status(200).send('OK');
  }
        }
