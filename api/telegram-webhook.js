// api/telegram-webhook.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  // 1. Tangani error 405: Izinkan GET agar log bersih, tapi hanya proses POST
  if (req.method === 'GET') {
    return res.status(200).send('Webhook is active. Please use POST.');
  }
  if (req.method !== 'POST') {
    return res.status(200).send('OK'); 
  }

  try {
    // 2. Pastikan Environment Variable tersedia
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!supabaseUrl || !supabaseKey || !token) {
      console.error("Environment variables missing");
      return res.status(200).send('OK');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { message } = req.body;

    // Abaikan jika bukan pesan teks
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    let text = message.text.trim();

    // Fungsi kirim pesan ke Telegram dengan batas waktu (timeout) 5 detik
    const sendMessage = async (msg) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
          signal: controller.signal
        });
      } catch (e) {
        console.error('Gagal kirim pesan Telegram:', e.message);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Bersihkan teks jika formatnya /register@NamaBot
    if (text.includes('@')) text = text.split('@')[0];

    // Logika Perintah
    if (text.startsWith('/register')) {
      const args = text.split(' ');
      
      if (args.length !== 4) {
        await sendMessage('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/register username email password</code>');
        return res.status(200).send('OK');
      }

      const username = args[1];
      const email = args[2];
      const password = args[3];

      // Hash Password
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

      // Langsung INSERT (tanpa cek duplikat manual agar cepat)
      const { error } = await supabase.from('users').insert([{
        username: username,
        email: email,
        password: hashedPassword,
        status: 'active',
        limit_harian: 30,
        kuota_terpakai: 0,
        tier: 'Free',
        ip_address: 'Via Telegram Bot',
        referral_code: 'ZYX-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        bonus_kuota: 0
      }]);

      if (error) {
        // Kode 23505 = Duplicate Key (Username/Email sudah ada)
        if (error.code === '23505') {
          await sendMessage('❌ <b>Gagal!</b>\nUsername atau Email sudah terdaftar.');
        } else {
          console.error('Supabase Error:', error);
          await sendMessage('❌ Gagal menyimpan ke database.');
        }
      } else {
        await sendMessage(`✅ <b>Pendaftaran Berhasil!</b>\n\nUsername: <b>${username}</b>\nEmail: <b>${email}</b>\n\nSilakan login ke website.`);
      }
      
    } else if (text === '/start' || text === '/help') {
      await sendMessage('👋 <b>Selamat Datang!</b>\n\nUntuk daftar ketik:\n<code>/register username email password</code>');
    }

    // Wajib membalas 200 OK secepat mungkin
    return res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook Fatal Error:', error);
    return res.status(200).send('OK'); 
  }
}
