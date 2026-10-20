// api/proxy.js
export default async function handler(req, res) {
  const { path, email, link, count } = req.query;
  const API_KEY = process.env.ALIGHTMOTION_API_KEY || req.query.apikey;

  if (!API_KEY) {
    return res.status(400).json({ error: 'API Key tidak ditemukan' });
  }

  // GANTI URL INI dengan URL API Alight Motion yang benar
  let targetUrl = `https://api.alightmotion-target.com${path}?apikey=${API_KEY}`;
  
  if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
  if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
  if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const data = await response.json();
    return res.status(200).json(data);
    
  } catch (error) {
    // Mencetak error asli ke Log Vercel (DNS, Timeout, SSL, dll)
    console.error("FETCH FAILED DETAIL:", error.cause || error.message);
    
    return res.status(500).json({ 
      error: `fetch failed`, 
      detail: error.cause ? error.cause.message : error.message 
    });
  }
}
