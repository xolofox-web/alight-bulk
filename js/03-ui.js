// ============================================================
// FUNGSI APICALL (DIPERBARUI UNTUK KEAMANAN BACKEND VERCEL)
// ============================================================
async function apiCall(endpoint, params) {
  try {
    let url = new URL(API_PROXY_BASE, window.location.origin);
    url.searchParams.set('path', endpoint);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), { method: 'GET' });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorDetail = errorData.detail || errorData.error || `Server Error (HTTP ${res.status})`);
    }

    const data = await res.json();
    
    apiFailureCount = 0;
    document.getElementById('api-status-banner').style.display = 'none';
    return data;

  } catch (err) {
    console.error("API Call Error:", err.message);
    apiFailureCount++;
    if (apiFailureCount >= 3) {
        document.getElementById('api-status-banner').style.display = 'block';
    }
    throw new Error(err.message || 'Gagal terhubung ke Server API.');
  }
}

const api = {
  send: (email) => apiCall('/am-send', { email }),
  verify: (email, link) => apiCall('/am-verify', { email, link }),
  bulk: (count) => apiCall('/am-bulk', { count })
};

const $ = id => document.getElementById(id);

function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function showTab(name) {
  if (pageAccess[name] === false && name !== 'overview' && (!state.user || !state.user.isAdmin)) {
      toast('Halaman ini sedang ditutup oleh Admin.', 'error');
      return; 
  }

  document.querySelectorAll('#screen-dashboard .nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('#screen-dashboard .tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  const titles = { overview: 'Dashboard', send: 'Kirim Link', bulk: 'Bulk Verify', store: 'Booster', support: 'Pusat Bantuan', history: 'Riwayat', profile: 'Profil', leaderboard: 'Peringkat' };
  $('page-title').textContent = titles[name] || '';
  if (name === 'support') loadSupportTickets();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'store') loadTransactionHistory();
}
function showAdminTab(name) {
  document.querySelectorAll('#screen-admin .nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('#screen-admin .tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  
  const titles = { 
      'admin-dashboard': 'Dashboard', 
      'admin-overview': 'Pengaturan Web', 
      'admin-users': 'Data Pengguna', 
      'admin-roles': 'Manajemen Role', 
      'admin-vouchers': 'Voucher', 
      'admin-announcement': 'Pengumuman', 
      'admin-logs': 'Log Login', 
      'admin-audit': 'Log Admin', 
      'admin-api-status': 'Status API',
      'admin-email-test': 'Tes Email',
      'admin-account': 'Akun Admin' 
  };
  $('admin-page-title').textContent = titles[name] || '';
  
  if (name === 'admin-users') {
    state.currentPage = 1;
    renderAdminUsers();
  }
  if (name === 'admin-roles') renderAdminRoles();
  if (name === 'admin-announcement') loadAnnouncement();
  if (name === 'admin-logs') renderAdminLogs();
  if (name === 'admin-audit') renderAdminAudit();
  if (name === 'admin-overview') { loadAdminSettings(); setTimeout(checkWebhookStatus, 800); }
  if (name === 'admin-dashboard') loadAdminDashboard();
  if (name === 'admin-vouchers') renderAdminVouchers();
  if (name === 'admin-api-status') renderAdminApiStatus();
}
function showStep(name) { ['email', 'waiting', 'success'].forEach(s => $('send-step-' + s).classList.toggle('active', s === name)); }
function resetSendFlow() {
  $('send-email').value = ''; $('verify-link').value = ''; $('auto-link-box').style.display = 'none';
  state.currentEmail = ''; showStep('email');
}

let toastTimer;
function toast(msg, type = 'info') {
  const el = $('toast'); 
  if (!el) return alert(msg);
  el.textContent = msg; el.className = 'toast show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = 'toast', 3500);
}