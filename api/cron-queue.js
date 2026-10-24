// api/cron-queue.js
// Vercel Serverless Function — Memproses antrean Bulk Verify
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  try {
    // Ambil maksimal 3 antrean yang statusnya 'pending' atau 'processing' yang macet
    const { data: queue, error } = await supabase
      .from('bulk_queue')
      .select('*')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(3);

    if (error || !queue || queue.length === 0) {
      return res.status(200).json({ message: 'Tidak ada antrean bulk.' });
    }

    let processedCount = 0;

    for (const item of queue) {
      // Ubah status jadi processing
      await supabase.from('bulk_queue').update({ status: 'processing' }).eq('id', item.id);

      // Ambil API Key acak
      const { data: settings } = await supabase.from('settings').select('value').eq('key', 'api_key').single();
      const keys = settings?.value ? settings.value.split(',').map(k=>k.trim()) : [];
      const apiKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : 'kayz-5rmdh0s1ma711knojqe2';

      try {
        // Tembak API Bulk
        const apiRes = await fetch(`https://apikayz.clutch.web.id/tools/am-bulk?apikey=${apiKey}&count=${item.count}`);
        const apiData = await apiRes.json();

        if (apiRes.ok && !apiData.error) {
          // SUKSES: Potong Kuota User di DB
          const { data: user } = await supabase.from('users').select('kuota_terpakai, bonus_kuota, tier').eq('username', item.username).single();
          if (user) {
            const newUsed = (user.kuota_terpakai || 0) + item.count;
            await supabase.from('users').update({ kuota_terpakai: newUsed }).eq('username', item.username);
          }
          
          await supabase.from('bulk_queue').update({ status: 'completed', progress: 100 }).eq('id', item.id);
        } else {
          throw new Error(apiData.error || apiData.message || 'API Bulk Gagal');
        }
      } catch (err) {
        await supabase.from('bulk_queue').update({ status: 'failed', error_msg: err.message }).eq('id', item.id);
      }
      processedCount++;
    }

    return res.status(200).json({ message: `Memproses ${processedCount} antrean bulk.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};