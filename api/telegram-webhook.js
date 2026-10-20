// api/telegram-webhook.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    // 1. Inisialisasi Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase Env Vars");
      return res.status(200).send('OK'); // Tetap balas 200 agar webhook tidak dihapus Telegram
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { message } = req.body;

    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    let text = message.text.trim();
    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Fungsi balas pesan
    const sendMessage = async (msg) => {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
      });
    };

    // Bersihkan teks jika formatnya /register@NamaBot
    if (text.includes('@')) {
        text = text.split('@')[0];
    }

    // Logika Perintah
    if (text.startsWith('/register')) {
      const args = text.split(' ');
      
      if (args.length !== 4) {
        return await sendMessage('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/register username email password</code>\n\nContoh:\n<code>/register budi budi@gmail.com rahasia123</code>');
      }

      const username = args[1];
      const email = args[2];
      const password = args[3];

      // Cek duplikat
      const { data: existingUser } = await supabase
        .from('users')
        .select('username, email')
        .or(`username.eq.${username},email.eq.${email}`)
        .maybeSingle();

      if (existingUser) {
        return await sendMessage('❌ <b>Gagal!</b>\nUsername atau Email sudah terdaftar.');
      }

      // Hash & Insert
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

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
        console.error(error);
        return await sendMessage('❌ Gagal menyimpan ke database. Pastikan email belum pernah dipakai.');
      }

      await sendMessage(`✅ <b>Pendaftaran Berhasil!</b>\n\nUsername: <b>${username}</b>\nEmail: <b>${email}</b>\n\nSilakan login ke website.`);
      
    } else if (text === '/start' || text === '/help') {
      await sendMessage('👋 <b>Selamat Datang!</b>\n\nUntuk daftar ketik:\n<code>/register username email password</code>');
    }

    // Wajib membalas 200 OK agar Telegram tidak menghapus webhook
    return res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(200).send('OK'); // Tetap 200 agar webhook aman
  }
}
