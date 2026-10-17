// api/proxy.js
export default async function handler(req, res) {
  // 1. Atur header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Ambil path dan parameter
  const { path, ...queryParams } = req.query;
  
  if (!path) {
    return res.status(400).json({ error: 'Parameter "path" wajib diisi' });
  }

  // 3. Susun URL target API asli
  const TARGET_BASE = 'https://apikayz.clutch.web.id/tools';
  const targetUrl = new URL(`${TARGET_BASE}${path.startsWith('/') ? path : '/' + path}`);

  Object.keys(queryParams).forEach(key => {
    targetUrl.searchParams.append(key, queryParams[key]);
  });

  try {
    // 4. Gunakan AllOrigins sebagai perantara untuk menghindari blokir IP
    // AllOrigins akan mengambil data dari API target dan meneruskannya ke Vercel
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl.toString())}`;

    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        // Gunakan User-Agent browser biasa
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // 5. Periksa jika masih error
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `API target error: ${response.status}`, 
        detail: errorText.substring(0, 200) // Batasi panjang error
      });
    }

    // 6. Kembalikan data ke frontend
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Gagal menghubungi API melalui proxy', detail: error.message });
  }
}
