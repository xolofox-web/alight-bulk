export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });

  const { order_id } = req.query;
  const CASHI_API_KEY = process.env.CASHI_API_KEY;

  if (!order_id) return res.status(400).json({ message: 'order_id required' });

  try {
    const response = await fetch(`https://cashi.id/api/check-status?order_id=${order_id}`, {
      method: 'GET',
      headers: {
        'X-API-Key': CASHI_API_KEY 
      }
    });

    const data = await response.json();
    
    // Return status asli dari Cashier (SETTLED, PENDING, EXPIRED)
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
