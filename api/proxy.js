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

  const { data: settings } = await supabase.from('settings').select('value').eq('key', 'api_key').single();
  if (!settings || !settings.value) return res.status(500).json({ error: 'API Key kosong di database.' });
  
  const API_KEYS = settings.value.split(',').map(k => k.trim()).filter(Boolean);
  const BASE_URL = 'https://apikayz.clutch.web.id/tools';

  let lastErrorDetail = '';

  // LOOPING API KEY
  for (let i = 0; i < API_KEYS.length; i++) {
    const currentKey = API_KEYS[i];
    
    // FIX UTAMA: Langsung tembak endpoint yang diminta frontend (am-send / am-verify / am-bulk)
    let targetUrl = `${BASE_URL}${path}?apikey=${currentKey}`;
    if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
    if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
    if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

    try {
        console.log(`[Proxy] Mencoba Key ${i+1} ke Endpoint ${path}...`);
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const textData = await response.text();
        
        // Cek jika API membalas dengan HTML (biasanya error dari Cloudflare)
        if (textData.includes('<html')) {
            throw new Error(`Ditolak (Respon HTML)`);
        }

        const data = JSON.parse(textData);
        
        // Jika API mengembalikan pesan error atau status 403
        if (!response.ok || data.error || data.success === false || data.status === 'error') {
            throw new Error(data.message || data.error || `Ditolak (HTTP ${response.status})`);
        }

        // SUKSES!
        console.log(`[Proxy] SUKSES! Key ${i+1} di ${path}`);
        return res.status(200).json(data);

    } catch (err) {
        console.warn(`[Proxy] Gagal di ${path} dengan Key ${i+1}:`, err.message);
        lastErrorDetail = err.message;
    }
  }

  // Jika semua API Key gagal
  return res.status(403).json({ error: `Semua API Key gagal. Detail: ${lastErrorDetail}` });
};