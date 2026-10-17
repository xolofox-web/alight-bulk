// api/proxy.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, ...queryParams } = req.query;
  if (!path) return res.status(400).json({ error: 'Parameter "path" wajib diisi' });

  const TARGET_BASE = 'https://apikayz.clutch.web.id/tools';
  const targetUrl = new URL(`${TARGET_BASE}${path.startsWith('/') ? path : '/' + path}`);
  
  Object.keys(queryParams).forEach(key => targetUrl.searchParams.append(key, queryParams[key]));

  try {
    // Kita coba tembak langsung dari server Vercel dengan menyamar sebagai browser
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/'
      }
    });

    const text = await response.text();

    // Coba parsing sebagai JSON
    try {
      const data = JSON.parse(text);
      // Jika API mengembalikan status false / error, kita teruskan ke frontend
      if (!response.ok || data.status === false || data.error) {
         return res.status(400).json({ 
           error: 'API Menolak Request', 
           detail: data.message || data.error || 'Cek API Key atau kuota',
           raw: data 
         });
      }
      return res.status(200).json(data);
    } catch (e) {
      // Jika yang dikembalikan bukan JSON (misal: halaman HTML blokir Cloudflare)
      return res.status(502).json({ 
        error: 'API membalas dengan format tidak dikenal (mungkin terblokir)', 
        detail: text.substring(0, 150) 
      });
    }

  } catch (error) {
    // Jika benar-benar gagal koneksi (DNS error, timeout)
    return res.status(500).json({ 
      error: 'Gagal terhubung ke API', 
      detail: error.message 
    });
  }
}
