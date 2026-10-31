const { Resend } = require('resend');

// Pastikan API Key tersedia
const resendApiKey = process.env.RESEND_API_KEY;

module.exports = async function handler(req, res) {
  // 1. Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, magicLink } = req.body;

  // 2. Validasi Input
  if (!email || !magicLink) {
    return res.status(400).json({ error: 'Email dan magicLink wajib diisi' });
  }

  // Validasi format email menggunakan Regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Format email tidak valid' });
  }

  // Pengecekan API Key
  if (!resendApiKey) {
    console.error('RESEND_API_KEY tidak ditemukan di environment variables');
    return res.status(500).json({ error: 'Konfigurasi server belum lengkap' });
  }

  // Inisialisasi Resend
  const resend = new Resend(resendApiKey);

  try {
    // 3. Mengirim email menggunakan Resend
    const { data, error } = await resend.emails.send({
      // PENTING: 
      // - Jika testing: gunakan 'onboarding@resend.dev' & kirim ke email Anda sendiri.
      // - Jika production: ganti dengan email domain yang sudah diverifikasi di Resend.
      from: 'Zyxell Support <admin@zyxell.my.id>', 
      
      to: [email],
      
      // 4. Tambahkan Reply-To (Opsional)
      // Jika user klik "Reply", email akan masuk ke alamat ini
      reply_to: 'admin@zyxell.my.id', 
      
      subject: 'Tautan Verifikasi Alight Motion Premium',
      
      // 5. Desain HTML yang lebih modern & profesional
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="background-color: #09090b; padding: 24px;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">Zyxell Bulk</h1>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 20px;">Halo!</h2>
                      <p style="color: #52525b; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                        Terima kasih telah menggunakan layanan Zyxell Bulk. Berikut adalah tautan verifikasi untuk akun Alight Motion Anda.
                      </p>
                      
                      <!-- Tombol CTA -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center">
                            <a href="${magicLink}" style="display: inline-block; padding: 14px 32px; background-color: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                              Verifikasi Sekarang
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="color: #52525b; margin: 30px 0 10px 0; font-size: 14px;">
                        Atau, copy dan tempel tautan di bawah ini ke aplikasi Anda:
                      </p>
                      <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 12px; color: #18181b; border: 1px solid #e4e4e7;">
                        ${magicLink}
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #fafafa; padding: 20px 30px; border-top: 1px solid #e4e4e7;">
                      <p style="color: #a1a1aa; margin: 0; font-size: 12px; line-height: 1.5; text-align: center;">
                        Jika Anda tidak merasa melakukan permintaan ini, silakan abaikan email ini.<br>
                        &copy; ${new Date().getFullYear()} Zyxell Bulk. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    // 6. Handling Error dari Resend
    if (error) {
      console.error('Resend API Error:', error);
      // MENAMPILKAN ERROR ASLI DARI RESEND
      return res.status(500).json({ error: error.message || JSON.stringify(error) });
    }

    // 7. Response Sukses
    return res.status(200).json({ 
      success: true, 
      message: 'Email verifikasi berhasil dikirim',
      id: data?.id 
    });

  } catch (err) {
    // 8. Handling Error System (Crash)
    console.error('Internal Server Error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan internal pada server' });
  }
};
