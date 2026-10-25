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

  const { data: settings } = await supabase.from('settings').select('value').eq('key', 'api_key').single();
  if (!settings || !settings.value) return res.status(500).json({ error: 'API Key kosong di database.' });
  
  const API_KEYS = settings.value.split(',').map(k => k.trim()).filter(Boolean);
  const BASE_URL = 'https://apikayz.clutch.web.id/tools';

  let lastErrorDetail = '';

  // LOOPING API KEY
  for (let i = 0; i < API_KEYS.length; i++) {
    const currentKey = API_KEYS[i];
    
    // DAFTAR ENDPOINT YANG AKAN DICOBA
    let endpointsToTry = [];
    if (path === '/am-verify' || path === '/am-send') {
        // Untuk Magic Link, coba am-verify dulu, lalu am-send
        endpointsToTry = ['/am-verify', '/am-send']; 
    } else if (path === '/am-bulk') {
        endpointsToTry = ['/am-bulk', '/am-verify'];
    }

    for (const ep of endpointsToTry) {
        let targetUrl = `${BASE_URL}${ep}?apikey=${currentKey}`;
        if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
        if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
        if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

        try {
            console.log(`[Proxy] Coba Key ${i+1} ke Endpoint ${ep}...`);
            const response = await fetch(targetUrl, {
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const textData = await response.text();
            if (!response.ok || textData.includes('<html')) {
                throw new Error(`Ditolak (HTTP ${response.status})`);
            }

            const data = JSON.parse(textData);
            if (data.error || data.success === false || data.status === 'error') {
                throw new Error(data.message || data.error || 'API Error');
            }

            // SUKSES!
            console.log(`[Proxy] SUKSES! Key ${i+1} di Endpoint ${ep}`);
            return res.status(200).json(data);
        } catch (err) {
            console.warn(`[Proxy] Gagal di ${ep}:`, err.message);
            lastErrorDetail = err.message;
        }
    }
  }

  return res.status(403).json({ error: `Semua percobaan gagal: ${lastErrorDetail}` });
};