// api/notify-whatsapp.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { status, admin_name } = req.body;

    // Ambil token dan nomor admin dari Environment Variables Vercel
    const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
    const ADMIN_WA = process.env.ADMIN_WHATSAPP_NUMBER;

    if (!FONNTE_TOKEN || !ADMIN_WA) {
        return res.status(500).json({ error: 'Konfigurasi WhatsApp belum diatur di Vercel' });
    }

    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    
    // Format pesan WA
    const message = status === 'open'
        ? `✅ *WEB DIBUKA*\n\nAdmin: *${admin_name || 'System'}*\nStatus: Akses Web Aktif (Terbuka)\nWaktu: ${waktu}`
        : `🚫 *WEB DITUTUP*\n\nAdmin: *${admin_name || 'System'}*\nStatus: Maintenance (Tutup)\nWaktu: ${waktu}`;

    try {
        const response = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Authorization': FONNTE_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                target: ADMIN_WA,
                message: message
            })
        });

        const data = await response.json();
        return res.status(200).json({ success: true, data });

    } catch (error) {
        console.error('Gagal kirim WA:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}