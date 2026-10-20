// api/telegram-webhook.js
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Webhook is active.');
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!supabaseUrl || !supabaseKey || !token) {
      console.error("❌ ERROR: Environment Variables belum diatur.");
      return res.status(200).send('OK');
    }

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Fungsi balas pesan
    const sendMessage = async (msg) => {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
        });
      } catch (e) {
        console.error('❌ Gagal kirim pesan:', e.message);
      }
    };

    // Pisahkan pesan berdasarkan spasi (regex \s+ menangani spasi ganda)
    const args = text.split(/\s+/); 
    
    // Ambil perintah pertama, dan buang embel-embel @NamaBot jika ada
    let command = args[0];
    if (command.includes('@')) {
      command = command.split('@')[0];
    }

    // Logika Perintah
    if (command === '/register') {
      // args[0] = /register, args[1] = username, args[2] = email, args[3] = password
      if (args.length !== 4) {
        await sendMessage('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/register username email password</code>\n\nPastikan tidak ada spasi di dalam username atau password.');
        return res.status(200).send('OK');
      }

      const username = args[1];
      const email = args[2];
      const password = args[3];

      const supabase = createClient(supabaseUrl, supabaseKey);
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
        console.error("❌ Supabase Error:", error.message);
        if (error.code === '23505') {
          await sendMessage('❌ <b>Gagal!</b>\nUsername atau Email sudah terdaftar.');
        } else {
          await sendMessage(`❌ Gagal database: ${error.message}`);
        }
      } else {
        await sendMessage(`✅ <b>Pendaftaran Berhasil!</b>\n\nUsername: <b>${username}</b>\nEmail: <b>${email}</b>\n\nSilakan login ke website.`);
      }
      
    } else if (command === '/start' || command === '/help') {
      await sendMessage('👋 <b>Selamat Datang!</b>\n\nUntuk daftar ketik:\n<code>/register username email password</code>');
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Webhook Fatal Error:', error);
    return res.status(200).send('OK'); 
  }
        }
