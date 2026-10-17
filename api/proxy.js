// api/proxy.js
export default async function handler(req, res) {
  // 1. Atur header CORS untuk frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Ambil parameter
  const { path, ...queryParams } = req.query;
  
  if (!path) {
    return res.status(400).json({ error: 'Parameter "path" wajib diisi' });
  }

  // 3. Susun URL target
  const TARGET_BASE = 'https://apikayz.clutch.web.id/tools';
  const targetUrl = new URL(`${TARGET_BASE}${path.startsWith('/') ? path : '/' + path}`);

  Object.keys(queryParams).forEach(key => {
    targetUrl.searchParams.append(key, queryParams[key]);
  });

  // Daftar proxy publik alternatif (dicoba berurutan jika terjadi error)
  const proxies = [
    (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`, // Proxy 1
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, // Proxy 2
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}` // Proxy 3
  ];

  // 4. Lakukan percobaan berulang (Retry Mechanism)
  for (let i = 0; i < proxies.length; i++) {
    try {
      const proxyUrl = proxies[i](targetUrl.toString());
      
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      // Jika respons sukses (200 OK)
      if (response.ok) {
        const text = await response.text();
        
        // Validasi apakah respons benar-benar berupa JSON
        try {
          const data = JSON.parse(text);
          return res.status(200).json(data);
        } catch (parseError) {
          console.warn(`Proxy ${i + 1} mengembalikan data non-JSON. Mencoba proxy berikutnya...`);
        }
      } else {
        console.warn(`Proxy ${i + 1} gagal dengan status: ${response.status}. Mencoba proxy berikutnya...`);
      }
    } catch (err) {
      console.warn(`Proxy ${i + 1} error: ${err.message}. Mencoba proxy berikutnya...`);
    }
  }

  // Jika semua proxy gagal
  return res.status(502).json({ 
    error: 'Semua jalur proxy gagal terhubung ke API target. Silakan coba beberapa saat lagi.' 
  });
}
