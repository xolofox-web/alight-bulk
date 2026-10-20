// api/proxy.js
export default async function handler(req, res) {
  // Ambil parameter dari frontend (TANPA API KEY)
  const { path, email, link, count } = req.query;
  
  // AMBIL DARI ENVIRONMENT VARIABEL VERCEL
  const API_KEY = process.env.ALIGHTMOTION_API_KEY;

  try {
    // GANTI URL INI dengan URL API asli yang Anda gunakan
    let targetUrl = `https://api.asli-target-anda.com${path}?apikey=${API_KEY}`;
    
    // Teruskan parameter lain jika ada
    if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
    if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
    if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

    const response = await fetch(targetUrl);
    
    // Cek jika respon bukan JSON (misal error HTML)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        throw new Error(`API membalas dengan format tidak dikenal (HTTP ${response.status})`);
    }

    const data = await response.json();
    res.status(200).json(data);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
