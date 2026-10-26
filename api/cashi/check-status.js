export default async function handler(req, res) {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ message: 'Order ID required' });

  try {
    const response = await fetch(`https://cashi.id/api/check-status/${order_id}`, {
      method: 'GET',
      headers: {
        'x-api-key': process.env.CASHI_API_KEY,
      },
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}