function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Waktu koneksi habis (Timeout).')), ms))
  ]);
}

async function getIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch (e) { console.warn('Ipify gagal...'); }
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data.ip) return data.ip;
  } catch (e) { console.warn('Ipapi gagal...'); }
  try {
    const res = await fetch('https://1.1.1.1/cdn-cgi/trace');
    const text = await res.text();
    const match = text.match(/ip=([^\n]+)/);
    if (match && match[1]) return match[1];
  } catch (e) { console.warn('Cloudflare gagal.'); }
  return 'Unknown';
}

// ==============================================================================
// FITUR BARU: DETEKSI VPN / PROXY
// ==============================================================================
async function isVpnOrProxy(ip) {
  if (ip === 'Unknown') return false;
  try {
    const res = await fetch(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1`);
    const data = await res.json();
    if (data.status === 'ok' || data.status === 'warning') {
      const ipData = data[ip];
      if (ipData && (ipData.proxy === 'yes' || ipData.type === 'VPN')) {
        return true;
      }
    }
  } catch (e) {
    console.warn('Gagal cek VPN:', e);
  }
  return false;
}
// ==============================================================================

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function checkRateLimit(username) {
  const attempts = JSON.parse(localStorage.getItem('am_login_attempts') || '{}');
  const now = Date.now();
  const userAttempt = attempts[username];
  
  if (userAttempt && userAttempt.count >= 5) {
    const timeLeft = 60000 - (now - userAttempt.lastAttempt);
    if (timeLeft > 0) {
      throw new Error(`Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(timeLeft/1000)} detik.`);
    }
  }
}
function recordFailedAttempt(username) {
  const attempts = JSON.parse(localStorage.getItem('am_login_attempts') || '{}');
  const now = Date.now();
  if (!attempts[username]) attempts[username] = { count: 0, lastAttempt: now };
  attempts[username].count += 1;
  attempts[username].lastAttempt = now;
  localStorage.setItem('am_login_attempts', JSON.stringify(attempts));
}
function clearFailedAttempts(username) {
  const attempts = JSON.parse(localStorage.getItem('am_login_attempts') || '{}');
  if (attempts[username]) {
    delete attempts[username];
    localStorage.setItem('am_login_attempts', JSON.stringify(attempts));
  }
}

const loadUser = () => { try { return JSON.parse(localStorage.getItem('am_user') || 'null'); } catch { return null; } };
const saveUser = u => u ? localStorage.setItem('am_user', JSON.stringify(u)) : localStorage.removeItem('am_user');

const loadHistory = () => { try { return JSON.parse(localStorage.getItem('am_history') || '[]'); } catch { return []; } };
const saveHistory = () => localStorage.setItem('am_history', JSON.stringify(state.history.slice(0, 100)));

async function logAdminAction(action) {
  if (!state.user || !state.user.isAdmin) return;
  try {
    await supabaseClient.from('admin_logs').insert([{ admin_username: state.user.username, action }]);
  } catch(e) { console.error('Gagal mencatat log admin', e); }
}

async function notifyTelegram(message) {
  try {
    await fetch('/api/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
  } catch(e) { console.log('Gagal kirim notif ke Telegram:', e); }
}

async function checkWebStatus() {
  let isClosed = false;
  let maintenanceMsg = 'Web Zyxell Bulk sedang dalam masa perbaikan atau ditutup sementara oleh Admin. Silakan kembali lagi nanti.';
  
  try {
    const { data, error } = await withTimeout(supabaseClient.from('settings').select('key, value').in('key', ['web_status', 'maintenance_message', 'maintenance_start', 'maintenance_end']));
    let start = null, end = null;

    if (!error && data) {
      data.forEach(item => {
        if (item.key === 'web_status') isClosed = item.value === 'closed';
        if (item.key === 'maintenance_message' && item.value) maintenanceMsg = item.value;
        if (item.key === 'maintenance_start' && item.value) start = new Date(item.value);
        if (item.key === 'maintenance_end' && item.value) end = new Date(item.value);
      });
    }

    const now = new Date();
    if (start && end && now >= start && now <= end) {
      isClosed = true;
    }
  } catch (err) { console.warn('Gagal sinkronisasi status dari database.'); }

  document.getElementById('maintenance-text').textContent = maintenanceMsg;
  const user = state.user || loadUser(); 
  const overlay = document.getElementById('global-maintenance');
  
  if (isClosed) {
    if (user && user.isAdmin === true) {
      overlay.style.display = 'none'; 
    } else {
      overlay.style.display = 'flex'; 
      if (state.user && !state.user.isAdmin) {
        state.user = null;
        saveUser(null);
        showScreen('screen-login');
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
      }
    }
  } else {
    overlay.style.display = 'none';
  }
}

async function loadAnnouncement() {
  try {
    const { data, error } = await supabaseClient.from('settings').select('value').eq('key', 'announcement').single();
    const banner = document.getElementById('user-announcement');
    const text = document.getElementById('user-announcement-text');
    const input = document.getElementById('announcement-input');
    
    if (!error && data && data.value) {
      if (banner) { banner.style.display = 'flex'; text.textContent = data.value; }
      if (input) input.value = data.value;
    } else {
      if (banner) banner.style.display = 'none';
      if (input) input.value = '';
    }
  } catch (e) {}
}

function showAdminLogin() {
  document.getElementById('global-maintenance').style.display = 'none';
  showScreen('screen-login');
  document.getElementById('login-user').focus();
}

function forceLogout(msg) {
  toast(msg, 'error');
  state.user = null;
  saveUser(null);
  $('login-user').value = ''; $('login-email').value = ''; $('login-pass').value = '';
  const _lf = $('login-form'); const _rf = $('register-form');
  if (_lf) _lf.style.display = 'block';
  if (_rf) _rf.style.display = 'none';
  checkWebStatus();
  showScreen('screen-login');
}