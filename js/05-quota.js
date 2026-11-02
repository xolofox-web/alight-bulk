let countdownInterval = null;
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    if (!state.user || !state.user.reset_kuota_at) {
      if ($('send-quota-countdown')) $('send-quota-countdown').style.display = 'none';
      if ($('bulk-quota-countdown')) $('bulk-quota-countdown').style.display = 'none';
      return;
    }

    const now = new Date().getTime();
    const resetAt = new Date(state.user.reset_kuota_at).getTime();
    const distance = resetAt - now;

    if (distance < 0) {
      clearInterval(countdownInterval);
      if ($('send-quota-countdown')) $('send-quota-countdown').style.display = 'none';
      if ($('bulk-quota-countdown')) $('bulk-quota-countdown').style.display = 'none';
      checkAndResetQuota(); 
      return;
    }

    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
    const timeStr = `Reset dalam: ${hours}j ${minutes}m ${seconds}s`;
    
    if ($('send-quota-countdown')) {
      $('send-quota-countdown').textContent = timeStr;
      $('send-quota-countdown').style.display = 'block';
    }
    if ($('bulk-quota-countdown')) {
      $('bulk-quota-countdown').textContent = timeStr;
      $('bulk-quota-countdown').style.display = 'block';
    }
  }, 1000);
}

async function syncUserData() {
  if (!state.user || state.user.isAdmin) return;
  try {
    const { data, error } = await supabaseClient.from('users')
      .select('status, device_id, limit_harian, kuota_terpakai, reset_kuota_at, tier, bonus_kuota, referral_code, vip_expired_at, saldo, last_checkin, total_generated')
      .eq('username', state.user.username)
      .single();
      
    if (!error && data) {
      if (data.device_id && data.device_id !== myDeviceId) {
        forceLogout('Sesi berakhir: Akun Anda telah login di perangkat lain.');
        return;
      }

      if (data.status === 'banned') {
        forceLogout('Akun Anda telah diblokir oleh Admin.');
        return;
      }

      if (data.tier === 'VIP' && data.vip_expired_at && new Date() > new Date(data.vip_expired_at)) {
        data.tier = 'Free';
        data.limit_harian = 30;
        data.vip_expired_at = null;
        await supabaseClient.from('users').update({ tier: 'Free', limit_harian: 30, vip_expired_at: null }).eq('username', state.user.username);
        toast('Masa aktif VIP Anda telah berakhir.', 'error');
      }
      
      state.user.limit_harian = data.limit_harian || 30;
      state.user.kuota_terpakai = data.kuota_terpakai || 0;
      state.user.reset_kuota_at = data.reset_kuota_at;
      state.user.tier = data.tier || 'Free';
      state.user.bonus_kuota = data.bonus_kuota || 0;
      state.user.referral_code = data.referral_code || '';
      state.user.vip_expired_at = data.vip_expired_at;
      state.user.saldo = data.saldo || 0;
      state.user.last_checkin = data.last_checkin;
      state.user.total_generated = data.total_generated || 0;
      
      saveUser(state.user);
      await checkAndResetQuota();
      checkDailyButtonState();
    }
  } catch (err) {
    console.warn('Gagal sinkronisasi data user:', err);
  }
}

async function checkAndResetQuota() {
  if (!state.user) return;
  const resetAt = state.user.reset_kuota_at;
  if (resetAt && new Date() >= new Date(resetAt)) {
    state.user.kuota_terpakai = 0;
    state.user.reset_kuota_at = null;
    saveUser(state.user);
    try {
      await supabaseClient.from('users').update({ kuota_terpakai: 0, reset_kuota_at: null }).eq('username', state.user.username);
    } catch(e) { console.error('Gagal reset kuota di DB', e); }
  }
  renderUserQuota();
  startCountdown();
}

async function deductQuota(amount) {
  if (!state.user) return;
  const baseLimit = state.user.tier === 'VIP' ? 5000 : 30;
  const totalLimit = baseLimit + (state.user.bonus_kuota || 0);
  const currentUsed = state.user.kuota_terpakai || 0;
  const newUsed = currentUsed + amount;
  let resetAt = state.user.reset_kuota_at;

  if (newUsed >= totalLimit && !resetAt) {
    resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  state.user.kuota_terpakai = newUsed;
  state.user.reset_kuota_at = resetAt;
  state.user.total_generated = (state.user.total_generated || 0) + amount;
  saveUser(state.user);

  try {
    await supabaseClient.from('users').update({
      kuota_terpakai: newUsed,
      reset_kuota_at: resetAt,
      total_generated: state.user.total_generated
    }).eq('username', state.user.username);
  } catch (e) {
    console.error('Gagal sinkronisasi kuota ke DB', e);
  }
  renderUserQuota();
  startCountdown();
}

function renderUserQuota() {
  if (!state.user) return;
  const baseLimit = state.user.tier === 'VIP' ? 5000 : 30;
  const totalLimit = baseLimit + (state.user.bonus_kuota || 0);
  const used = state.user.kuota_terpakai || 0;
  const remaining = Math.max(0, totalLimit - used);

  const sendRemEl = document.getElementById('send-quota-remaining');
  const sendLimEl = document.getElementById('send-quota-limit');
  if (sendRemEl && sendLimEl) {
    sendRemEl.textContent = remaining;
    sendLimEl.textContent = totalLimit;
    sendRemEl.parentElement.style.color = remaining === 0 ? 'var(--danger)' : 'var(--accent)';
    sendRemEl.parentElement.style.borderColor = remaining === 0 ? 'var(--danger)' : 'rgba(99, 102, 241, 0.3)';
    sendRemEl.parentElement.style.background = remaining === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)';
  }

  const bulkRemEl = document.getElementById('bulk-quota-remaining');
  const bulkLimEl = document.getElementById('bulk-quota-limit');
  if (bulkRemEl && bulkLimEl) {
    bulkRemEl.textContent = remaining;
    bulkLimEl.textContent = totalLimit;
    bulkRemEl.parentElement.style.color = remaining === 0 ? 'var(--danger)' : 'var(--accent)';
    bulkRemEl.parentElement.style.borderColor = remaining === 0 ? 'var(--danger)' : 'rgba(99, 102, 241, 0.3)';
    bulkRemEl.parentElement.style.background = remaining === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)';
  }
  
  if ($('profile-bonus-kuota')) $('profile-bonus-kuota').textContent = state.user.bonus_kuota || 0;
  if ($('user-tier-badge')) {
    $('user-tier-badge').textContent = state.user.tier || 'Free';
    $('user-tier-badge').style.color = state.user.tier === 'VIP' ? 'var(--success)' : 'var(--text-muted)';
    $('user-tier-badge').style.fontWeight = state.user.tier === 'VIP' ? 'bold' : 'normal';
  }
}

async function redeemVoucher() {
  const code = $('redeem-voucher-input').value.trim().toUpperCase();
  if (!code) return toast('Masukkan kode voucher', 'error');
  
  const btn = $('redeem-voucher-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Proses...';

  try {
    const { data: voucher, error } = await supabaseClient.from('vouchers').select('*').eq('code', code).single();
    if (error || !voucher) throw new Error('Kode voucher tidak valid atau tidak ditemukan.');
    if (voucher.current_uses >= voucher.max_uses) throw new Error('Kuota voucher ini sudah habis.');

    let updates = {};
    let msg = '';
    if (voucher.reward_type === 'kuota') {
      updates.bonus_kuota = (state.user.bonus_kuota || 0) + voucher.reward_amount;
      msg = `Berhasil menambahkan ${voucher.reward_amount} kuota!`;
    } else if (voucher.reward_type === 'vip') {
      updates.tier = 'VIP';
      updates.limit_harian = 5000;
      updates.vip_expired_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      msg = 'Berhasil upgrade ke VIP selama 30 hari!';
    }

    const { error: updateErr } = await supabaseClient.from('users').update(updates).eq('username', state.user.username);
    if (updateErr) throw updateErr;

    await supabaseClient.from('voucher_redemptions').insert([{ voucher_code: code, username: state.user.username }]);
    await supabaseClient.from('vouchers').update({ current_uses: voucher.current_uses + 1 }).eq('code', code);

    state.user.bonus_kuota = updates.bonus_kuota || state.user.bonus_kuota;
    state.user.tier = updates.tier || state.user.tier;
    state.user.limit_harian = updates.limit_harian || state.user.limit_harian;
    state.user.vip_expired_at = updates.vip_expired_at || state.user.vip_expired_at;
    saveUser(state.user);
    
    renderUserQuota();
    $('redeem-voucher-input').value = '';
    toast(msg, 'success');

  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Tukar';
  }
}