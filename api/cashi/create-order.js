export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { amount, order_id, username, type } = req.body;
  const CASHI_API_KEY = process.env.CASHI_API_KEY; 

  if (!CASHI_API_KEY) {
    return res.status(500).json({ success: false, message: 'CASHI_API_KEY belum di-set di Vercel' });
  }

  try {
    // Gua coba beberapa kemungkinan endpoint standar Cashi.id
    const endpoints = [
        'https://cashi.id/api/create-order',
        'https://api.cashi.id/v1/qris/create',
        'https://cashi.id/api/v1/transaction/create'
    ];

    let response, data, lastError;

    for (const url of endpoints) {
        try {
            console.log(`Mencoba endpoint: ${url}`);
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': CASHI_API_KEY,
                    'Authorization': `Bearer ${CASHI_API_KEY}` // Kadang butuh ini juga
                },
                body: JSON.stringify({
                    amount: amount,
                    order_id: order_id,
                    description: `Topup ${type} - ${username}`,
                    callback_url: `https://alight-bulk.vercel.app/api/payment-webhook`
                })
            });

            data = await response.json();

            if (response.ok) {
                break; // Kalau sukses, keluar dari loop
            }
            lastError = data;
        } catch (e) {
            lastError = e.message;
        }
    }

    if (!response || !response.ok) {
        throw new Error(`Gagal request ke Cashi.id. Response terakhir: ${JSON.stringify(lastError)}`);
    }

    // Ambil data dari dalam objek 'data' (jika ada)
    const responseData = data.data || data; 

    // Cari QR di berbagai kemungkinan nama field
    const qrUrl = responseData.qr_url || responseData.qr_string || responseData.payment_url || responseData.qr_code || responseData.qrString;

    if (!qrUrl) {
        // Kalau gak ketemu, balikin raw data biar frontend bisa nampilin
        return res.status(200).json({ 
            success: false, 
            message: 'Cashi.id tidak mengirim field QR yang dikenali.', 
            raw: data 
        });
    }

    return res.status(200).json({ 
      success: true, 
      qr_url: qrUrl,
      raw: data // Ini buat ngecek di console kalau masih error
    });

  } catch (error) {
    console.error('Create Order Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
