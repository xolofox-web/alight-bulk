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

  // Daftar proxy dengan kualitas yang lebih baik (diuji berurutan)
  const proxies = [
    (url) => url, // 1. Coba langsung (kadang berhasil untuk beberapa request)
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, // 2. Codetabs (Andal)
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}` // 3. Corsproxy.io
  ];

  for (let i = 0; i < proxies.length; i++) {
    try {
      const proxyUrl = proxies[i](targetUrl.toString());
      
      // Batas waktu 7 detik (lebih aman dari batas 10 detik Vercel)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.google.com/' // Menyamar seolah datang dari Google
        }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        try {
          // Validasi apakah data benar-benar JSON
          const data = JSON.parse(text);
          return res.status(200).json(data);
        } catch (e) {
          console.warn(`Proxy ${i + 1} mengembalikan data non-JSON.`);
        }
      } else {
        console.warn(`Proxy ${i + 1} gagal dengan status: ${response.status}`);
      }
    } catch (err) {
      console.warn(`Proxy ${i + 1} error/timeout: ${err.message}`);
    }
  }

  // Jika semua percobaan gagal
  return res.status(502).json({ 
    error: 'Semua jalur proxy gagal. Kemungkinan besar API Key atau API Target sedang bermasalah.' 
  });
}
