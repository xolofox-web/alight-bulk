// api/telegram-webhook.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs'; // Jika tidak ada, gunakan library lain atau hash sederhana

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Inisialisasi Supabase (Gunakan ANON_KEY atau SERVICE_ROLE_KEY)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { message } = req.body;

  // Jika tidak ada pesan, abaikan
  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const text = message.text.trim();
  const token = process.env.TELEGRAM_BOT_TOKEN;

  // Fungsi untuk membalas pesan ke Telegram
  const sendMessage = async (msg) => {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
    });
  };

  // Logika Perintah: /register username email password
  if (text.startsWith('/register')) {
    const args = text.split(' ');
    
    if (args.length !== 4) {
      return await sendMessage('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/register username email password</code>\n\nContoh:\n<code>/register budi budi@gmail.com rahasia123</code>');
    }

    const username = args[1];
    const email = args[2];
    const password = args[3];

    try {
      // 1. Cek apakah username atau email sudah ada
      const { data: existingUser } = await supabase
        .from('users')
        .select('username, email')
        .or(`username.eq.${username},email.eq.${email}`)
        .maybeSingle();

      if (existingUser) {
        return await sendMessage('❌ <b>Gagal!</b>\nUsername atau Email sudah terdaftar di web.');
      }

      // 2. Hash Password
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

      // 3. Simpan ke Database
      const { error } = await supabase.from('users').insert([{
        username: username,
        email: email,
        password: hashedPassword,
        status: 'active',
        limit_harian: 30,
        kuota_terpakai: 0,
        tier: 'Free',
        ip_address: 'Via Telegram Bot', // IP tidak terdeteksi dari bot
        referral_code: 'ZYX-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        bonus_kuota: 0
      }]);

      if (error) throw error;

      await sendMessage(`✅ <b>Pendaftaran Berhasil!</b>\n\nUsername: <b>${username}</b>\nEmail: <b>${email}</b>\n\nSilakan login ke website menggunakan akun tersebut.`);
      
    } catch (err) {
      console.error(err);
      await sendMessage('❌ <b>Terjadi Kesalahan Server.</b>\nSilakan coba beberapa saat lagi.');
    }
  } else if (text === '/start' || text === '/help') {
    await sendMessage('👋 <b>Selamat Datang di Bot Zyxell!</b>\n\nUntuk mendaftar akun, ketik:\n<code>/register username email password</code>');
  }

  // Selalu balas 200 OK ke Telegram agar tidak mengirim ulang pesan
  return res.status(200).send('OK');
}
