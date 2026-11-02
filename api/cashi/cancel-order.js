// api/cashi/cancel-order.js
export default async function handler(req, res) {
    // Hanya izinkan metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { order_id } = req.body;
    if (!order_id) {
        return res.status(400).json({ message: 'order_id wajib diisi' });
    }

    try {
        // Ambil API Key dari Environment Variables Vercel
        const API_KEY = process.env.CASHI_API_KEY;
        // Default URL, pastikan ini sesuai dengan base URL API Cashi.id
        const API_URL = process.env.CASHI_API_URL || 'https://api.cashi.id'; 

        if (!API_KEY) {
            throw new Error('CASHI_API_KEY belum diatur di Vercel Environment Variables');
        }

        // ============================================================
        // DAFTAR KEMUNGKINAN ENDPOINT & METODE UNTUK PEMBATALAN
        // ============================================================
        const endpointsToTry = [
            // Opsi 1: Sesuai kode asli Anda (POST)
            { url: `${API_URL}/v1/orders/${order_id}/cancel`, method: 'POST', body: { order_id } },
            
            // Opsi 2: Menggunakan metode DELETE (umum untuk pembatalan)
            { url: `${API_URL}/v1/orders/${order_id}`, method: 'DELETE', body: null },
            
            // Opsi 3: Endpoint alternatif (jika ada)
            { url: `${API_URL}/v1/transactions/${order_id}/cancel`, method: 'POST', body: { order_id } },
            
            // Opsi 4: Menggunakan query parameter
            { url: `${API_URL}/v1/cancel?order_id=${order_id}`, method: 'POST', body: null }
        ];

        let lastError = null;

        for (const endpoint of endpointsToTry) {
            try {
                console.log(`Mencoba membatalkan via: ${endpoint.method} ${endpoint.url}`);
                
                const fetchOptions = {
                    method: endpoint.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`,
                        // 'X-API-Key': API_KEY, // Buka komentar jika Cashi menggunakan header ini
                    }
                };

                // Tambahkan body jika diperlukan
                if (endpoint.body) {
                    fetchOptions.body = JSON.stringify(endpoint.body);
                }

                const response = await fetch(endpoint.url, fetchOptions);
                
                // Baca response sebagai teks terlebih dahulu untuk menghindari error parsing JSON
                const responseText = await response.text();
                let data;
                try {
                    data = JSON.parse(responseText);
                } catch (e) {
                    // Jika response bukan JSON (misal HTML error page), gunakan teks mentah
                    data = { message: responseText };
                }

                console.log(`Respons dari ${endpoint.url}: Status ${response.status}`, data);

                if (response.ok) {
                    // Jika berhasil, kembalikan respons sukses
                    return res.status(200).json({ success: true, data: data });
                } else {
                    // Simpan error terakhir untuk dilaporkan jika semua gagal
                    lastError = `Status ${response.status}: ${data.message || 'Gagal tanpa pesan'}`;
                    console.warn(`Endpoint ${endpoint.url} gagal: ${lastError}`);
                }
            } catch (fetchError) {
                // Tangkap error jaringan (misal: DNS error, timeout, koneksi ditolak)
                lastError = `Fetch error: ${fetchError.message}`;
                console.error(`Error pada ${endpoint.url}:`, fetchError.message);
            }
        }

        // Jika semua percobaan gagal, lempar error terakhir
        throw new Error(lastError || 'Semua percobaan endpoint pembatalan gagal. Periksa dokumentasi API Cashi.id.');

    } catch (error) {
        console.error('Error Cancel Order:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}