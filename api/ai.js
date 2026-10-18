// api/ai.js
export default async function handler(req, res) {
  // 1. Cek metode request, harus POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Gunakan POST.' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key belum disetting di Vercel.' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Error dari Gemini', details: data });
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf, saya tidak bisa memproses permintaan Anda.';
    return res.status(200).json({ reply: aiText });

  } catch (error) {
    return res.status(500).json({ error: 'Terjadi kesalahan internal server' });
  }
}
