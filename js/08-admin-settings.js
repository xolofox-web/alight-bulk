$('search-user-input').addEventListener('input', () => {
  state.currentPage = 1;
  renderAdminUsers();
});

$('web-status-toggle').addEventListener('change', async (e) => {
  const isOpen = e.target.checked;
  const newStatus = isOpen ? 'open' : 'closed';
  const toggle = e.target;
  toggle.disabled = true;

  try {
    const { data, error } = await supabaseClient.from('settings').update({ value: newStatus }).eq('key', 'web_status').select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Akses ditolak. Pastikan RLS tabel 'settings' sudah dimatikan.");

    $('web-status-text').textContent = isOpen ? 'Web Terbuka (Aktif)' : 'Web Ditutup (Maintenance)';
    $('web-status-text').style.color = isOpen ? 'var(--success)' : 'var(--danger)';
    toast(isOpen ? 'Web Berhasil Dibuka!' : 'Web Berhasil Ditutup!', isOpen ? 'success' : 'error');
    
    logAdminAction(isOpen ? 'Membuka akses web' : 'Menutup akses web');
    checkWebStatus(); 

    // ============================================================
    // TAMBAHAN: KIRIM NOTIFIKASI KE WHATSAPP (REAL-TIME)
    // ============================================================
    try {
        await fetch('/api/notify-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: newStatus,
                admin_name: state.user ? state.user.username : 'Admin'
            })
        });
    } catch (waErr) {
        console.warn("Gagal mengirim notif ke WhatsApp:", waErr);
    }
    // ============================================================

  } catch (error) {
    toggle.checked = !isOpen; 
    toast('Gagal: ' + error.message, 'error');
  } finally {
    toggle.disabled = false;
  }
});

$('save-maintenance-btn').addEventListener('click', async () => {
  const btn = $('save-maintenance-btn');
  const val = $('maintenance-message-input').value.trim();
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('settings').upsert({ key: 'maintenance_message', value: val });
    if (error) throw error;
    toast('Pesan maintenance disimpan', 'success');
    logAdminAction('Mengubah pesan maintenance');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('save-jadwal-btn').addEventListener('click', async () => {
  const btn = $('save-jadwal-btn');
  const start = $('maintenance-start-input').value;
  const end = $('maintenance-end-input').value;
  btn.disabled = true;
  try {
    await supabaseClient.from('settings').upsert({ key: 'maintenance_start', value: start || null });
    await supabaseClient.from('settings').upsert({ key: 'maintenance_end', value: end || null });
    toast('Jadwal maintenance disimpan', 'success');
    logAdminAction(`Mengatur jadwal maintenance: ${start} s/d ${end}`);
    checkWebStatus();
  } catch (err) {
    toast('Gagal menyimpan jadwal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('save-telegram-btn').addEventListener('click', async () => {
  const btn = $('save-telegram-btn');
  const token = $('telegram-token-input').value.trim();
  const chatId = $('telegram-chat-input').value.trim();
  btn.disabled = true;
  try {
    await supabaseClient.from('settings').upsert({ key: 'telegram_token', value: token });
    await supabaseClient.from('settings').upsert({ key: 'telegram_chat_id', value: chatId });
    toast('Token Telegram disimpan', 'success');
    logAdminAction('Memperbarui Token Telegram');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('test-bot-btn').addEventListener('click', async () => {
  const btn = $('test-bot-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Mengirim...';
  try {
    await notifyTelegram('*Pong!* Koneksi dari Web Panel berhasil.');
    toast('Pesan test dikirim ke Telegram!', 'success');
  } catch (e) {
    toast('Gagal kirim test: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Koneksi Bot';
  }
});

$('backup-telegram-btn').addEventListener('click', async () => {
  const btn = $('backup-telegram-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Memproses...';
  try {
    const { data: users } = await supabaseClient.from('users').select('*');
    const { data: vouchers } = await supabaseClient.from('vouchers').select('*');
    const { data: loginLogs } = await supabaseClient.from('login_logs').select('*');

    const summary = `*BACKUP DATABASE ZYXELL*\n\n` +
      `Total Users: ${users ? users.length : 0}\n` +
      `Total Vouchers: ${vouchers ? vouchers.length : 0}\n` +
      `Total Logins: ${loginLogs ? loginLogs.length : 0}\n\n` +
      `_Waktu: ${new Date().toLocaleString('id-ID')}_\n\n` +
      `_Gunakan fitur Export CSV di Web Panel untuk backup lengkap._`;

    await notifyTelegram(summary);
    toast('Backup ringkasan dikirim ke Telegram!', 'success');
  } catch (err) {
    toast('Gagal backup: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Backup Data ke Telegram';
  }
});

$('set-webhook-btn').addEventListener('click', async () => {
  const btn = $('set-webhook-btn');
  const token = $('telegram-token-input').value.trim();

  if (!token) return toast('Simpan Bot Token terlebih dahulu!', 'error');

  await supabaseClient.from('settings').upsert({ key: 'telegram_token', value: token });

  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Set...';

  try {
    const webhookUrl = `${window.location.origin}/api/telegram-webhook`;
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await res.json();

    if (data.ok) {
      $('webhook-status').innerHTML = `<b style="color:var(--success);">Webhook aktif!</b><br>URL: <code>${webhookUrl}</code>`;
      toast('Webhook Telegram berhasil diaktifkan!', 'success');
      logAdminAction('Mengaktifkan webhook Telegram');
    } else {
      throw new Error(data.description || 'Gagal set webhook');
    }
  } catch (err) {
    $('webhook-status').innerHTML = `<span style="color:var(--danger);">${escapeHtml(err.message)}</span>`;
    toast('Gagal set webhook: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Aktifkan Webhook';
  }
});

async function checkWebhookStatus() {
  const tokenEl = $('telegram-token-input');
  const statusEl = $('webhook-status');
  if (!tokenEl || !statusEl) return;
  const token = tokenEl.value.trim();
  if (!token) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    if (data.ok && data.result.url) {
      statusEl.innerHTML = `Webhook aktif: <code>${data.result.url}</code>`;
    } else {
      statusEl.innerHTML = `Webhook <b>belum aktif</b>. Klik "Aktifkan Webhook".`;
    }
  } catch (e) { }
}

$('view-backend-btn').addEventListener('click', () => {
  const src = $('backend-code-src');
  const display = $('backend-code-display');
  if (!src || !display) return;
  display.textContent = src.value.trim();
  $('backend-code-modal').style.display = 'flex';
});

function copyBackendCode() {
  const src = $('backend-code-src');
  if (!src) return;
  const code = src.value.trim();
  navigator.clipboard.writeText(code)
    .then(() => toast('Backend code berhasil dicopy! Tinggal buat file api/telegram-webhook.js', 'success'))
    .catch(() => toast('Gagal copy — silakan select manual', 'error'));
}

// TAMBAHAN: FUNGSI UNTUK MELIHAT DAN MENCOPY KODE WEBHOOK PAYMENT
const viewPaymentWebhookBtn = $('view-payment-webhook-btn');
if (viewPaymentWebhookBtn) {
  viewPaymentWebhookBtn.addEventListener('click', () => {
    const src = $('payment-webhook-src');
    const display = $('payment-webhook-display');
    if (!src || !display) return;
    display.textContent = src.value.trim();
    $('payment-webhook-modal').style.display = 'flex';
  });
}

function copyPaymentWebhookCode() {
  const src = $('payment-webhook-src');
  if (!src) return;
  const code = src.value.trim();
  navigator.clipboard.writeText(code)
    .then(() => toast('Webhook Payment code berhasil dicopy!', 'success'))
    .catch(() => toast('Gagal copy — silakan select manual', 'error'));
}
// END TAMBAHAN

$('view-email-backend-btn').addEventListener('click', () => {
  const src = $('email-backend-src');
  const display = $('email-backend-display');
  if (!src || !display) return;
  display.textContent = src.value.trim();
  $('email-backend-modal').style.display = 'flex';
});

function copyEmailBackendCode() {
  const src = $('email-backend-src');
  if (!src) return;
  const code = src.value.trim();
  navigator.clipboard.writeText(code)
    .then(() => toast('Email backend code berhasil dicopy!', 'success'))
    .catch(() => toast('Gagal copy — silakan select manual', 'error'));
}

$('save-api-key-btn').addEventListener('click', async () => {
  const btn = $('save-api-key-btn');
  const val = $('api-key-input').value.trim();
  if (!val) return toast('API Key tidak boleh kosong', 'error');
  
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('settings').upsert({ key: 'api_key', value: val });
    if (error) throw error;
    
    API_KEYS = val.split(',').map(k => k.trim()).filter(Boolean);
    if (API_KEYS.length === 0) API_KEYS = ['kayz-r6azlrf2ql6864c6x6uf'];

    toast(`Berhasil menyimpan ${API_KEYS.length} API Key`, 'success');
    logAdminAction(`Memperbarui API Key (Total: ${API_KEYS.length})`);
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('test-api-key-btn').addEventListener('click', async () => {
  const btn = $('test-api-key-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Tes...';
  
  try {
    if (!API_KEYS || API_KEYS.length === 0) throw new Error('API Key belum diatur');
    const selectedKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
    
    let url = new URL(API_PROXY_BASE, window.location.origin);
    url.searchParams.set('path', '/am-test'); 
    url.searchParams.set('apikey', selectedKey);
    
    let res = await fetch(url.toString());
    
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      throw new Error(`API Key Ditolak (HTTP ${res.status})`);
    }
    
    toast('API Key sepertinya valid (Server merespon)', 'success');
  } catch (err) {
    toast('Gagal tes API: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test API';
  }
});

$('save-announcement-btn').addEventListener('click', async () => {
  const btn = $('save-announcement-btn');
  const val = $('announcement-input').value.trim();
  btn.disabled = true;
  try {
    const { error } = await supabaseClient.from('settings').upsert({ key: 'announcement', value: val });
    if (error) throw error;
    toast('Pengumuman disimpan', 'success');
    loadAnnouncement();
    logAdminAction('Mengubah pengumuman dashboard');
  } catch (err) {
    toast('Gagal menyimpan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('admin-account-form').addEventListener('submit', async e => {
  e.preventDefault();
  const currentPass = $('admin-current-pass').value;
  const newPass = $('admin-new-pass').value;
  
  if (!newPass || newPass.length < 6) return toast('Password baru minimal 6 karakter!', 'error');
  
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Menyimpan...';

  try {
    const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
      email: state.user.email,
      password: currentPass
    });
    
    if (verifyError) throw new Error('Password saat ini salah!');
    
    const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPass });
    if (updateError) throw updateError;
    
    toast('Password Admin berhasil diperbarui!', 'success');
    $('admin-account-form').reset();
    logAdminAction('Mengubah password admin');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan Password';
  }
});

document.querySelectorAll('#screen-admin .nav-item').forEach(btn => {
  btn.addEventListener('click', () => showAdminTab(btn.dataset.tab));
});