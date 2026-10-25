// api/proxy.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, email, link, count } = req.query;

  // 1. Ambil API Key dari Database
  const { data: settings } = await supabase.from('settings').select('value').eq('key', 'api_key').single();
  if (!settings || !settings.value) return res.status(500).json({ error: 'API Key kosong di database Supabase.' });
  
  const API_KEYS = settings.value.split(',').map(k => k.trim()).filter(Boolean);

  const BASE_URL = 'https://apikayz.clutch.web.id/tools';
  
  // 2. Tentukan Endpoint (Sesuai standar API Kayz)
  let endpoint = '';
  if (path === '/am-send') endpoint = '/am-send'; 
  if (path === '/am-verify') endpoint = '/am-verify';
  if (path === '/am-bulk') endpoint = '/am-bulk';

  let lastErrorDetail = '';

  // 3. Looping API Key
  for (let i = 0; i < API_KEYS.length; i++) {
    const currentKey = API_KEYS[i];
    let targetUrl = `${BASE_URL}${endpoint}?apikey=${currentKey}`;
    if (email) targetUrl += `&email=${encodeURIComponent(email)}`;
    if (link) targetUrl += `&link=${encodeURIComponent(link)}`;
    if (count) targetUrl += `&count=${encodeURIComponent(count)}`;

    try {
      console.log(`[Proxy] Mencoba Key ke-${i+1} ke URL: ${targetUrl}`);
      
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      const textData = await response.text();
      
      // Jika API Kayz membalas dengan HTML (artinya error crash/403)
      if (!response.ok || textData.includes('<html')) {
         throw new Error(`API Kayz Menolak (HTTP ${response.status}). Key mungkin mati atau akses ditolak.`);
      }

      // Jika balasan berupa JSON
      const data = JSON.parse(textData);
      if (data.error || data.success === false || data.status === 'error' || data.status === 'failed') {
        throw new Error(data.message || data.error || 'API Error (Limit habis/Key mati)');
      }

      // SUKSES
      console.log(`[Proxy] SUKSES dengan Key ke-${i+1}`);
      return res.status(200).json(data);
      
    } catch (error) {
      console.warn(`[Proxy] Key ke-${i+1} GAGAL:`, error.message);
      lastErrorDetail = error.message;
    }
  }

  // Jika semua API Key gagal
  return res.status(403).json({ 
    error: `Gagal dari Server Kayz: ${lastErrorDetail}` 
  });
};