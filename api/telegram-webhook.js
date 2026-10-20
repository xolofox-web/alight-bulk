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
      return res.status(200).send('OK');
    }

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const text = message.text.trim();

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

    const args = text.split(/\s+/); 
    let command = args[0];
    if (command.includes('@')) command = command.split('@')[0];

    if (command === '/register') {
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
        // --- BAGIAN PESAN BALASAN YANG DIUBAH ---
        await sendMessage(`pendaftaran berhasil ✅
username: ${username}
password: ${password}
email: ${email}

silakan login ke website: alight-bulk.vercel.app`);
        // ----------------------------------------
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
