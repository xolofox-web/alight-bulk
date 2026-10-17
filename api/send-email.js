// api/send-email.js
export default async function handler(req, res) {
  // 1. Izinkan request dari frontend (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, magicLink } = req.body;

  if (!email || !magicLink) {
    return res.status(400).json({ error: 'Email dan magicLink wajib diisi' });
  }

  try {
    // 3. Tembak API Resend menggunakan fetch (tanpa perlu install library)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, // Mengambil API Key dari settingan Vercel
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Catatan: onboarding@resend.dev hanya bisa mengirim ke email Anda sendiri (yang didaftarkan di Resend).
        // Jika ingin mengirim ke sembarang email, ganti dengan domain Anda sendiri.
        from: 'Alight Motion Bulk <onboarding@resend.dev>', 
        to: [email],
        subject: 'Verifikasi Akun Alight Motion Premium',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0e17; color: #e6edf7; border-radius: 10px;">
            <h2 style="color: #6366f1;">Halo Pengguna Alight Motion!</h2>
            <p>Terima kasih telah menggunakan layanan Bulk Premium.</p>
            <p>Silakan klik tombol di bawah ini untuk memverifikasi akun dan mengaktifkan status Premium Anda selama 1 tahun:</p>
            
            <a href="${magicLink}" style="display: inline-block; padding: 12px 24px; margin: 20px 0; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Verifikasi & Aktifkan Premium
            </a>
            
            <p style="font-size: 12px; color: #8b9bb4;">Jika tombol tidak berfungsi, salin dan tempel tautan berikut di browser Anda:</p>
            <p style="font-size: 12px; color: #8b9bb4; word-break: break-all;">${magicLink}</p>
            
            <hr style="border: 0; border-top: 1px solid #232d42; margin: 20px 0;">
            <p style="font-size: 12px; color: #8b9bb4;">Jika Anda tidak merasa melakukan permintaan ini, abaikan saja email ini.</p>
          </div>
        `
      })
    });

    // 4. Cek jika Resend menolak (misal API Key salah)
    if (!response.ok) {
      const errData = await response.json();
      console.error('Resend Error:', errData);
      return res.status(response.status).json({ error: 'Gagal mengirim email dari Resend', detail: errData });
    }

    // 5. Jika sukses
    const data = await response.json();
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
                  }
