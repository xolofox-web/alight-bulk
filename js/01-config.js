// Tambahkan Global Error Handler agar error apapun muncul di layar
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global Error:', message, 'at', source, lineno, colno);
  try { 
    if (typeof toast === 'function') toast('System Error: ' + message, 'error'); 
  } catch(_) {
    alert('System Error: ' + message);
  }
};

/* ============ DARK/LIGHT MODE ============ */
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btns = [document.getElementById('theme-toggle'), document.getElementById('theme-toggle-admin')];
  btns.forEach(btn => {
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  });
}

// Memastikan hanya angka yang bisa diketik/ditempel di input OTP
const otpEl = document.getElementById('otp-input');
if (otpEl) {
  otpEl.addEventListener('input', function (e) {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
  });
}

const bcrypt = window.dcodeIO ? window.dcodeIO.bcrypt : window.bcrypt;
if (!bcrypt) console.error('Library Bcrypt gagal dimuat.');

const SUPABASE_URL = 'https://vybtsbrwhklyoabqrxec.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1rexSzKxuhwHHBTrSmZqNw_tF1fKacR';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API_PROXY_BASE = '/api/proxy'; 
const DIRECT_API_BASE = 'https://apikayz.clutch.web.id/tools';
let API_KEYS = ['kayz-r6azlrf2ql6864c6x6uf'];

const state = { user: null, currentEmail: '', history: [], tempAvatar: null, allUsers: [], editingUser: null, currentPage: 1 };
const usersPerPage = 10;

const myDeviceId = localStorage.getItem('am_device_id') || 'DEV-' + Math.random().toString(36).substring(2, 15);
localStorage.setItem('am_device_id', myDeviceId);

let apiFailureCount = 0;
let qrisPollInterval = null;
let qrisCountdownInterval = null;
let currentOrderId = null;
let currentAmount = 0;

let adminNotifs = [];
function toggleNotifPanel() {
  document.getElementById('notif-dropdown').classList.toggle('show');
}
function addAdminNotification(text) {
  adminNotifs.unshift({ text, time: new Date().toLocaleTimeString('id-ID') });
  const badge = document.getElementById('notif-count');
  badge.textContent = adminNotifs.length;
  badge.style.display = 'block';
  
  const list = document.getElementById('notif-list');
  list.innerHTML = adminNotifs.map(n => `
    <div class="notif-item">
      <div>${text}</div>
      <span class="time">${n.time}</span>
    </div>
  `).join('');
}
function clearNotifs() {
  adminNotifs = [];
  document.getElementById('notif-count').style.display = 'none';
  document.getElementById('notif-list').innerHTML = '';
  document.getElementById('notif-dropdown').classList.remove('show');
}

const defaultPageAccess = { overview: true, send: true, bulk: true, store: true, support: true, history: true, profile: true };
let pageAccess = { ...defaultPageAccess };

async function renderPageAccessUI() {
    const el = document.getElementById('page-access-list');
    if (!el) return;

    try {
        const { data } = await supabaseClient.from('settings').select('value').eq('key', 'page_access').single();
        if (data && data.value) {
            try { pageAccess = { ...defaultPageAccess, ...JSON.parse(data.value) }; } catch(e){}
        }
    } catch(e) {}

    const pages = [
        { id: 'overview', name: 'Overview / Dashboard' },
        { id: 'send', name: 'Kirim Link' },
        { id: 'bulk', name: 'Bulk Verify' },
        { id: 'store', name: 'Booster' },
        { id: 'support', name: 'Pusat Bantuan' },
        { id: 'history', name: 'Riwayat Generate' },
        { id: 'profile', name: 'Profil' }
    ];

    el.innerHTML = pages.map(p => {
        const isOpen = pageAccess[p.id] !== false;
        const disabled = p.id === 'overview' ? 'disabled' : '';
        return `
        <div class="page-access-item">
            <span>${p.name}</span>
            <label class="switch">
                <input type="checkbox" ${isOpen ? 'checked' : ''} ${disabled} onchange="togglePageAccess('${p.id}', this.checked)">
                <span class="slider"></span>
            </label>
        </div>
        `;
    }).join('');
}

async function togglePageAccess(pageId, isOpen) {
    if (pageId === 'overview') return;
    try {
        const { data } = await supabaseClient.from('settings').select('value').eq('key', 'page_access').single();
        let access = { ...defaultPageAccess };
        if (data && data.value) {
            try { access = { ...access, ...JSON.parse(data.value) }; } catch(e){}
        }
        access[pageId] = isOpen;
        
        const { error } = await supabaseClient.from('settings').upsert({ key: 'page_access', value: JSON.stringify(access) });
        if (error) throw error;
        
        pageAccess = access;
        toast(`Halaman ${pageId} berhasil ${isOpen ? 'dibuka' : 'ditutup'}`, 'success');
        logAdminAction(`Mengubah akses halaman ${pageId} menjadi ${isOpen ? 'Buka' : 'Tutup'}`);
        notifyTelegram(`*Update Akses Halaman*\nHalaman \`${pageId}\` telah di-${isOpen ? 'BUKA' : 'TUTUP'} oleh Admin.`);
    } catch (err) {
        toast('Gagal mengubah akses: ' + err.message, 'error');
        renderPageAccessUI();
    }
}

function applyPageAccess() {
    if (state.user && state.user.isAdmin) return;

    document.querySelectorAll('#screen-dashboard .nav-item').forEach(btn => {
        const tab = btn.dataset.tab;
        if (pageAccess[tab] === false) {
            btn.style.display = 'none';
            if (document.getElementById('tab-' + tab) && document.getElementById('tab-' + tab).classList.contains('active')) {
                showTab('overview');
                toast(`Halaman ini telah ditutup oleh Admin.`, 'error');
            }
        } else {
            btn.style.display = 'flex';
        }
    });

    document.querySelectorAll('#screen-dashboard [data-goto]').forEach(el => {
        const tab = el.dataset.goto;
        if (pageAccess[tab] === false) {
            el.style.opacity = '0.4';
            el.style.pointerEvents = 'none';
            el.style.filter = 'grayscale(1)';
        } else {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.filter = 'none';
        }
    });
}
