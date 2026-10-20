// api/telegram-webhook.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Webhook is active.');
  }

  try {
    console.log("--- Menerima pesan dari Telegram ---");

    // 1. Cek Environment Variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!supabaseUrl || !supabaseKey || !token) {
      console.error("❌ ERROR: Environment Variables (SUPABASE_URL, SUPABASE_ANON_KEY, atau TELEGRAM_BOT_TOKEN) belum diatur di Vercel!");
      return res.status(200).send('OK');
    }
    
    console.log("✅ Environment Variables terbaca.");

    // 2. Ambil data pesan
    const { message } = req.body;
    if (!message || !message.text) {
      console.log("⚠️ Pesan kosong atau bukan teks.");
      return res.status(200).send('OK');
    }

    const chatId = message.chat.id;
    let text = message.text.trim();
    console.log(`Chat ID: ${chatId} | Pesan: ${text}`);

    // 3. Fungsi Kirim Pesan ke Telegram
    const sendMessage = async (msg) => {
      try {
        console.log(`Mencoba membalas ke Telegram: ${msg}`);
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
        });
        const resData = await response.json();
        if (!resData.ok) {
          console.error("❌ Telegram menolak pesan:", resData.description);
        } else {
          console.log("✅ Balasan sukses terkirim ke Telegram.");
        }
      } catch (e) {
        console.error('❌ Gagal koneksi ke API Telegram:', e.message);
      }
    };

    // Bersihkan teks jika formatnya /register@NamaBot
    if (text.includes('@')) text = text.split('@')[0];

    // 4. Logika Perintah
    if (text.startsWith('/register')) {
      const args = text.split(' ');
      
      if (args.length !== 4) {
        await sendMessage('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/register username email password</code>');
        return res.status(200).send('OK');
      }

      const username = args[1];
      const email = args[2];
      const password = args[3];

      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

      console.log("Mencoba menyimpan ke Supabase...");
      
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
        console.error("❌ Supabase Error:", error.message);
        if (error.code === '23505') {
          await sendMessage('❌ <b>Gagal!</b>\nUsername atau Email sudah terdaftar.');
        } else {
          await sendMessage(`❌ Gagal database: ${error.message}`);
        }
      } else {
        console.log("✅ User berhasil didaftarkan via bot.");
        await sendMessage(`✅ <b>Pendaftaran Berhasil!</b>\n\nUsername: <b>${username}</b>\nEmail: <b>${email}</b>\n\nSilakan login ke website.`);
      }
      
    } else if (text === '/start' || text === '/help') {
      await sendMessage('👋 <b>Selamat Datang!</b>\n\nUntuk daftar ketik:\n<code>/register username email password</code>');
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Webhook Fatal Error:', error);
    return res.status(200).send('OK'); 
  }
}
