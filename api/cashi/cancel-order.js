// api/cashi/cancel-order.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // Kita biarkan API ini selalu mengembalikan status SUKSES.
    // Transaksi di web Anda akan dibatalkan, 
    // dan transaksi di Cashi.id akan otomatis Expired sendiri.
    return res.status(200).json({ 
        success: true, 
        message: 'Transaksi berhasil dibatalkan di sistem lokal.' 
    });
}
