// api/proxy.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, email, link, count } = req.query;

  if (!path) {
      return res.status(400).json({ error: 'Parameter path wajib diisi.' });
  }

  try {
    const { data: settings, error: dbError } = await supabase.from('settings').select('value').eq('key', 'api_key').single();
    if (dbError || !settings || !settings.value) {
        return res.status(500).json({ error: 'API Key kosong atau gagal mengambil dari database.' });
    }
    
    const API_KEYS = settings.value.split(',').map(k => k.trim()).filter(Boolean);
    if (API_KEYS.length === 0) {
        return res.status(500).json({ error: 'Tidak ada API Key valid di database.' });
    }

    const BASE_URL = 'https://apikayz.clutch.web.id/tools';
    let lastErrorDetail = '';

    // LOOPING API KEY
    for (let i = 0; i < API_KEYS.length; i++) {
      const currentKey = API_KEYS[i];
      
      let targetUrl = `${BASE_URL}${path}?apikey=${currentKey}`;
      if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
      if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
      if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

      try {
          console.log(`[Proxy] Mencoba Key ${i+1} ke Endpoint ${path}...`);
          const response = await fetch(targetUrl, {
              method: 'GET',
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              // Tambahkan timeout 15 detik agar tidak hang
              signal: AbortSignal.timeout(15000) 
          });

          const textData = await response.text();
          
          // Cek jika API membalas dengan HTML (biasanya error dari Cloudflare)
          if (textData.includes('<html') || textData.includes('<!DOCTYPE')) {
              throw new Error(`Ditolak (Respon HTML/Cloudflare)`);
          }

          let data;
          try {
              data = JSON.parse(textData);
          } catch (parseErr) {
              throw new Error(`Respon bukan JSON yang valid: ${textData.substring(0, 50)}...`);
          }
          
          // Jika API mengembalikan pesan error
          if (!response.ok || data.error || data.success === false || data.status === 'error') {
              throw new Error(data.message || data.error || `Ditolak (HTTP ${response.status})`);
          }

          // SUKSES!
          console.log(`[Proxy] SUKSES! Key ${i+1} di ${path}`);
          return res.status(200).json(data);

      } catch (err) {
          let errorMsg = err.message;
          
          // MENANGKAP DETAIL ERROR JARINGAN (FETCH FAILED)
          if (err.name === 'TypeError' && err.cause) {
             errorMsg = `Network Error: ${err.cause.code || err.cause.message}`;
             if (err.cause.code === 'UND_ERR_CONNECT_TIMEOUT' || err.name === 'TimeoutError') {
                 errorMsg = 'Koneksi ke server API timeout (15 detik).';
             } else if (err.cause.code === 'ENOTFOUND') {
                 errorMsg = 'Server API tidak dapat dihubungi (DNS Error).';
             }
          } else if (err.name === 'TimeoutError') {
             errorMsg = 'Koneksi ke server API timeout (15 detik).';
          }
          
          console.warn(`[Proxy] Gagal di ${path} dengan Key ${i+1}: ${errorMsg}`);
          lastErrorDetail = errorMsg;
      }
    }

    // Jika semua API Key gagal
    return res.status(403).json({ error: `Semua API Key gagal. Detail terakhir: ${lastErrorDetail}` });

  } catch (globalErr) {
      console.error('[Proxy Global Error]', globalErr);
      return res.status(500).json({ error: 'Terjadi kesalahan internal pada server proxy.' });
  }
};