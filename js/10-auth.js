/* ============================================================
   AUTH LOGIC
   ============================================================ */
const loginForm = $('login-form');
const registerForm = $('register-form');

$('to-register').addEventListener('click', (e) => { e.preventDefault(); if (loginForm) loginForm.style.display = 'none'; if (registerForm) registerForm.style.display = 'block'; });
$('to-login').addEventListener('click', (e) => { e.preventDefault(); if (registerForm) registerForm.style.display = 'none'; if (loginForm) loginForm.style.display = 'block'; });

/* ============================================================
   LOGIN HANDLER — window.handleLoginSubmit (dipanggil via onsubmit form)
   ============================================================ */
window.handleLoginSubmit = async function(e) {
  if (e) { try { e.preventDefault(); e.stopPropagation(); } catch(_) {} }
  
  if (typeof supabaseClient === 'undefined' || !supabaseClient) { toast('Koneksi database belum siap. Tunggu lalu coba lagi.', 'error'); return false; }
  if (typeof bcrypt === 'undefined' || !bcrypt) { toast('Sistem enkripsi belum siap. Refresh halaman.', 'error'); return false; }
  
  const form = e ? e.target : document.getElementById('login-form');
  const _tstEl = form.querySelector('[name="cf-turnstile-response"]');
  const turnstileToken = _tstEl ? _tstEl.value : '';
  if (!turnstileToken) { toast('Selesaikan verifikasi CAPTCHA terlebih dahulu.', 'error'); return false; }

  const btn = $('btn-login');
  btn.innerHTML = '<span class="spin-inline"></span> Memeriksa...';
  btn.disabled = true;

  const fallbackTimer = setTimeout(() => {
    btn.innerHTML = 'Masuk ke Dashboard';
    btn.disabled = false;
    toast('Koneksi ke server memakan waktu terlalu lama.', 'error');
  }, 8000);

  const username = $('login-user').value.trim();
  const email = $('login-email').value.trim();
  const password = $('login-pass').value;

  try {
    checkRateLimit(username);

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (!authError && authData && authData.user) {
      const { data: adminData, error: adminError } = await supabaseClient
        .from('admins').select('username, email').eq('id', authData.user.id).single();

      if (!adminError && adminData) {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        state.adminOtpCode = otpCode;
        state.adminOtpExpires = Date.now() + 5 * 60000;
        state.tempAdminData = adminData;
        state.tempAuthData = authData;

        await notifyTelegram(`*KODE OTP LOGIN ADMIN*\n\nAdmin: ${adminData.username || 'Admin'}\nKode OTP: *${otpCode}*\nBerlaku 5 menit.`);

        $('otp-modal').style.display = 'flex';
        toast('Kode OTP dikirim ke Bot Telegram Admin!', 'success');
        return false;
      } else {
        await supabaseClient.auth.signOut();
      }
    }

    let isClosed = false;
    try {
        const { data: statusData } = await withTimeout(supabaseClient.from('settings').select('value').eq('key', 'web_status').single());
        if (statusData) isClosed = statusData.value === 'closed';
    } catch(e) {}

    if (isClosed) {
      document.getElementById('global-maintenance').style.display = 'flex';
      throw new Error('Web sedang ditutup. Hanya Admin yang dapat masuk.');
    }

    const userIp = await getIP();
    
    const isVpn = await isVpnOrProxy(userIp);
    if (isVpn) {
        throw new Error('Akses Ditolak: Gunakan koneksi internet biasa (Matikan VPN/Proxy).');
    }

    const { data: bannedIp } = await supabaseClient.from('banned_ips').select('ip').eq('ip', userIp).maybeSingle();
    if (bannedIp) throw new Error('IP Address Anda telah diblokir oleh sistem (Anti-Spam).');

    const { data: users, error } = await withTimeout(
      supabaseClient.from('users').select('*').eq('username', username).eq('email', email).single()
    );

    if (error || !users) throw new Error('Username, Email, atau password salah!');
    if (users.status === 'banned') throw new Error('Akun Anda telah diblokir oleh Admin.');

    let isPasswordMatch = false;
    if (users.password.startsWith('$2a$') || users.password.startsWith('$2b$')) {
      isPasswordMatch = bcrypt.compareSync(password, users.password);
    } else {
      isPasswordMatch = (password === users.password); 
    }

    if (!isPasswordMatch) throw new Error('Username, Email, atau password salah!');

    if (users.role === 'admin') {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        state.adminOtpCode = otpCode;
        state.adminOtpExpires = Date.now() + 5 * 60000;
        state.tempAdminData = { username: users.username, email: users.email };
        state.tempAuthData = { user: { email: users.email } }; 

        await notifyTelegram(`*KODE OTP LOGIN ADMIN*\n\nAdmin: ${users.username}\nKode OTP: *${otpCode}*\nBerlaku 5 menit.`);

        $('otp-modal').style.display = 'flex';
        toast('Kode OTP dikirim ke Bot Telegram Admin!', 'success');
        return false;
    }

    if (users.device_id !== myDeviceId) {
        await supabaseClient.from('users').update({ device_id: myDeviceId }).eq('username', username);
    }

    state.user = { 
      username: users.username, 
      email: users.email || '', 
      avatar: users.avatar || '', 
      id: users.id,
      limit_harian: users.limit_harian || 30,
      kuota_terpakai: users.kuota_terpakai || 0,
      reset_kuota_at: users.reset_kuota_at || null,
      tier: users.tier || 'Free',
      bonus_kuota: users.bonus_kuota || 0,
      referral_code: users.referral_code || '',
      vip_expired_at: users.vip_expired_at || null,
      saldo: users.saldo || 0,
      last_checkin: users.last_checkin,
      total_generated: users.total_generated
    };
    saveUser(state.user);

    clearFailedAttempts(username);
    try { await supabaseClient.from('login_logs').insert([{ username, ip_address: userIp }]); } catch(err) {}

    fetch('/api/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `User Login!\n\nUsername: ${username}\nIP: ${userIp}` 
      })
    }).catch(e => console.log('Gagal kirim notif telegram:', e));

    toast('Login berhasil!', 'success');
    enterDashboard();

  } catch (error) {
    console.error(error);
    recordFailedAttempt(username);
    toast(error.message || 'Terjadi kesalahan sistem.', 'error');
  } finally {
    clearTimeout(fallbackTimer);
    btn.innerHTML = 'Masuk ke Dashboard';
    btn.disabled = false;
  }
  return false;
};

async function verifyOTP() {
    const otp = $('otp-input').value.trim();
    
    if (!/^\d+$/.test(otp)) {
        return toast('Kode OTP hanya boleh berisi angka', 'error');
    }

    if (otp.length !== 6) return toast('Masukkan 6 angka', 'error');

    if (!state.adminOtpCode || Date.now() > state.adminOtpExpires) {
        return toast('Kode OTP sudah kadaluarsa. Silakan login ulang.', 'error');
    }

    if (otp !== state.adminOtpCode) {
        return toast('Kode OTP salah.', 'error');
    }

    state.user = { username: state.tempAdminData.username || 'Admin', email: state.tempAdminData.email, isAdmin: true };
    saveUser(state.user);
    clearFailedAttempts(state.tempAdminData.username);
    $('otp-modal').style.display = 'none';
    $('otp-input').value = '';
    toast('Login Admin Berhasil!', 'success');
    showScreen('screen-admin');
    showAdminTab('admin-dashboard');
    loadAdminDashboard();

    state.adminOtpCode = null;
    state.adminOtpExpires = null;
    state.tempAdminData = null;
    state.tempAuthData = null;
}

window.handleRegisterSubmit = async function(e) {
  if (e) { try { e.preventDefault(); e.stopPropagation(); } catch(_) {} }
  
  if (typeof supabaseClient === 'undefined' || !supabaseClient) { toast('Koneksi database belum siap. Tunggu lalu coba lagi.', 'error'); return false; }
  if (typeof bcrypt === 'undefined' || !bcrypt) { toast('Sistem enkripsi belum siap. Refresh halaman.', 'error'); return false; }
  
  const form = e ? e.target : document.getElementById('register-form');
  const _tstEl = form.querySelector('[name="cf-turnstile-response"]');
  const turnstileToken = _tstEl ? _tstEl.value : '';
  if (!turnstileToken) { toast('Selesaikan verifikasi CAPTCHA terlebih dahulu.', 'error'); return false; }

  const btn = $('btn-register');
  btn.innerHTML = '<span class="spin-inline"></span> Mendaftar...';
  btn.disabled = true;

  const fallbackTimer = setTimeout(() => {
    btn.innerHTML = 'Daftar Akun';
    btn.disabled = false;
    toast('Koneksi ke server memakan waktu terlalu lama.', 'error');
  }, 8000);

  try {
    let isClosed = false;
    try {
        const { data: statusData } = await withTimeout(supabaseClient.from('settings').select('value').eq('key', 'web_status').single());
        if (statusData) isClosed = statusData.value === 'closed';
    } catch(e) {}

    if (isClosed) {
      document.getElementById('global-maintenance').style.display = 'flex';
      throw new Error('Web sedang ditutup oleh Admin.');
    }

    const username = $('reg-user').value.trim();
    const email = $('reg-email').value.trim();
    const password = $('reg-pass').value;

    if (username.length < 3) throw new Error('Username minimal 3 karakter');
    if (password.length < 4) throw new Error('Password minimal 4 karakter');

    const userIp = await getIP();
    
    const isVpn = await isVpnOrProxy(userIp);
    if (isVpn) {
        throw new Error('Akses Ditolak: Gunakan koneksi internet biasa (Matikan VPN/Proxy).');
    }

    const { data: bannedIp } = await supabaseClient.from('banned_ips').select('ip').eq('ip', userIp).maybeSingle();
    if (bannedIp) throw new Error('IP Address Anda telah diblokir oleh sistem (Anti-Spam).');

    const { count: ipCount } = await supabaseClient.from('users').select('*', { count: 'exact', head: true }).eq('ip_address', userIp);
    if (ipCount >= 3) {
      throw new Error('Batas maksimal 3 akun per IP Address telah tercapai.');
    }

    const { data: existingUser } = await withTimeout(supabaseClient.from('users').select('username').eq('username', username).single());
    if (existingUser) throw new Error('Username sudah terdaftar');

    const { data: existingEmail } = await withTimeout(supabaseClient.from('users').select('email').eq('email', email).single());
    if (existingEmail) throw new Error('Email sudah terdaftar, gunakan email lain');

    const myReferralCode = 'ZYX-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const { error } = await withTimeout(supabaseClient.from('users').insert([{ 
      username, 
      email, 
      password: hashedPassword, 
      avatar: '', 
      status: 'active', 
      limit_harian: 30, 
      kuota_terpakai: 0, 
      reset_kuota_at: null,
      ip_address: userIp,
      tier: 'Free',
      referral_code: myReferralCode,
      referred_by: null,
      bonus_kuota: 0,
      saldo: 0,
      last_checkin: null,
      total_generated: 0,
      role: 'user'
    }]));
    if (error) throw error;

    $('reg-user').value = ''; $('reg-email').value = ''; $('reg-pass').value = '';
    state.user = { username, email, avatar: '', limit_harian: 30, kuota_terpakai: 0, reset_kuota_at: null, tier: 'Free', bonus_kuota: 0, referral_code: myReferralCode, saldo: 0, last_checkin: null, total_generated: 0 };
    saveUser(state.user);

    fetch('/api/telegram-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: `User Baru Mendaftar!\n\nUsername: ${username}\nEmail: ${email}\nIP: ${userIp}` 
      })
    }).catch(e => console.log('Gagal kirim notif telegram:', e));

    toast('Pendaftaran berhasil!', 'success');
    enterDashboard();

  } catch (error) {
    console.error(error);
    toast(error.message || 'Gagal mendaftar, coba lagi.', 'error');
  } finally {
    clearTimeout(fallbackTimer);
    btn.innerHTML = 'Daftar Akun';
    btn.disabled = false;
  }
  return false;
};

let idleTimer;
const IDLE_TIMEOUT_MS = 600000; 

function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (state.user && !state.user.isAdmin) {
        idleTimer = setTimeout(async () => {
            await logout();
            toast('Sesi berakhir karena tidak ada aktivitas selama 10 menit.', 'error');
        }, IDLE_TIMEOUT_MS);
    }
}

['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, true);
});

async function enterDashboard() {
  showScreen('screen-dashboard');
  showTab('overview');
  renderStats();
  renderHistory();
  renderProfile(); 
  await syncUserData(); 
  loadAnnouncement();
  $('user-name').textContent = state.user.username;
  checkDailyButtonState();
  applyPageAccess();
  if (typeof resetIdleTimer === 'function') resetIdleTimer();
}

async function logout() {
  if (countdownInterval) clearInterval(countdownInterval); 
  if (state.user && state.user.isAdmin) {
    try { await supabaseClient.auth.signOut(); } catch(e) {}
  }

  state.user = null;
  saveUser(null);
  $('login-user').value = ''; $('login-email').value = ''; $('login-pass').value = '';
  if (loginForm) loginForm.style.display = 'block';
  if (registerForm) registerForm.style.display = 'none';
  checkWebStatus();
  showScreen('screen-login');
}
document.querySelectorAll('.logout-btn').forEach(b => b.addEventListener('click', logout));

document.querySelectorAll('#screen-dashboard .nav-item').forEach(btn => {
  btn.addEventListener('click', async () => {
    const t = btn.dataset.tab;
    showTab(t);
    if (t === 'send') { resetSendFlow(); await syncUserData(); }
    if (t === 'bulk') { await syncUserData(); }
    if (t === 'profile') renderProfile();
  });
});
document.querySelector('.user-profile').addEventListener('click', () => {
  showTab('profile'); renderProfile(); window.scrollTo(0,0); 
});
document.querySelectorAll('#screen-dashboard [data-goto]').forEach(el => {
  el.addEventListener('click', async () => {
    const t = el.dataset.goto;
    showTab(t);
    if (t === 'send') { resetSendFlow(); await syncUserData(); }
    if (t === 'bulk') { await syncUserData(); }
  });
});