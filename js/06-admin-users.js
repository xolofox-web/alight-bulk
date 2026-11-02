let myChart = null;
async function loadAdminDashboard() {
  try {
    const { count: userCount } = await supabaseClient.from('users').select('*', { count: 'exact', head: true });
    $('stat-total-users').textContent = userCount || 0;

    const { count: loginCount } = await supabaseClient.from('login_logs').select('*', { count: 'exact', head: true });
    $('stat-total-logins').textContent = loginCount || 0;

    const { count: adminLogCount } = await supabaseClient.from('admin_logs').select('*', { count: 'exact', head: true });
    $('stat-total-admin-logs').textContent = adminLogCount || 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: logs } = await supabaseClient.from('login_logs').select('logged_at').gte('logged_at', sevenDaysAgo.toISOString());
    
    const counts = {};
    for(let i=6; i>=0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        counts[dateStr] = 0;
    }
    
    if (logs) {
        logs.forEach(log => {
            const d = new Date(log.logged_at);
            const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            if (counts[dateStr] !== undefined) counts[dateStr]++;
        });
    }

    const labels = Object.keys(counts);
    const dataPoints = Object.values(counts);

    const ctx = document.getElementById('activityChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Login Pengguna',
                data: dataPoints,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#f4f4f5' } } },
            scales: {
                x: { ticks: { color: '#a1a1aa' }, grid: { color: '#27272a' } },
                y: { ticks: { color: '#a1a1aa', stepSize: 1 }, grid: { color: '#27272a' } }
            }
        }
    });

  } catch (e) {
    console.error('Gagal memuat statistik:', e);
  }
}

async function loadAdminSettings() {
  let isClosed = false;
  try {
    const { data: settings } = await withTimeout(supabaseClient.from('settings').select('key, value'));
    if (settings) {
      settings.forEach(s => {
        if (s.key === 'web_status') isClosed = s.value === 'closed';
        if (s.key === 'maintenance_message') $('maintenance-message-input').value = s.value;
        if (s.key === 'maintenance_start' && s.value) $('maintenance-start-input').value = s.value.slice(0, 16);
        if (s.key === 'maintenance_end' && s.value) $('maintenance-end-input').value = s.value.slice(0, 16);
        if (s.key === 'telegram_token' && s.value) $('telegram-token-input').value = s.value;
        if (s.key === 'telegram_chat_id' && s.value) $('telegram-chat-input').value = s.value;
        if (s.key === 'api_key') {
          $('api-key-input').value = s.value;
          API_KEYS = s.value.split(',').map(k => k.trim()).filter(Boolean);
          if (API_KEYS.length === 0) API_KEYS = ['kayz-r6azlrf2ql6864c6x6uf'];
        }
      });
    }
  } catch (e) {}

  $('web-status-toggle').checked = !isClosed;
  $('web-status-text').textContent = isClosed ? 'Web Ditutup (Maintenance)' : 'Web Terbuka (Aktif)';
  $('web-status-text').style.color = isClosed ? 'var(--danger)' : 'var(--success)';
  renderPageAccessUI();
}

async function renderAdminUsers() {
  try {
    const { data: users, error } = await withTimeout(supabaseClient.from('users').select('username, email, status, limit_harian, ip_address, tier, bonus_kuota'));
    if (error) throw error;
    
    state.allUsers = users || [];
    const filter = $('search-user-input').value.toLowerCase();
    
    const filtered = state.allUsers.filter(u => 
      u.username.toLowerCase().includes(filter) || 
      (u.email && u.email.toLowerCase().includes(filter))
    );

    const totalPages = Math.ceil(filtered.length / usersPerPage) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    
    const startIndex = (state.currentPage - 1) * usersPerPage;
    const paginatedUsers = filtered.slice(startIndex, startIndex + usersPerPage);

    $('admin-users-tbody').innerHTML = paginatedUsers.length ? paginatedUsers.map(acc => {
      const isBanned = acc.status === 'banned';
      const isVip = acc.tier === 'VIP';
      const baseLimit = isVip ? 5000 : 30;
      const totalLimit = baseLimit + (acc.bonus_kuota || 0);
      
      let displayIp = acc.ip_address || 'Unknown';
      if (displayIp === 'Via Telegram Bot') displayIp = 'Bot';
      else if (displayIp !== 'Unknown') displayIp = escapeHtml(displayIp);

      const tierBadge = `<span class="badge-tier ${isVip ? 'vip' : 'free'}">${isVip ? 'VIP' : 'FREE'}</span>`;
      const statusBadge = `<span class="badge-status ${isBanned ? 'banned' : 'active'}">${isBanned ? 'Banned' : 'Active'}</span>`;

      return `
      <tr>
        <td style="text-align: center;"><input type="checkbox" class="user-cb" value="${escapeHtml(acc.username)}" onchange="updateBulkActionVisibility()" style="cursor: pointer;"></td>
        <td><strong style="color: var(--text-main);">${escapeHtml(acc.username)}</strong></td>
        <td class="email-col" title="${escapeHtml(acc.email)}">${escapeHtml(acc.email) || '-'}</td>
        <td>${tierBadge}</td>
        <td>
          <span style="font-family:monospace; font-size:11px; background: var(--bg-base); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); color: var(--text-muted);" title="${escapeHtml(acc.ip_address)}">
            ${displayIp}
          </span>
        </td>
        <td><strong style="color: var(--accent); cursor:pointer;" onclick="openEditModal('${escapeHtml(acc.username)}')">${totalLimit}</strong></td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <div class="action-btns" style="justify-content: flex-end;">
            <button class="btn btn-ghost btn-sm" onclick="openEditModal('${escapeHtml(acc.username)}')" title="Edit">Edit</button>
            <button class="btn ${isBanned ? 'btn-success' : 'btn-danger'} btn-sm" onclick="toggleUserStatus('${escapeHtml(acc.username)}', '${acc.status || 'active'}')">${isBanned ? 'Unban' : 'Ban'}</button>
          </div>
        </td>
      </tr>
    `}).join('') : '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">Tidak ada pengguna ditemukan.</td></tr>';

    $('pagination-info').textContent = `Halaman ${state.currentPage} dari ${totalPages} (Total: ${filtered.length} User)`;
    $('btn-prev-page').disabled = state.currentPage === 1;
    $('btn-next-page').disabled = state.currentPage === totalPages || totalPages === 0;
    
    $('select-all-users').checked = false;
    updateBulkActionVisibility();

  } catch(e) { 
    $('admin-users-tbody').innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">Koneksi lambat. Gagal memuat data.</td></tr>'; 
  }
}

// ============ FUNGSI MANAJEMEN ROLE ============
async function renderAdminRoles() {
  try {
    const { data: users, error } = await withTimeout(supabaseClient.from('users').select('username, email, role'));
    if (error) throw error;
    
    $('admin-roles-tbody').innerHTML = users && users.length ? users.map(u => {
      const isAdminRole = u.role === 'admin';
      return `
      <tr>
        <td><strong style="color: var(--text-main);">${escapeHtml(u.username)}</strong></td>
        <td class="email-col" title="${escapeHtml(u.email)}">${escapeHtml(u.email) || '-'}</td>
        <td><span class="badge-tier ${isAdminRole ? 'vip' : 'free'}">${isAdminRole ? 'ADMIN' : 'USER'}</span></td>
        <td style="text-align: right;">
          <select onchange="updateUserRole('${escapeHtml(u.username)}', this.value)" style="padding: 6px 12px; border-radius: var(--radius-sm); font-size: 12px; background: var(--bg-base); color: var(--text-main); border: 1px solid var(--border-color); cursor: pointer;">
            <option value="user" ${!isAdminRole ? 'selected' : ''}>User</option>
            <option value="admin" ${isAdminRole ? 'selected' : ''}>Admin</option>
          </select>
        </td>
      </tr>
      `;
    }).join('') : '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-muted);">Tidak ada pengguna ditemukan.</td></tr>';
  } catch(e) {
    $('admin-roles-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Gagal memuat data. Pastikan kolom <b>role</b> sudah dibuat di tabel users.</td></tr>';
  }
}

async function updateUserRole(username, newRole) {
  if (!confirm(`Yakin ubah role "${username}" menjadi ${newRole.toUpperCase()}?`)) {
    renderAdminRoles(); // reset dropdown
    return;
  }
  try {
    const { error } = await supabaseClient.from('users').update({ role: newRole }).eq('username', username);
    if (error) throw error;
    toast(`Role ${username} berhasil diubah menjadi ${newRole}`, 'success');
    logAdminAction(`Mengubah role ${username} menjadi ${newRole}`);
    notifyTelegram(`*Update Role!*\nAdmin telah mengubah role user: \`${username}\` menjadi *${newRole.toUpperCase()}*`);
    renderAdminRoles();
  } catch (err) {
    toast('Gagal update role: ' + err.message, 'error');
    renderAdminRoles(); 
  }
}
// ====================================================

function toggleSelectAll(checkbox) {
  const cbs = document.querySelectorAll('.user-cb');
  cbs.forEach(cb => cb.checked = checkbox.checked);
  updateBulkActionVisibility();
}

function updateBulkActionVisibility() {
  const cbs = document.querySelectorAll('.user-cb:checked');
  const count = cbs.length;
  $('selected-count').textContent = count;
  $('bulk-actions').style.display = count > 0 ? 'flex' : 'none';
}

async function executeBulkAction(action) {
  const cbs = document.querySelectorAll('.user-cb:checked');
  const usernames = Array.from(cbs).map(cb => cb.value);
  
  if (usernames.length === 0) return;

  let actionText = '';
  let updates = {};

  if (action === 'ban') {
    actionText = 'memblokir';
    updates = { status: 'banned' };
  } else if (action === 'unban') {
    actionText = 'membuka blokir';
    updates = { status: 'active' };
  } else if (action === 'reset') {
    actionText = 'mereset kuota';
    updates = { kuota_terpakai: 0, reset_kuota_at: null };
  }

  if (!confirm(`Yakin ingin ${actionText} ${usernames.length} user terpilih?`)) return;

  try {
    const { error } = await supabaseClient.from('users').update(updates).in('username', usernames);
    if (error) throw error;
    
    toast(`Berhasil ${actionText} ${usernames.length} user`, 'success');
    logAdminAction(`Bulk Action: ${actionText} ${usernames.length} user`);
    notifyTelegram(`*Bulk Action!*\nAdmin baru saja ${actionText} sebanyak ${usernames.length} user.`);
    renderAdminUsers();
  } catch (err) {
    toast('Gagal bulk action: ' + err.message, 'error');
  }
}

function changePage(direction) {
  state.currentPage += direction;
  renderAdminUsers();
}

function exportUsersToCSV() {
  if (!state.allUsers || !state.allUsers.length) return toast('Tidak ada data untuk diexport', 'error');
  
  let csvContent = "Username,Email,Tier,Status,Limit Harian,Bonus Kuota,IP Address\n";
  state.allUsers.forEach(u => {
    const baseLimit = u.tier === 'VIP' ? 5000 : 30;
    const totalLimit = baseLimit + (u.bonus_kuota || 0);
    csvContent += `"${u.username}","${u.email || ''}","${u.tier || 'Free'}","${u.status || 'active'}","${totalLimit}","${u.bonus_kuota || 0}","${u.ip_address || ''}"\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "zyxell_users.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Data berhasil diexport', 'success');
}

async function toggleUserStatus(username, currentStatus) {
  const newStatus = currentStatus === 'banned' ? 'active' : 'banned';
  const actionText = newStatus === 'banned' ? 'memblokir' : 'membuka blokir';
  
  if (!confirm(`Yakin ingin ${actionText} user "${username}"?`)) return;
  
  try {
    const { error } = await supabaseClient.from('users').update({ status: newStatus }).eq('username', username);
    if (error) throw error;
    toast(`User berhasil di${actionText}`, 'success');
    renderAdminUsers();
    logAdminAction(`${newStatus === 'banned' ? 'Memblokir' : 'Membuka blokir'} user: ${username}`);
    notifyTelegram(`*User Update!*\nAdmin telah ${actionText} user: \`${username}\``);
  } catch (err) {
    toast('Gagal: ' + err.message, 'error');
  }
}

async function openEditModal(username) {
  const user = state.allUsers.find(u => u.username === username);
  if (!user) return;
  
  state.editingUser = username;
  $('edit-user-username').value = username;
  $('edit-user-email').value = user.email || '';
  $('edit-user-tier').value = user.tier || 'Free';
  $('edit-user-bonus').value = user.bonus_kuota || 0;
  $('edit-user-password').value = '';
  
  $('edit-user-modal').style.display = 'flex';
  loadUserTimeline(username);
}

// ============ TAMBAHAN: FUNGSI LOAD TIMELINE USER ============
async function loadUserTimeline(username) {
    const container = document.getElementById('edit-user-timeline');
    if(!container) return;
    
    container.innerHTML = '<div class="spinner" style="width:20px; height:20px; margin:10px auto;"></div>';
    
    try {
        const { data: logs } = await supabaseClient.from('login_logs')
            .select('logged_at, ip_address')
            .eq('username', username)
            .order('logged_at', { ascending: false })
            .limit(5);
            
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p style="font-size:12px; color:var(--text-muted); text-align:center;">Belum ada aktivitas login.</p>';
            return;
        }
        
        let html = '<h4 style="font-size:12px; margin-bottom:8px; color:var(--text-main);">5 Login Terakhir:</h4>';
        logs.forEach(log => {
            const time = new Date(log.logged_at).toLocaleString('id-ID');
            html += `
            <div style="display:flex; justify-content:space-between; font-size:11px; padding:6px 0; border-bottom:1px solid var(--border-color);">
                <span>${time}</span>
                <span style="font-family:monospace; color:var(--text-muted);">${log.ip_address || 'Unknown'}</span>
            </div>`;
        });
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<p style="font-size:12px; color:var(--danger);">Gagal memuat histori.</p>';
    }
}
// ============================================================

function closeEditModal() {
  $('edit-user-modal').style.display = 'none';
  state.editingUser = null;
}

async function saveEditUser() {
  const username = state.editingUser;
  if (!username) return;
  
  const newEmail = $('edit-user-email').value.trim();
  const newTier = $('edit-user-tier').value;
  const newBonus = parseInt($('edit-user-bonus').value) || 0;
  const newPass = $('edit-user-password').value;
  const btn = $('btn-save-edit-user');
  
  if (!newEmail) return toast('Email tidak boleh kosong', 'error');
  if (newPass && newPass.length < 4) return toast('Password minimal 4 karakter', 'error');

  btn.disabled = true;
  btn.innerHTML = '<span class="spin-inline"></span> Menyimpan...';

  try {
    const updates = { 
      email: newEmail, 
      tier: newTier, 
      bonus_kuota: newBonus,
      limit_harian: newTier === 'VIP' ? 5000 : 30 
    };
    
    if (newPass) {
      const salt = bcrypt.genSaltSync(10);
      updates.password = bcrypt.hashSync(newPass, salt);
    }
    
    const { data, error } = await supabaseClient.from('users').update(updates).eq('username', username).select();
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Akses ditolak atau data tidak ditemukan. Pastikan RLS tabel users sudah diatur.");
    }
    
    toast('Data pengguna berhasil diperbarui', 'success');
    closeEditModal();
    renderAdminUsers();
    logAdminAction(`Mengedit user: ${username}, Tier: ${newTier}, Bonus: ${newBonus}`);
    notifyTelegram(`*User Update!*\nAdmin telah mengedit user: \`${username}\`\nTier: ${newTier}\nBonus Kuota: ${newBonus}`);
  } catch (err) {
    toast('Gagal update: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan';
  }
}

async function renderAdminLogs() {
  try {
    const { data: logs, error } = await withTimeout(supabaseClient.from('login_logs').select('username, logged_at, ip_address').order('logged_at', { ascending: false }).limit(50));
    if (error) throw error;

    const history = loadHistory();
    
    $('admin-logs-tbody').innerHTML = logs && logs.length ? logs.map(log => {
      const bulkCount = history.filter(h => h.type === 'bulk' && h.email === log.username).reduce((sum, h) => sum + (h.count || 0), 0);
      return `
        <tr>
          <td><strong>${escapeHtml(log.username)}</strong></td>
          <td>
            <span style="font-family:monospace; font-size:11px;">${escapeHtml(log.ip_address) || 'Unknown'}</span>
            ${log.ip_address !== 'Unknown' ? `<button class="btn btn-danger btn-sm" style="padding: 2px 6px; font-size:10px; margin-left:4px;" onclick="banIP('${escapeHtml(log.ip_address)}')">Ban IP</button>` : ''}
          </td>
          <td>${new Date(log.logged_at).toLocaleString('id-ID')}</td>
          <td>${bulkCount} akun</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="4">Belum ada log.</td></tr>';
  } catch (err) {
    $('admin-logs-tbody').innerHTML = '<tr><td colspan="4">Gagal memuat log.</td></tr>';
  }
}

async function clearLoginLogs() {
  if (!confirm('Hapus semua log login? Tindakan ini tidak bisa dibatalkan.')) return;
  try {
    await supabaseClient.from('login_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    toast('Log login berhasil dihapus', 'success');
    renderAdminLogs();
    logAdminAction('Menghapus semua log login');
  } catch(e) {
    toast('Gagal menghapus log', 'error');
  }
}

async function exportLoginLogs() {
  try {
    const { data: logs } = await supabaseClient.from('login_logs').select('*').order('logged_at', { ascending: false });
    if (!logs || !logs.length) return toast('Tidak ada log untuk diexport', 'error');

    let csvContent = "Username,IP Address,Waktu Login\n";
    logs.forEach(log => {
        csvContent += `"${log.username}","${log.ip_address || ''}","${new Date(log.logged_at).toLocaleString('id-ID')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "zyxell_login_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Log Login berhasil diexport', 'success');
  } catch (e) {
    toast('Gagal export log: ' + e.message, 'error');
  }
}

async function exportAdminLogs() {
  try {
    const { data: logs } = await supabaseClient.from('admin_logs').select('*').order('created_at', { ascending: false });
    if (!logs || !logs.length) return toast('Tidak ada log untuk diexport', 'error');

    let csvContent = "Admin,Tindakan,Waktu\n";
    logs.forEach(log => {
        csvContent += `"${log.admin_username}","${log.action}","${new Date(log.created_at).toLocaleString('id-ID')}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "zyxell_admin_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Log Admin berhasil diexport', 'success');
  } catch (e) {
    toast('Gagal export log: ' + e.message, 'error');
  }
}

async function banIP(ip) {
  if (!confirm(`Yakin ingin memblokir IP ${ip}?`)) return;
  try {
    await supabaseClient.from('banned_ips').insert([{ ip, reason: 'Diban oleh Admin' }]);
    toast(`IP ${ip} berhasil diblokir`, 'success');
    logAdminAction(`Memblokir IP: ${ip}`);
  } catch (err) {
    toast('Gagal memblokir IP: ' + err.message, 'error');
  }
}

async function renderAdminAudit() {
  try {
    const { data: logs, error } = await withTimeout(supabaseClient.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(50));
    if (error) throw error;
    
    $('admin-audit-tbody').innerHTML = logs && logs.length ? logs.map(log => `
      <tr>
        <td><strong>${escapeHtml(log.admin_username)}</strong></td>
        <td>${escapeHtml(log.action)}</td>
        <td>${new Date(log.created_at).toLocaleString('id-ID')}</td>
      </tr>
    `).join('') : '<tr><td colspan="3">Belum ada log admin.</td></tr>';
  } catch(e) {
    $('admin-audit-tbody').innerHTML = '<tr><td colspan="3">Gagal memuat log.</td></tr>';
  }
}

async function clearAdminLogs() {
  if (!confirm('Hapus semua log admin?')) return;
  try {
    await supabaseClient.from('admin_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    toast('Log admin berhasil dihapus', 'success');
    renderAdminAudit();
  } catch(e) {
    toast('Gagal menghapus log', 'error');
  }
}