// api/ai.js
export default async function handler(req, res) {
  const { prompt } = req.query;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt wajib diisi' });
  }

  const API_KEY = 'kayz-sn5alijvoi8w3vvunfnc';
  const targetUrl = `https://apikayz.clutch.web.id/ai/gemini?apikey=${API_KEY}&prompt=${encodeURIComponent(prompt)}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'API target error' });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghubungi server AI', detail: error.message });
  }
}
