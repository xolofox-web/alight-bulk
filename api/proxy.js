// api/proxy.js
export default async function handler(req, res) {
  // 1. Atur header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
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
    // 4. Server Vercel menembak API asli
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `API error: ${response.status}`, 
        detail: errorText 
      });
    }

    // 5. Kembalikan hasilnya ke web Anda
    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: 'Gagal menghubungi API', detail: error.message });
  }
}
