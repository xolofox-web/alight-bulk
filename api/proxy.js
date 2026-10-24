// api/proxy.js
export default async function handler(req, res) {
  // Tambahkan CORS agar tidak diblokir browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, email, link, count } = req.query;
  
  // Ambil daftar API Key (Bisa dari ENV, atau dari request frontend berupa string pisah koma)
  const rawKeys = process.env.ALIGHTMOTION_API_KEY || req.query.apikey;

  if (!rawKeys) {
    return res.status(400).json({ error: 'API Key tidak ditemukan' });
  }

  // Pecah string berdasarkan koma menjadi Array
  const API_KEYS = rawKeys.split(',').map(k => k.trim()).filter(Boolean);

  // URL API ASLI DARI ANDA
  const BASE_URL = 'https://apikayz.clutch.web.id/tools';
  
  // Menyesuaikan endpoint (Saya perbaiki sedikit: /am-send harusnya ke /am-send, bukan /am-verify)
  let endpoint = '';
  if (path === '/am-send') endpoint = '/am-send'; 
  if (path === '/am-verify') endpoint = '/am-verify';
  if (path === '/am-bulk') endpoint = '/am-bulk';

  let lastError = null;

  // ==========================================
  // LOOPING: COBA SATU PER SATU API KEY
  // ==========================================
  for (let i = 0; i < API_KEYS.length; i++) {
    const currentKey = API_KEYS[i];
    
    let targetUrl = `${BASE_URL}${endpoint}?apikey=${currentKey}`;
    if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
    if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
    if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

    try {
      console.log(`[Proxy Vercel] Mencoba API Key ke-${i+1}...`);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || (contentType && contentType.includes('text/html'))) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();
      
      // Cek jika API membalas dengan error tersembunyi (misal limit habis / key mati)
      if (data.error || data.success === false || data.status === 'error' || data.status === 'failed') {
        throw new Error(data.message || data.error || 'API Error (Mungkin Key Mati/Limit)');
      }

      // JIKA SUKSES: Kembalikan data ke user dan HENTIKAN looping
      console.log(`[Proxy Vercel] Sukses dengan Key ke-${i+1}`);
      return res.status(200).json(data);
      
    } catch (error) {
      // Jika gagal, simpan error, lalu lanjut ke key berikutnya
      console.warn(`[Proxy Vercel] Key ke-${i+1} gagal:`, error.message);
      lastError = error;
    }
  }

  // Jika semua key sudah dicoba dan tetap gagal
  console.error("SEMUA API KEY GAGAL.");
  return res.status(500).json({ 
    error: `Semua API Key gagal atau limit.`, 
    detail: lastError ? lastError.message : 'Unknown Error'
  });
}