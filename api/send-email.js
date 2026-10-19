import { Resend } from 'resend';

// Inisialisasi Resend dengan API Key dari environment variable Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, magicLink } = req.body;

  if (!email || !magicLink) {
    return res.status(400).json({ error: 'Email dan magicLink wajib diisi' });
  }

  try {
    // Mengirim email menggunakan Resend
    const { data, error } = await resend.emails.send({
      // PENTING: Untuk testing, gunakan 'onboarding@resend.dev'.
      // Untuk production, Anda harus memverifikasi domain Anda di Resend 
      // dan mengganti 'from' dengan email domain Anda (misal: 'noreply@domainanda.com').
      from: 'Zyxell Support <onboarding@resend.dev>', 
      to: [email],
      subject: 'Tautan Verifikasi Alight Motion Premium',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h3>Halo!</h3>
          <p>Berikut adalah tautan verifikasi untuk akun Alight Motion Anda:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" style="padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Verifikasi Sekarang</a>
          </div>
          <p>Atau copy dan tempel link ini di aplikasi Anda:</p>
          <p style="background: #f4f4f5; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">${magicLink}</p>
          <p style="color: #666; font-size: 12px; margin-top: 40px;">Jika Anda tidak merasa melakukan permintaan ini, abaikan saja email ini.</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend Error:', error);
      return res.status(500).json({ error: 'Gagal mengirim email melalui Resend' });
    }

    return res.status(200).json({ success: true, message: 'Email terkirim', id: data?.id });
  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan internal pada server' });
  }
}
