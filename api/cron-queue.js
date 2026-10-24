// api/cron-queue.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  try {
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
      await supabase.from('bulk_queue').update({ status: 'processing' }).eq('id', item.id);

      const { data: settings } = await supabase.from('settings').select('value').eq('key', 'api_key').single();
      const keys = settings?.value ? settings.value.split(',').map(k=>k.trim()) : [];
      const apiKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : 'kayz-5rmdh0s1ma711knojqe2';

      try {
        const apiRes = await fetch(`https://apikayz.clutch.web.id/tools/am-bulk?apikey=${apiKey}&count=${item.count}`);
        const apiData = await apiRes.json();

        // PENGECEKAN LEBIH KETAT: Cek apakah API membalas dengan error tersembunyi
        // (Misal: status: false, atau ada pesan "VIP", atau ada key "error")
        const isError = !apiRes.ok || 
                        apiData.error || 
                        apiData.status === false || 
                        apiData.status === 'error' ||
                        (apiData.message && apiData.message.toLowerCase().includes('vip')) ||
                        (apiData.message && apiData.message.toLowerCase().includes('limit'));

        if (!isError) {
          // SUKSES: Potong Kuota User
          const { data: user } = await supabase.from('users').select('kuota_terpakai').eq('username', item.username).single();
          if (user) {
            const newUsed = (user.kuota_terpakai || 0) + item.count;
            await supabase.from('users').update({ kuota_terpakai: newUsed }).eq('username', item.username);
          }
          
          await supabase.from('bulk_queue').update({ status: 'completed', progress: 100 }).eq('id', item.id);
        } else {
          // TANGKAP PESAN ERROR ASLI DARI KAYZ
          let errorMsg = apiData.message || apiData.error || 'API Bulk Gagal (Tidak diketahui)';
          if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
          throw new Error(errorMsg);
        }
      } catch (err) {
        // Simpan pesan error ke database agar muncul di web
        await supabase.from('bulk_queue').update({ status: 'failed', error_msg: err.message }).eq('id', item.id);
      }
      processedCount++;
    }

    return res.status(200).json({ message: `Memproses ${processedCount} antrean bulk.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};